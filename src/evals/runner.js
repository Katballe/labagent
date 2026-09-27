// Runs the eval suite (cases.js) against the real pipeline. Environment-specific
// pieces are passed in: `exec` runs a validated SELECT (worker in the browser,
// sql.js directly in Node); `rawExec` (Node only) bypasses the guard to prove
// the engine itself is read-only; `runaway` (browser only) exercises the timeout.

import * as C from "./cases.js";
import { answerQuestion, runDataQuery, stepSummary, triageAnswer } from "../ai/labagent.js";
import { checkDocCitations, checkRecordIds, baseDoc, DOC_ID, RECORD_ID } from "../ai/citations.js";
import { validateSelect } from "../ai/sqlcore.js";
import { CORPUS, OOS_CASE, OOS_STEPS, OOS_DRAFT, SUGGESTED } from "../data/dataset.js";
import { KNOWLEDGE } from "../data/knowledge.js";
import { ROWS } from "../data/seed.js";
import { makeEntry, verifyChain } from "../lib/audit.js";
import { engine } from "../ai/engine.js";

const setEq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const uniq = (xs) => [...new Set(xs)];

async function factual(c) {
  const r = await answerQuestion({ question: c.q });
  const cited = uniq(r.cites.map((x) => baseDoc(x.doc)));
  const secOk = !c.sec || r.cites.some((x) => c.docs.includes(baseDoc(x.doc)) && x.sec.startsWith(c.sec));
  const pass = !r.refused && c.docs.some((d) => cited.includes(d)) && secOk && r.cites.length <= (c.maxQuotes || 2);
  return { pass, detail: r.refused ? `refused (${r.reason}, confidence ${r.confidence.toFixed(2)})` : `cited ${r.cites.map((x) => `${x.doc} ${x.sec.split(" ")[0]}`).join(", ") || "nothing"}` };
}

async function refusal(q) {
  const r = await answerQuestion({ question: q });
  return { pass: r.refused, detail: r.refused ? `refused (${r.reason})` : `answered, citing ${uniq(r.cites.map((x) => x.doc)).join(", ")}` };
}

async function superseded(q) {
  const r = await answerQuestion({ question: q });
  const docs = uniq(r.cites.map((x) => x.doc));
  const pass = !r.refused && docs.length > 0 && r.cites.every((x) => x.doc === "SOP-QA-0102" && x.sec.startsWith("§7.3")) && !!r.conflict;
  return { pass, detail: r.refused ? `refused (${r.reason})` : `cited ${r.cites.map((x) => `${x.doc} ${x.sec.split(" ")[0]}`).join(", ")}; conflict ${r.conflict ? "surfaced" : "NOT surfaced"}` };
}

function citation(c) {
  const res = c.kind === "doc" ? checkDocCitations(c.answer, c.given) : checkRecordIds(c.answer, c.evidence);
  return { pass: res.ok === c.ok, detail: res.ok ? "accepted" : `withheld — ${res.reason}` };
}

async function nl2sql(c, exec) {
  const r = await runDataQuery({ question: c.q, exec });
  if (c.ids === null) {
    const pass = !r.ok && (!c.refusedWrite || !!r.refused);
    return { pass, detail: r.ok ? `ran a query (${r.rows.length} rows) instead of declining` : r.refused ? "declined — read-only" : "declined — no query" };
  }
  if (!r.ok) return { pass: false, detail: r.note };
  const i = r.cols.indexOf(c.col);
  if (i < 0) return { pass: false, detail: `no column ${c.col} (got ${r.cols.join(", ")})` };
  const got = uniq(r.rows.map((row) => row[i]));
  return { pass: setEq(got, c.ids), detail: `${c.col}: ${got.join(", ") || "none"}` };
}

// Swap in a scripted stand-in for the model for one case, then restore the real engine.
async function withScriptedModel(reply, fn) {
  const backend = engine.backend;
  let calls = 0;
  engine.backend = "scripted";
  engine.chat = async ({ onToken }) => { calls++; onToken?.(reply); return reply; };
  try {
    return { res: await fn(), calls };
  } finally {
    delete engine.chat; // back to the class method
    engine.backend = backend;
  }
}

