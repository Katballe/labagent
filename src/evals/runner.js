// Runs an eval suite against the real pipeline (src/ai/pipeline.js).
// Environment-specific pieces are passed in:
//   exec(sql)    runs a validated SELECT (worker in the browser, sql.js in Node / the agent)
//   rawExec(sql) bypasses the guard to prove the engine itself is read-only (Node, agent)
//   runaway(sql) exercises the query timeout (browser)
//   llm          optional language model; absent = deterministic instant mode
//   suite        the case module: the development set (cases.js, default) or the held-out test set
//
// T1 cases also record `truth` (answer | refuse) and `got` (answered | undecided)
// so a confusion matrix can be computed (EU GMP Annex 22 §4.1, draft).

import * as DEV from "./cases.js";
import { answerQuestion, ask, runDataQuery, stepFinding, triageAnswer } from "../ai/pipeline.js";
import { OPEN_ITEMS } from "../ai/route.js";
import { checkDocCitations, checkRecordIds, baseDoc, DOC_ID, RECORD_ID } from "../ai/citations.js";
import { validateSelect } from "../ai/sqlcore.js";
import { CORPUS, OOS_CASE, OOS_STEPS, OOS_DRAFT, SUGGESTED } from "../data/dataset.js";
import { KNOWLEDGE } from "../data/knowledge.js";
import { ROWS } from "../data/seed.js";
import { makeEntry, verifyChain } from "../lib/audit.js";
import { workersAiLlm } from "../../worker/llm.js";
import { CLOUD_MODEL, GENERATION } from "../compliance/config.js";

const setEq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const uniq = (xs) => [...new Set(xs)];
const secOf = (x) => `${x.doc} ${x.sec.split(" ")[0]}`;

async function factual(c, llm) {
  const r = await answerQuestion({ question: c.q, llm });
  const cited = uniq(r.cites.map((x) => baseDoc(x.doc)));
  const docOk = c.docs.some((d) => cited.includes(d));
  const secOk = !c.sec || r.cites.some((x) => c.docs.includes(baseDoc(x.doc)) && x.sec.startsWith(c.sec));
  const pass = !r.refused && docOk && secOk && r.cites.length <= (c.maxQuotes || 2);
  return {
    pass, truth: "answer", got: r.refused ? "undecided" : "answered", citeOk: !r.refused && docOk && secOk, group: c.group, confidence: r.confidence,
    detail: r.refused ? `refused (${r.reason}, confidence ${r.confidence.toFixed(2)})` : `cited ${r.cites.map(secOf).join(", ") || "nothing"}`,
  };
}

async function refusal(c, llm) {
  const q = typeof c === "string" ? c : c.q;
  const r = await answerQuestion({ question: q, llm });
  return {
    pass: r.refused, truth: "refuse", got: r.refused ? "undecided" : "answered", group: c.group, confidence: r.confidence,
    detail: r.refused ? `refused (${r.reason})` : `answered, citing ${uniq(r.cites.map((x) => x.doc)).join(", ")}`,
  };
}

async function superseded(c, llm) {
  const q = typeof c === "string" ? c : c.q;
  const r = await answerQuestion({ question: q, llm });
  const docs = uniq(r.cites.map((x) => x.doc));
  const pass = !r.refused && docs.length > 0 && r.cites.every((x) => x.doc === "SOP-QA-0102" && x.sec.startsWith("§7.3")) && !!r.conflict;
  return { pass, truth: "answer", got: r.refused ? "undecided" : "answered", citeOk: pass, group: "superseded", detail: r.refused ? `refused (${r.reason})` : `cited ${r.cites.map(secOf).join(", ")}; conflict ${r.conflict ? "surfaced" : "NOT surfaced"}` };
}

function citation(c) {
  const res = c.kind === "doc" ? checkDocCitations(c.answer, c.given) : checkRecordIds(c.answer, c.evidence);
  return { pass: res.ok === c.ok, detail: res.ok ? "accepted" : `withheld — ${res.reason}` };
}

