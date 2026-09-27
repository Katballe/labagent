// The LabAgent Cloudflare agent (Agents SDK, one Durable Object per instance).
//
//   • Session instances (name "s-…", one per browser session) answer T1/T2/T3
//     requests with the shared pipeline and a pinned Workers AI model, and keep
//     that session's append-only, hash-chained audit ledger in their SQLite.
//   • The "monitor" instance is never reachable over HTTP. It keeps aggregate
//     counters (answers, refusals, withheld outputs, human-review verdicts,
//     out-of-corpus terms), enforces the daily AI budget, and runs a scheduled
//     self-check — EU GMP Annex 22 §10.3–10.5 (draft).
//
// Decisions stay deterministic; the model only does non-critical work that a
// person reviews (see src/ai/pipeline.js and docs/validation/intended-use.md).

import { Agent, getAgentByName } from "agents";
import * as P from "../src/ai/pipeline.js";
import { validateSelect } from "../src/ai/sqlcore.js";
import { checkDocCitations } from "../src/ai/citations.js";
import { OOS_STEPS } from "../src/data/dataset.js";
import { makeEntry, verifyChain } from "../src/lib/audit.js";
import { configFingerprint, CLOUD_MODEL, GENERATION, DEFAULT_THRESHOLD, APP_VERSION } from "../src/compliance/config.js";
import { PROMPT_VERSION } from "../src/ai/prompts.js";
import { runSuite } from "../src/evals/runner.js";
import { workersAiLlm } from "./llm.js";
import { execReadOnly, rawExec, GUARD } from "./db.js";
import { accessIdentity } from "./access.js";