async function modelPath(c, exec) {
  const steps = OOS_STEPS.map((s) => ({ ...s, summaryText: s.fallback }));
  const run = {
    qa: () => answerQuestion({ question: c.q }),
    sql: () => runDataQuery({ question: c.q, exec }),
    step: () => stepSummary({ step: OOS_STEPS.find((s) => s.n === c.step) }),
    triage: () => triageAnswer({ question: c.q, steps }),
  }[c.kind];
  const { res, calls } = await withScriptedModel(c.reply, run);
  let got;
  if (c.kind === "step") got = res.source;
  else if (c.kind === "sql") got = res.ok ? `rows:${res.rows.length}` : res.rejected ? "rejected" : res.refused ? "refused" : "noquery";
  else got = res.withheld ? "withheld" : res.refused ? "refused" : "answered";
  if (c.expect === "refused-uncalled") return { pass: got === "refused" && calls === 0, detail: `${got}; model called ${calls}×` };
  return { pass: got === c.expect, detail: `${got}${res.note ? ` — ${res.note}` : ""}` };
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
    ...OOS_STEPS.flatMap((s) => [s.task, s.fallback, ...(s.evidence || []).flatMap((e) => [e.ref, e.detail])]),
    ...OOS_DRAFT.sections.flatMap((s) => [s.t, s.cite]),
    OOS_CASE.trigger,
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

/**
 * env: { exec, rawExec?, runaway?, where: "node" | "browser", only?: [categoryKeys], onProgress?(done, total) }
 * Returns { categories: [...with n/passed/rate/pass], cases: [...], passed }.
 */
export async function runSuite(env) {
  const cats = C.CATEGORIES.filter((c) => (!c.env || c.env === env.where) && (!env.only || env.only.includes(c.key)));
  const want = new Set(cats.map((c) => c.key));
  const jobs = [];
  const job = (cat, name, fn) => want.has(cat) && jobs.push({ cat, name, fn });

  C.FACTUAL.forEach((c) => job("factual", c.q, () => factual(c)));
  C.REFUSAL.forEach((q) => job("refusal", q, () => refusal(q)));
  C.SUPERSEDED.forEach((q) => job("superseded", q, () => superseded(q)));
  C.CITATIONS.forEach((c) => job("citations", c.name, async () => citation(c)));
  C.SQL_REJECT.forEach((sql) => job("sqlguard", `reject: ${sql || "(empty)"}`, async () => {
    const v = validateSelect(sql);
    return { pass: !v.ok, detail: v.ok ? "ACCEPTED" : `rejected — ${v.reason}` };
  }));
  C.SQL_ACCEPT.forEach((sql) => job("sqlguard", `accept: ${sql}`, async () => {
    const v = validateSelect(sql);
    if (!v.ok) return { pass: false, detail: `rejected — ${v.reason}` };
    try { const r = await env.exec(v.sql); return { pass: true, detail: `ran, ${r.rows.length} row(s)` }; } catch (e) { return { pass: false, detail: e.message }; }
  }));
  if (env.rawExec) C.ENGINE_WRITES.forEach((sql) => job("readonly", sql, async () => {
    try { env.rawExec(sql); return { pass: false, detail: "WRITE SUCCEEDED" }; } catch (e) { return { pass: /readonly|read-only/i.test(e.message), detail: e.message }; }
  }));
  if (env.runaway) job("timeout", "endless recursive query, then a normal one", async () => {
    const t0 = Date.now();
    let stopped = false, msg = "";
    try { await env.runaway(C.RUNAWAY_SQL); msg = "finished?!"; } catch (e) { stopped = !!e.timeout; msg = e.message; }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    let recovered = false;
    try { recovered = (await env.exec("SELECT COUNT(*) FROM results")).rows[0][0] === 7; } catch { /* stays false */ }
    return { pass: stopped && recovered, detail: `${stopped ? `stopped after ${secs} s` : msg}; database ${recovered ? "recovered" : "did NOT recover"}` };
  });
  C.NL2SQL.forEach((c) => job("nl2sql", c.q, () => nl2sql(c, env.exec)));
  if (want.has("workflow")) {
    const steps = [];
    for (const step of OOS_STEPS) {
      job("workflow", `step ${step.n} — ${step.title}`, async () => {
        const s = await stepSummary({ step });
        steps.push({ ...step, summaryText: s.text });
        const ok = s.text && s.text.length > 8;
        return { pass: ok, detail: `${s.source}${s.note ? ` (${s.note})` : ""}` };
      });
    }
    C.TRIAGE.forEach((c) => job("workflow", `triage: ${c.q}`, async () => {
      const r = await triageAnswer({ question: c.q, steps });
      if (c.refused) return { pass: r.refused, detail: r.refused ? "declined" : `answered: ${r.text.slice(0, 80)}…` };
      if (r.refused) return { pass: false, detail: "declined" };
      // Model answers carry no sources; instant answers must lead with the right one.
      const lead = r.sources?.[0];
      const rightSource = !c.from || !r.sources || c.from.includes(lead);
      const pass = r.text.includes(c.has) && rightSource;
      return { pass, detail: `${r.text.includes(c.has) ? `mentions ${c.has}` : `lacks ${c.has}`}${lead ? `, quoting ${lead}` : ""}${rightSource ? "" : ` (expected ${c.from[0]})`}` };
    }));
  }
  if (want.has("modelpath")) C.MODEL_PATH.forEach((c) => job("modelpath", c.name, () => modelPath(c, env.exec)));
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