async function nl2sql(c, exec, llm) {
  const r = await runDataQuery({ question: c.q, exec, llm });
  if (c.ids === null) {
    const pass = !r.ok && (!c.refusedWrite || !!r.refused);
    return { pass, group: c.group, detail: r.ok ? `ran a query (${r.rows.length} rows) instead of declining` : r.refused ? "declined — read-only" : "declined — no query" };
  }
  if (!r.ok) return { pass: false, group: c.group, detail: r.note };
  const i = r.cols.indexOf(c.col);
  if (i < 0) return { pass: false, group: c.group, detail: `no column ${c.col} (got ${r.cols.join(", ")})` };
  const got = uniq(r.rows.map((row) => row[i]));
  return { pass: setEq(got, c.ids), group: c.group, detail: `${c.col}: ${got.join(", ") || "none"}${r.validated ? "" : " (unvalidated)"}` };
}

// CR-007: which way the Document QA answers, and with what.
async function routing(c, exec) {
  const r = await ask({ question: c.q, exec });
  const got = r.kind === "sop" ? (r.refused ? "refused" : "sop") : r.kind;
  let pass = c.expect === "not-worklist" ? got !== "worklist" : got === c.expect;
  let detail = got === "data" ? `data · ${r.template}` : got;
  if (pass && c.has) {
    const listed = JSON.stringify(r.sections.map((s) => s.rows));
    const missing = c.has.filter((id) => !listed.includes(id));
    pass = !missing.length;
    detail += missing.length ? `; missing ${missing.join(", ")}` : `; lists ${c.has.join(", ")}`;
  }
  if (pass && c.template) { pass = r.template === c.template; }
  if (pass && c.ids) {
    const i = r.cols.indexOf(c.col);
    const ids = uniq(r.rows.map((row) => row[i]));
    pass = setEq(ids, c.ids);
    detail += `; ${c.col}: ${ids.join(", ") || "none"}`;
  }
  if (pass && c.text) { pass = r.text.includes(c.text); if (!pass) detail += `; text lacks “${c.text}”`; }
  return { pass, detail };
}

// The model path, driven by a scripted stand-in: `reply` is what the "model" says.
function scripted(reply) {
  const llm = { label: "scripted-model", calls: 0, chat: async ({ onToken }) => { llm.calls++; onToken?.(reply); return reply; } };
  return llm;
}

async function modelPath(c, exec) {
  const llm = scripted(c.reply);
  const steps = OOS_STEPS.map((s) => ({ ...s }));
  let res, got;
  if (c.kind === "qa") {
    res = await answerQuestion({ question: c.q, llm });
    got = res.withheld ? "withheld" : res.refused ? "refused" : "answered";
    if (c.cites && got === "answered") {
      const shown = res.cites.map((x) => `${x.doc} ${x.sec.split(" ")[0]}`);
      if (shown.length !== c.cites.length || !c.cites.every((x) => shown.includes(x))) got += ` (cited ${shown.join(", ")})`;
    }
  } else if (c.kind === "sql") {
    res = await runDataQuery({ question: c.q, exec, llm });
    got = res.ok ? `rows:${res.rows.length}` : res.rejected ? "rejected" : res.refused ? "refused" : "noquery";
    if (res.ok && res.source === "model" && res.validated !== false) got += " (NOT flagged unvalidated)";
  } else if (c.kind === "step") {
    // A step finding is part of the critical record: no model may be involved.
    const findings = OOS_STEPS.map((s) => stepFinding(s));
    const fixed = findings.every((f, i) => f.source === "fixed" && f.text === OOS_STEPS[i].finding);
    got = fixed ? "fixed" : "generated";
    res = {};
  } else {
    res = await triageAnswer({ question: c.q, steps, llm });
    got = res.withheld ? "withheld" : res.refused ? "refused" : "answered";
  }
  const mustNotCall = c.expect.endsWith("-uncalled");
  const expect = c.expect.replace(/-uncalled$/, "");
  const pass = got === expect && (!mustNotCall || llm.calls === 0);
  return { pass, detail: `${got}${mustNotCall || llm.calls ? `; model called ${llm.calls}×` : ""}${res.note ? ` — ${res.note}` : ""}` };
}