export const MONITOR = "monitor";
const CLIENT_KINDS = new Set(["T3", "REVIEW", "SYS", "EVAL"]);
const clip = (s, n) => String(s ?? "").slice(0, n);
const today = () => new Date().toISOString().slice(0, 10);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export class LabAgent extends Agent {
  #queue = Promise.resolve();

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS ledger (seq INTEGER PRIMARY KEY, entry TEXT NOT NULL)`;
    if (this.name === MONITOR) {
      this.sql`CREATE TABLE IF NOT EXISTS counters (day TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, key))`;
      this.sql`CREATE TABLE IF NOT EXISTS terms (day TEXT NOT NULL, term TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, term))`;
      this.sql`CREATE TABLE IF NOT EXISTS checks (at TEXT PRIMARY KEY, result TEXT NOT NULL)`;
      await this.schedule("15 3 * * *", "selfCheck"); // daily 03:15 UTC; cron schedules are idempotent
    }
  }

  // ---- HTTP: session instances only ---------------------------------------
  async onRequest(request) {
    if (this.name === MONITOR) return json({ error: "not found" }, 404);
    const action = new URL(request.url).pathname.split("/").pop();
    try {
      if (request.method === "GET" && action === "audit") return json(await this.auditView());
      if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
      const body = await request.json().catch(() => ({}));
      const who = await this.actorOf(request, body);
      const handler = { ask: this.ask, query: this.query, sql: this.rawSql, triage: this.triage, event: this.event, review: this.review }[action];
      if (!handler) return json({ error: "not found" }, 404);
      return json(await handler.call(this, body, who));
    } catch (e) {
      return json({ error: `agent error: ${e?.message || e}` }, e?.status || 500);
    }
  }

  async actorOf(request, body) {
    const email = await accessIdentity(request, this.env);
    if (email) return { actor: email, verified: true };
    const name = clip(body?.reviewer, 40).replace(/[^\p{L}\p{N} ._@'-]/gu, "").trim() || "demo-user";
    return { actor: `${name} (unverified)`, verified: false };
  }

  // ---- audit ledger (append-only, hash-chained, serialised) ----------------
  append(fields) {
    const write = async () => {
      const last = this.sql`SELECT entry FROM ledger ORDER BY seq DESC LIMIT 1`[0];
      const entry = await makeEntry(last ? JSON.parse(last.entry) : undefined, fields);
      this.sql`INSERT INTO ledger (seq, entry) VALUES (${entry.seq}, ${JSON.stringify(entry)})`;
      return entry;
    };
    const p = this.#queue.then(write, write);
    this.#queue = p.catch(() => {});
    return p;
  }

  async auditView() {
    const entries = this.sql`SELECT entry FROM ledger ORDER BY seq`.map((r) => JSON.parse(r.entry));
    return { entries, verification: await verifyChain(entries), ledger: "cloudflare-agent" };
  }

  async context(extra) {
    const v = this.env.CF_VERSION_METADATA;
    return JSON.stringify({ ...extra, config: await configFingerprint(), app: APP_VERSION, worker: v ? { id: v.id, tag: v.tag || null } : null });
  }

  // ---- model access: budget, fallback ---------------------------------------
  async monitor() {
    return getAgentByName(this.env.LabAgent, MONITOR);
  }

  // The model, wrapped so the daily budget is only spent when the pipeline
  // actually calls it (refusals and template queries never do).
  modelFor() {
    const llm = workersAiLlm(this.env);
    if (!llm) return null;
    const cap = Number(this.env.LLM_DAILY_CAP || 1500);
    return {
      ...llm,
      chat: async (opts) => {
        if (!(await (await this.monitor()).takeBudget(cap))) throw Object.assign(new Error("budget"), { budget: true });
        return llm.chat(opts);
      },
    };
  }

  /** Runs with the model; on budget exhaustion or model failure, deterministically instead. */
  async withModel(run) {
    const llm = this.modelFor();
    let calls = 0;
    const counted = llm && { ...llm, chat: (o) => { calls++; return llm.chat(o); } };
    try {
      const res = await run(counted);
      return { res, llm: calls ? llm : null, note: null };
    } catch (e) {
      if (!llm) throw e;
      const note = e.budget
        ? "Today's AI budget is used up, so this was answered deterministically (verbatim sources)."
        : `The AI model was unavailable (${clip(e?.message, 120)}), so this was answered deterministically.`;
      return { res: await run(null), llm: null, note };
    }
  }

  modelDesc(llm) {
    return llm ? { id: CLOUD_MODEL.id, temperature: GENERATION.temperature, seed: GENERATION.seed } : null;
  }

  async report(event) {
    try { await (await this.monitor()).record(event); } catch { /* monitoring must never block an answer */ }
  }

  // ---- T1 ------------------------------------------------------------------
  async ask(body, who) {
    const question = clip(body.question, 500).trim();
    if (!question) return { error: "empty question" };
    const threshold = Math.min(0.9, Math.max(0.3, Number(body.threshold) || DEFAULT_THRESHOLD));
    // CR-007: worklist questions and database-only questions are answered from
    // validated read-only queries; everything else goes through the SOP path.
    const { res, llm, note } = await this.withModel((m) => P.ask({ question, threshold, llm: m, exec: execReadOnly, guard: GUARD }));
    if (res.kind !== "sop") {
      const queries = res.kind === "worklist"
        ? res.sections.map((s) => ({ key: s.key, sql: s.sql, rows: s.rows.length, error: s.error || null }))
        : [{ template: res.template, sql: res.sql, rows: res.rows.length }];
      const summary = res.kind === "worklist"
        ? `open items — ${res.sections.map((s) => `${s.key} ${s.rows.length}`).join(", ")}`
        : `SOPs refused (${res.sop.reason}) → validated template “${res.template}”, ${res.rows.length} row(s)`;
      const entry = await this.append({
        actor: who.actor, kind: "T1", action: `QA: "${clip(question, 56)}" — ${summary}`,
        model: "deterministic", prompt: PROMPT_VERSION,
        content: await this.context({ question, route: res.route, decision: res.decision, answer: res.text, queries, actorVerified: who.verified }),
      });
      await this.report({ kind: "t1", decision: res.decision, reason: res.route, generative: false });
      return { ...res, auditId: entry.id, engine: "deterministic", note };
    }
    const outcome = res.refused ? `UNDECIDED (${res.reason})` : `answered, ${res.cites.length} citation(s): ${res.cites.map((c) => c.doc).join(", ")}${res.conflict ? " · conflict surfaced" : ""}`;
    const entry = await this.append({
      actor: who.actor, kind: "T1", action: `QA: "${clip(question, 56)}" — ${outcome}`,
      model: llm ? CLOUD_MODEL.id : "deterministic", prompt: PROMPT_VERSION,
      content: await this.context({
        question, decision: res.decision, reason: res.reason || null, answer: res.text, withheld: res.withheld || null,
        confidence: +res.confidence.toFixed(3), threshold, retrieved: res.retrieved,
        cited: res.cites.map(({ doc, sec, score, matched }) => ({ doc, sec, score: +score.toFixed(3), matched })),
        conflict: res.conflict, model: this.modelDesc(llm), actorVerified: who.verified,
      }),
    });
    await this.report({ kind: "t1", decision: res.decision, reason: res.reason, unknown: res.unknown, generative: !!llm });
    return { ...res, auditId: entry.id, engine: llm ? CLOUD_MODEL.id : "deterministic", note };
  }

  // ---- T2 ------------------------------------------------------------------
  async query(body, who) {
    const question = clip(body.question, 500).trim();
    if (!question) return { error: "empty question" };
    const { res, llm, note } = await this.withModel((m) => P.runDataQuery({ question, llm: m, exec: execReadOnly, guard: GUARD }));
    const outcome = res.ok ? `${res.rows.length} row(s), read-only${res.validated ? "" : ", UNVALIDATED query"}` : res.refused ? "declined — asks to change data" : res.rejected ? "REJECTED by read-only guard" : res.error ? "error" : "no query generated";
    const entry = await this.append({
      actor: who.actor, kind: "T2", action: `Query: "${clip(question, 56)}" — ${outcome}`,
      model: res.source === "model" ? CLOUD_MODEL.id : "deterministic", prompt: PROMPT_VERSION,
      content: await this.context({ question, source: res.source, validated: res.validated, template: res.template || null, sql: res.sql, rows: res.ok ? res.rows.length : 0, note: res.note, model: res.source === "model" ? this.modelDesc(llm) : null, actorVerified: who.verified }),
    });
    await this.report({ kind: "t2", decision: res.ok ? "ANSWERED" : "UNDECIDED", reason: res.rejected ? "rejected" : res.refused ? "write-request" : res.source, generative: res.source === "model" });
    return { ...res, auditId: entry.id, note: note ? `${res.note} · ${note}` : res.note };
  }

  async rawSql(body, who) {
    const sql = clip(body.sql, 4000);
    const v = validateSelect(sql, GUARD);
    let res;
    if (!v.ok) res = { ok: false, sql, how: "typed by you", cols: [], rows: [], note: `Rejected by the read-only guard: ${v.reason}. Nothing executed.`, rejected: true };
    else {
      try {
        const r = await execReadOnly(v.sql);
        res = { ok: true, sql: v.sql, how: "typed by you", cols: r.cols, rows: r.rows, note: `${r.total} row${r.total === 1 ? "" : "s"}${r.truncated ? ` (first ${r.rows.length} shown)` : ""} · read-only · executed by the agent` };
      } catch (e) {
        res = { ok: false, sql: v.sql, how: "typed by you", cols: [], rows: [], note: `SQL error: ${e.message}. Nothing written (read-only).`, error: true };
      }
    }
    const entry = await this.append({
      actor: who.actor, kind: "T2", action: `Raw SQL by operator — ${res.ok ? `${res.rows.length} row(s), read-only` : res.rejected ? "REJECTED by read-only guard" : "error"}`,
      model: "—", prompt: PROMPT_VERSION, content: await this.context({ sql, note: res.note, actorVerified: who.verified }),
    });
    return { ...res, auditId: entry.id };
  }

  // ---- T3 (explanations only; the record itself is fixed text) -------------
  async triage(body, who) {
    const question = clip(body.question, 500).trim();
    if (!question) return { error: "empty question" };
    const steps = OOS_STEPS.map((s) => ({ ...s }));
    const { res, llm, note } = await this.withModel((m) => P.triageAnswer({ question, steps, llm: m }));
    const entry = await this.append({
      actor: who.actor, kind: "T3", action: `Triage assistant: "${clip(question, 50)}" — ${res.withheld ? "model answer withheld (record-id check)" : res.refused ? "declined (outside gathered evidence)" : "answered from gathered evidence"}`,
      model: llm ? CLOUD_MODEL.id : "deterministic", prompt: PROMPT_VERSION,
      content: await this.context({ question, decision: res.decision, answer: res.text, withheld: res.withheld || null, sources: res.sources || null, model: this.modelDesc(llm), actorVerified: who.verified }),
    });
    await this.report({ kind: "t3", decision: res.decision, reason: res.withheld ? "withheld" : null, generative: !!llm });
    return { ...res, auditId: entry.id, note };
  }

  // ---- client-originated events (workflow steps, approvals, reviews) -------
  async event(body, who) {
    const kind = String(body.kind || "");
    if (!CLIENT_KINDS.has(kind)) return { error: `event kind must be one of ${[...CLIENT_KINDS].join(", ")}` };
    const entry = await this.append({
      actor: who.actor, kind, action: clip(body.action, 300), model: "—", prompt: PROMPT_VERSION,
      content: await this.context({ recordedFor: "client event", detail: clip(body.content, 4000), actorVerified: who.verified }),
    });
    return { auditId: entry.id };
  }

  /** Human-in-the-loop verdict on an earlier answer (Annex 22 §10.5). */
  async review(body, who) {
    const ref = String(body.ref || "");
    const verdict = body.verdict === "confirmed" || body.verdict === "incorrect" ? body.verdict : null;
    if (!/^AUD-\d{5}$/.test(ref) || !verdict) return { error: "review needs ref (AUD-00000) and verdict (confirmed | incorrect)" };
    const reviewed = this.sql`SELECT entry FROM ledger WHERE seq = ${Number(ref.slice(4))}`[0];
    if (!reviewed) return { error: `${ref} is not in this session's audit trail` };
    const target = JSON.parse(reviewed.entry);
    const entry = await this.append({
      actor: who.actor, kind: "REVIEW", action: `Human review of ${ref} (${target.kind}): ${verdict.toUpperCase()}${body.note ? " · note recorded" : ""}`,
      model: "—", prompt: PROMPT_VERSION,
      content: await this.context({ ref, refHash: target.hash, verdict, note: clip(body.note, 1000), reviewedModel: target.model, actorVerified: who.verified }),
    });
    await this.report({ kind: "review", decision: verdict, generative: target.model !== "deterministic" && target.model !== "—" });
    return { auditId: entry.id };
  }

  // ---- monitor instance: RPC only --------------------------------------------
  bump(key, by = 1) {
    this.sql`INSERT INTO counters (day, key, n) VALUES (${today()}, ${key}, ${by}) ON CONFLICT(day, key) DO UPDATE SET n = n + ${by}`;
  }

  takeBudget(cap) {
    const used = this.sql`SELECT n FROM counters WHERE day = ${today()} AND key = 'llm-calls'`[0]?.n || 0;
    if (used >= cap) { this.bump("llm-budget-exhausted"); return false; }
    this.bump("llm-calls");
    return true;
  }

  record(e) {
    this.bump(`${e.kind}:${String(e.decision || "").toLowerCase()}`);
    if (e.reason) this.bump(`${e.kind}:reason:${e.reason}`);
    if (e.generative) this.bump(`${e.kind}:generative`);
    // Input sample-space monitoring (Annex 22 §10.4): words asked about that the corpus lacks.
    for (const t of (e.unknown || []).slice(0, 5)) {
      const term = clip(String(t).toLowerCase(), 30);
      this.sql`INSERT INTO terms (day, term, n) VALUES (${today()}, ${term}, 1) ON CONFLICT(day, term) DO UPDATE SET n = n + 1`;
    }
  }

  async status() {
    const since = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
    const days = {};
    for (const r of this.sql`SELECT day, key, n FROM counters WHERE day >= ${since} ORDER BY day`) (days[r.day] ??= {})[r.key] = r.n;
    const week = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const terms = this.sql`SELECT term, SUM(n) AS n FROM terms WHERE day >= ${week} GROUP BY term ORDER BY n DESC LIMIT 15`;
    const checks = this.sql`SELECT at, result FROM checks ORDER BY at DESC LIMIT 10`.map((r) => ({ at: r.at, ...JSON.parse(r.result) }));
    return {
      model: CLOUD_MODEL, generation: GENERATION, config: await configFingerprint(), app: APP_VERSION, prompt: PROMPT_VERSION,
      llm: !!workersAiLlm(this.env), dailyCap: Number(this.env.LLM_DAILY_CAP || 1500), days, unknownTerms: terms, checks,
    };
  }

  /** Scheduled daily (and on demand, at most hourly): the deterministic suite + a model determinism probe. */
  async selfCheck() {
    const last = this.sql`SELECT at FROM checks ORDER BY at DESC LIMIT 1`[0];
    if (last && Date.now() - Date.parse(last.at) < 3600_000) return { skipped: "ran within the last hour", at: last.at };
    const at = new Date().toISOString();
    const suite = await runSuite({ where: "agent", exec: execReadOnly, rawExec });
    const result = {
      config: await configFingerprint(),
      worker: this.env.CF_VERSION_METADATA ? { id: this.env.CF_VERSION_METADATA.id, tag: this.env.CF_VERSION_METADATA.tag || null } : null,
      suite: { passed: suite.passed, total: suite.cases.length, failed: suite.cases.filter((c) => !c.pass).map((c) => `${c.cat}: ${c.name}`).slice(0, 20),
        categories: suite.categories.map((c) => ({ key: c.key, passed: c.passed, n: c.n, pass: c.pass })) },
      determinism: await this.determinismProbe(),
    };
    this.sql`INSERT INTO checks (at, result) VALUES (${at}, ${JSON.stringify(result)})`;
    return { at, ...result };
  }

  // Same question, same pinned settings, twice: does the model give the same, still-cited answer?
  async determinismProbe() {
    const llm = workersAiLlm(this.env);
    if (!llm) return { skipped: "no AI binding" };
    const question = "What's the acceptance criterion for dissolution in method MV-0412?";
    try {
      const a = await P.answerQuestion({ question, llm });
      const b = await P.answerQuestion({ question, llm });
      this.bump("llm-calls", 2);
      const cited = !a.refused && checkDocCitations(a.text, a.cites.map((c) => c.doc)).ok;
      return { model: CLOUD_MODEL.id, identical: a.text === b.text, cited, decisionA: a.decision, decisionB: b.decision };
    } catch (e) {
      return { model: CLOUD_MODEL.id, error: clip(e?.message, 200) };
    }
  }
}
