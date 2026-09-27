// CR-007: questions the Document QA can't answer from the SOPs, but the LIMS
// extract can. Everything here is deterministic — fixed patterns and fixed,
// read-only query templates; no model is involved.
//
//   • "What should I prioritise?", "any open issues?" → the open-items view: a
//     fixed set of validated queries, listed in a fixed order.
//   • A question the SOP path refused, whose every word is about the database
//     (results, batches, calibration…) and which matches a validated template →
//     that template's records.
//   • Anything else keeps its refusal, with a reason that says where the answer
//     is not (neither the SOPs nor the LIMS extract).

import { translate } from "./nl2sql.js";
import { words, stem } from "./rag.js";
import { NOW } from "../data/seed.js";

// ---- worklist questions -------------------------------------------------------
const WORKLIST = new RegExp([
  String.raw`\bprioriti[sz](?:e|ing)\b`, String.raw`\bpriorit(?:y|ies)\b`,
  String.raw`\bopen (?:issues?|items?|actions?|points?|work)\b`,
  String.raw`\boutstanding\b`, String.raw`\bto-?do\b`, String.raw`\bwork ?list\b`,
  String.raw`\bneeds? (?:my |our )?attention\b`, String.raw`\bwhat needs (?:doing|to be done|done)\b`,
  String.raw`\bwhat should (?:i|we) (?:do|look at|work on|focus on|start with)\b`,
  String.raw`\banything (?:urgent|open|pending|outstanding)\b`,
].join("|"), "i");
// A question that is only "issues?", "any problems", "are there open issues?"…
const BARE_ISSUES = /^\s*(?:are there |is there |any(?:thing)? |what are (?:the )?|show (?:me )?(?:the )?|list (?:the )?)?(?:any )?(?:open |current |outstanding |known )?(?:issues?|problems?|concerns?|risks?)\s*(?:today|now|right now)?\s*[?.!]*\s*$/i;

export const isWorklist = (q) => WORKLIST.test(String(q || "")) || BARE_ISSUES.test(String(q || ""));

// ---- data questions the SOPs can't answer --------------------------------------
// Record ids are removed first; every remaining word must be database vocabulary.
const RECORD_IDS = /\b(?:[SBAR]-\d{3,5}|CAL-\d{4}|INS-\d{3}|MV-\d{4}|A-\d{3})\b/gi;
const SCHEMA_WORDS = (
  "result results sample samples batch batches oos fail failed failing failure failures pass passed outcome outcomes " +
  "value values specification limit limits test tests tested testing run runs ran instrument instruments hplc hplcs " +
  "balance balances karl fischer titrator titrators calibration calibrations calibrated calibrate cal due overdue expired " +
  "expire expiry status analyst analysts qualified qualification qualifications certified authorised authorized method " +
  "methods received stage count number many last past previous next within days day week month today now recent recently " +
  "all show list summarise summarize summary register history record records performed interval release lab laboratory " +
  "assay dissolution water currently current which who"
).split(/\s+/);
const SCHEMA = new Set(SCHEMA_WORDS.map(stem));

/** True when the question is only about database records and a validated template matches it. */
export function dataRoutable(question) {
  const q = String(question || "");
  if (!translate(q)) return false;
  const rest = words(q.replace(RECORD_IDS, " ")).filter((w) => w.length >= 2 && !/^\d+$/.test(w));
  return rest.length > 0 && rest.every((w) => SCHEMA.has(stem(w)));
}