// Every document and record the app shows must exist; workflow facts must match the DB.
async function integrity(exec) {
  const out = [];
  const add = (name, pass, detail) => out.push({ name, pass, detail });
  const corpusIds = CORPUS.map((c) => c.id);
  const chunkDocs = uniq(KNOWLEDGE.map((k) => k.doc));

  const unindexed = corpusIds.filter((id) => !chunkDocs.includes(id));
  add("every listed document is searchable", !unindexed.length, unindexed.length ? `not indexed: ${unindexed.join(", ")}` : `${corpusIds.length} documents indexed`);
  const unlisted = chunkDocs.filter((d) => !corpusIds.includes(d));
  add("every searchable chunk belongs to a listed document", !unlisted.length, unlisted.length ? `unlisted: ${unlisted.join(", ")}` : "ok");
  const statusDiff = KNOWLEDGE.filter((k) => CORPUS.find((c) => c.id === k.doc)?.status !== k.status).map((k) => k.doc);
  add("document status matches between list and chunks", !statusDiff.length, statusDiff.length ? uniq(statusDiff).join(", ") : "ok");

  const draftId = OOS_DRAFT.id.replace(/\s*\(DRAFT\)$/, "");
  const shown = [
    ...KNOWLEDGE.map((k) => k.text),
    ...OOS_STEPS.flatMap((s) => [s.task, s.finding, ...(s.evidence || []).flatMap((e) => [e.ref, e.detail])]),
    ...OOS_DRAFT.sections.flatMap((s) => [s.t, s.cite]),
    OOS_CASE.trigger,
    ...OPEN_ITEMS.map((o) => o.why), // CR-007: the open-items explanations cite SOPs too
  ].join("\n");
  const docRefs = uniq((shown.match(DOC_ID) || []).map(baseDoc)).filter((d) => d !== draftId);
  const missingDocs = docRefs.filter((d) => !corpusIds.includes(d));
  add("every document the app cites exists", !missingDocs.length, missingDocs.length ? `missing: ${missingDocs.join(", ")}` : `${docRefs.length} document ids checked`);

  const dbIds = new Set([
    ...Object.values(ROWS).flatMap((rows) => rows.flatMap((r) => r.filter((v) => typeof v === "string"))),
    ...CORPUS.flatMap((c) => c.title.match(/MV-\d{4}/g) || []),
  ]);
  const recRefs = uniq((shown + "\n" + SUGGESTED.join("\n")).match(RECORD_ID) || []).filter((id) => !/^(SOP|POL|VAL|TRN|INV)-/.test(id));
  const missingRecs = recRefs.filter((id) => !dbIds.has(id));
  add("every record id the app mentions exists in the database", !missingRecs.length, missingRecs.length ? `missing: ${missingRecs.join(", ")}` : `${recRefs.length} record ids checked`);

  const one = async (sql) => (await exec(sql)).rows;
  const r117 = (await one("SELECT sample_id, instrument_id, analyst_id, method_id, value, run_ts, oos_flag FROM results WHERE result_id = 'R-30117'"))[0];
  add("trigger result R-30117 matches the OOS case", !!r117 && r117.join("|") === "S-8841|INS-114|A-207|MV-0412|78.1|2026-07-08 14:22|1", r117 ? r117.join(" · ") : "not found");
  const cal = (await one("SELECT i.cal_due, c.cal_performed, c.interval_days FROM instruments i JOIN calibrations c ON c.instrument_id = i.instrument_id WHERE c.cal_id = 'CAL-2411'"))[0];
  add("INS-114 calibration facts (step 3) match", !!cal && cal.join("|") === "2026-07-05|2026-04-05|91", cal ? cal.join(" · ") : "not found");
  const q = (await one("SELECT granted, requal_due, status FROM qualifications WHERE analyst_id = 'A-207' AND method_id = 'MV-0412'"))[0];
  add("A-207 qualification facts (step 4) match", !!q && q.join("|") === "2025-11-18|2026-11-18|CURRENT", q ? q.join(" · ") : "not found");
  const related = (await one(`SELECT r.result_id FROM results r JOIN samples s ON s.sample_id = r.sample_id
    WHERE r.oos_flag = 1 AND (r.instrument_id = 'INS-114' OR s.batch_id = 'B-2291' OR r.method_id = 'MV-0412')
      AND r.run_ts >= date('2026-07-12', '-90 day')`)).map((r) => r[0]);
  add("related-OOS search (step 5) returns what the step states", setEq(related, ["R-30117", "R-30102"]), related.join(", "));
  const others = (await one("SELECT result_id FROM results WHERE oos_flag = 1 AND run_ts >= date('2026-07-12', '-90 day')")).map((r) => r[0]);
  add("R-29981 is the only other OOS in the window (step 5)", setEq(others, ["R-30117", "R-30102", "R-29981"]), others.join(", "));
  return out;
}

// The agent's Workers AI adapter, against a recording stand-in for env.AI.
async function adapter() {
  const calls = [];
  const env = { AI: { run: async (model, input) => { calls.push({ model, input }); return { response: "Stage 1 requires Q = 80% (SOP-AM-0412 §6.2)." }; } } };
  const llm = workersAiLlm(env);
  const res = await answerQuestion({ question: "What's the acceptance criterion for dissolution in method MV-0412?", llm });
  const call = calls[0] || { input: {} };
  return [
    { name: "calls the pinned model", pass: calls.length === 1 && call.model === CLOUD_MODEL.id, detail: call.model || "not called" },
    { name: "temperature 0 and the fixed seed", pass: call.input.temperature === 0 && call.input.seed === GENERATION.seed, detail: `temperature ${call.input.temperature}, seed ${call.input.seed}` },
    { name: "max_tokens from the pinned settings", pass: call.input.max_tokens === GENERATION.maxTokens.t1, detail: String(call.input.max_tokens) },
    { name: "answer passes the citation check", pass: !res.refused && res.mode === "generative", detail: res.refused ? res.reason : "answered" },
    { name: "LLM_ENABLED=false turns the model off", pass: workersAiLlm({ ...env, LLM_ENABLED: "false" }) === null, detail: "null" },
    { name: "no AI binding means no model", pass: workersAiLlm({}) === null, detail: "null" },
  ];
}

async function auditChain() {
  const out = [];
  const entries = [];
  for (let i = 0; i < 5; i++) {
    entries.push(await makeEntry(entries[i - 1], { actor: "eval", kind: "T1", action: `event ${i + 1}`, model: "instant", prompt: "eval", content: `content ${i + 1}`, ts: `2026-01-01 00:00:0${i} +00:00` }));
  }
  const v = await verifyChain(entries);
  out.push({ name: "intact chain verifies", pass: v.ok, detail: v.ok ? `${v.checked} entries` : v.reason });
  const expectBreak = async (name, list, at) => {
    const r = await verifyChain(list);
    out.push({ name, pass: !r.ok && r.brokenAt === at, detail: r.ok ? "NOT detected" : `detected at ${r.brokenAt}: ${r.reason}` });
  };
  await expectBreak("edited action is detected", entries.map((e, i) => (i === 2 ? { ...e, action: "event 3 (edited)" } : e)), "AUD-00003");
  await expectBreak("edited content is detected", entries.map((e, i) => (i === 1 ? { ...e, content: "something else" } : e)), "AUD-00002");
  await expectBreak("removed entry is detected", entries.filter((_, i) => i !== 2), "AUD-00004");
  await expectBreak("reordered entries are detected", [entries[0], entries[2], entries[1], entries[3], entries[4]], "AUD-00003");
  // An attacker who edits an entry AND recomputes its own hash still breaks the next link.
  const forged = { ...entries[2], action: "event 3 (forged)" };
  const reh = await makeEntry(entries[1], { ...forged, ts: forged.ts });
  await expectBreak("re-hashed forgery is detected at the next entry", entries.map((e, i) => (i === 2 ? reh : e)), "AUD-00004");
  return out;
}

const runsHere = (c, where) => !c.env || [].concat(c.env).includes(where);

/**
 * env: { exec, rawExec?, runaway?, llm?, suite?, where: "node" | "browser" | "agent", only?: [keys], onProgress?(done, total) }
 * Returns { categories: [...with n/passed/rate/pass], cases: [...], passed }.
 */