// ---- the open-items view --------------------------------------------------------
// Fixed, validated read-only queries in a fixed order. The order is a display
// rule, not a decision: priorities are set by the user. Each "why" quotes the
// controlled passage it rests on.
const today = `date('${NOW}')`;
export const OPEN_ITEMS = [
  {
    key: "oos",
    title: "Out-of-specification results, last 30 days",
    why: "Each needs a Phase 1 investigation and classification (SOP-QA-0102 §6.4).",
    sql: `SELECT r.result_id, s.sample_id, s.batch_id, r.method_id, r.instrument_id, r.analyst_id, r.value, r.unit, r.spec_text, r.run_ts
FROM results r
JOIN samples s ON s.sample_id = r.sample_id
WHERE r.oos_flag = 1
  AND r.run_ts >= date('${NOW}', '-30 day')
ORDER BY r.run_ts DESC`,
  },
  {
    key: "overdue",
    title: "Instruments past their calibration due date",
    why: "“Results from an instrument outside its calibration interval are not reportable” (SOP-EQ-0031 §4.1) — results_after_due counts the runs affected.",
    sql: `SELECT i.instrument_id, i.description, i.cal_due,
       (SELECT COUNT(*) FROM results r WHERE r.instrument_id = i.instrument_id AND r.run_ts > i.cal_due) AS results_after_due
FROM instruments i
WHERE i.cal_due < ${today}
ORDER BY i.cal_due`,
  },
  {
    key: "lapsed",
    title: "Lapsed analyst qualifications",
    why: "“An analyst with a lapsed qualification may not run the method until requalified” (TRN-MX-0207 §2).",
    sql: `SELECT q.analyst_id, a.name, q.method_id, q.requal_due, q.status
FROM qualifications q
JOIN analysts a ON a.analyst_id = q.analyst_id
WHERE q.status = 'LAPSED'
ORDER BY q.method_id, q.analyst_id`,
  },
  {
    key: "due",
    title: "Calibrations due in the next 30 days",
    why: "Due soon — schedule the calibration before the due date.",
    sql: `SELECT instrument_id, description, category, cal_due
FROM instruments
WHERE cal_due >= ${today}
  AND cal_due <= date('${NOW}', '+30 day')
ORDER BY cal_due`,
  },
];

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Runs the open-items queries through the same read-only guard and executor as
 * any data query. `validate(sql)` → { ok, sql, reason }.
 */
export async function openItems({ exec, validate }) {
  const sections = [];
  for (const item of OPEN_ITEMS) {
    const v = validate(item.sql);
    if (!v.ok) { sections.push({ ...item, error: `Rejected by the read-only guard: ${v.reason}`, cols: [], rows: [] }); continue; }
    try {
      const { cols, rows } = await exec(v.sql);
      sections.push({ ...item, sql: v.sql, cols, rows });
    } catch (e) {
      sections.push({ ...item, error: e.message, cols: [], rows: [] });
    }
  }
  const n = Object.fromEntries(sections.map((s) => [s.key, s.rows.length]));
  const overdueRuns = sections.find((s) => s.key === "overdue")?.rows.reduce((t, r) => t + (Number(r[3]) || 0), 0) || 0;
  const parts = [
    plural(n.oos, "OOS result"),
    `${plural(n.overdue, "instrument")} past calibration${overdueRuns ? ` (${plural(overdueRuns, "result")} run after the due date)` : ""}`,
    plural(n.lapsed, "lapsed qualification"),
    `${plural(n.due, "calibration")} due within 30 days`,
  ];
  const text =
    `Open items in the LIMS extract as of ${NOW}: ${parts.join(", ")}.\n` +
    "Listed in a fixed order — OOS results, overdue calibrations, lapsed qualifications, calibrations due soon. " +
    "This is a read-only view from validated queries; setting priorities is your decision.";
  return { kind: "worklist", decision: "ANSWERED", refused: false, text, sections, asOf: NOW };
}

// ---- refusals that say where the answer isn't -----------------------------------
export function explainRefusal(res, question) {
  if (res.reason !== "unknown-subject") return res.text;
  const recordish = RECORD_IDS.test(question) || /\bbatch|\bsample|\binstrument|\banalyst/i.test(question);
  RECORD_IDS.lastIndex = 0;
  // Record ids may well be in the LIMS extract — it's the other words it lacks.
  const topics = res.unknown.filter((w) => !/\d/.test(w)), ids = res.unknown.filter((w) => /\d/.test(w));
  if (!recordish || !topics.length) return res.text;
  const what = topics.map((w) => `“${w}”`).join(", ") + (ids.length ? ` for ${ids.join(", ")}` : "");
  return (
    `I can't answer this: neither the validated SOPs nor the LIMS extract hold ${what}, so any answer would be a guess. ` +
    "The records LabAgent can see are samples, results, instruments, calibrations and analyst qualifications — " +
    "this would have to come from the system that holds it (for example the batch record or stability data)."
  );
}