export async function runSuite(env) {
  const S = env.suite || DEV;
  const llm = env.llm || null;
  const cats = S.CATEGORIES.filter((c) => runsHere(c, env.where) && (!env.only || env.only.includes(c.key)));
  const want = new Set(cats.map((c) => c.key));
  const jobs = [];
  const job = (cat, name, fn) => want.has(cat) && jobs.push({ cat, name, fn });

  (S.FACTUAL || []).forEach((c) => job("factual", c.q, () => factual(c, llm)));
  (S.REFUSAL || []).forEach((c) => job("refusal", typeof c === "string" ? c : c.q, () => refusal(c, llm)));
  (S.SUPERSEDED || []).forEach((c) => job("superseded", typeof c === "string" ? c : c.q, () => superseded(c, llm)));
  (S.CITATIONS || []).forEach((c) => job("citations", c.name, async () => citation(c)));
  (S.SQL_REJECT || []).forEach((sql) => job("sqlguard", `reject: ${sql || "(empty)"}`, async () => {
    const v = validateSelect(sql);
    return { pass: !v.ok, detail: v.ok ? "ACCEPTED" : `rejected — ${v.reason}` };
  }));
  (S.SQL_ACCEPT || []).forEach((sql) => job("sqlguard", `accept: ${sql}`, async () => {
    const v = validateSelect(sql);
    if (!v.ok) return { pass: false, detail: `rejected — ${v.reason}` };
    try { const r = await env.exec(v.sql); return { pass: true, detail: `ran, ${r.rows.length} row(s)` }; } catch (e) { return { pass: false, detail: e.message }; }
  }));
  if (env.rawExec) (S.ENGINE_WRITES || []).forEach((sql) => job("readonly", sql, async () => {
    try { await env.rawExec(sql); return { pass: false, detail: "WRITE SUCCEEDED" }; } catch (e) { return { pass: /readonly|read-only/i.test(e.message), detail: e.message }; }
  }));
  if (env.runaway && S.RUNAWAY_SQL) job("timeout", "endless recursive query, then a normal one", async () => {
    const t0 = Date.now();
    let stopped = false, msg = "";
    try { await env.runaway(S.RUNAWAY_SQL); msg = "finished?!"; } catch (e) { stopped = !!e.timeout; msg = e.message; }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    let recovered = false;
    try { recovered = (await env.exec("SELECT COUNT(*) FROM results")).rows[0][0] === 7; } catch { /* stays false */ }
    return { pass: stopped && recovered, detail: `${stopped ? `stopped after ${secs} s` : msg}; database ${recovered ? "recovered" : "did NOT recover"}` };
  });
  (S.NL2SQL || []).forEach((c) => job("nl2sql", c.q, () => nl2sql(c, env.exec, llm)));
  (S.ROUTING || []).forEach((c) => job("routing", c.q, () => routing(c, env.exec)));
  if (want.has("workflow")) {
    const steps = OOS_STEPS.map((s) => ({ ...s }));
    if (S === DEV) for (const step of OOS_STEPS) {
      job("workflow", `step ${step.n} — ${step.title}`, async () => {
        const f = stepFinding(step);
        return { pass: f.source === "fixed" && f.text === step.finding, detail: `${f.source} finding` };
      });
    }
    (S.TRIAGE || []).forEach((c) => job("workflow", `triage: ${c.q}`, async () => {
      const r = await triageAnswer({ question: c.q, steps, llm });
      if (c.refused) return { pass: r.refused, truth: "refuse", got: r.refused ? "undecided" : "answered", group: c.group, detail: r.refused ? "declined" : `answered: ${r.text.slice(0, 80)}…` };
      if (r.refused) return { pass: false, truth: "answer", got: "undecided", group: c.group, detail: "declined" };
      // Model answers carry no sources; instant answers must lead with the right one.
      const lead = r.sources?.[0];
      const rightSource = !c.from || !r.sources || c.from.includes(lead);
      const pass = r.text.includes(c.has) && rightSource;
      return { pass, truth: "answer", got: "answered", group: c.group, detail: `${r.text.includes(c.has) ? `mentions ${c.has}` : `lacks ${c.has}`}${lead ? `, quoting ${lead}` : ""}${rightSource ? "" : ` (expected ${c.from[0]})`}` };
    }));
  }
  if (want.has("modelpath")) (S.MODEL_PATH || []).forEach((c) => job("modelpath", c.name, () => modelPath(c, env.exec)));
  if (want.has("adapter")) job("adapter", "__group", () => adapter());
  if (want.has("integrity")) job("integrity", "__group", () => integrity(env.exec));
  if (want.has("audit")) job("audit", "__group", () => auditChain());

  const cases = [];
  for (let i = 0; i < jobs.length; i++) {
    const { cat, name, fn } = jobs[i];
    let res;
    try { res = await fn(); } catch (e) { res = { pass: false, detail: "error: " + (e?.message || e) }; }
    if (Array.isArray(res)) res.forEach((r) => cases.push({ cat, ...r }));
    else cases.push({ cat, name, ...res });
    env.onProgress?.(i + 1, jobs.length, cases);
  }

  const categories = cats.map((c) => {
    const mine = cases.filter((x) => x.cat === c.key);
    const passed = mine.filter((x) => x.pass).length;
    const rate = mine.length ? passed / mine.length : 0;
    return { ...c, n: mine.length, passed, rate, pass: mine.length > 0 && rate >= c.target };
  });
  return { categories, cases, passed: categories.every((c) => c.pass) };
}

