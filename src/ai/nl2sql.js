// Instant mode, Tier 2: plain-English questions → fixed, parameterised read-only
// SQL — no language model. The question is matched to one of a handful of
// query shapes and its ids (batch, sample, instrument, method, analyst) and
// time window are filled in. The generated SQL still goes through the same
// read-only guard and read-only database as model-written SQL.

import { NOW } from "../data/seed.js";

const ID = {
  batch: /\bB-\d{4}\b/i,
  sample: /\bS-\d{4}\b/i,
  instrument: /\bINS-\d{3}\b/i,
  method: /\bMV-\d{4}\b/i,
  analyst: /\bA-\d{3}\b/i,
};
const pick = (q, k) => q.match(ID[k])?.[0].toUpperCase() ?? null;
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const today = `date('${NOW}')`;

function windowDays(q) {
  const m = q.match(/\b(?:last|past|previous|next|within|in the (?:last|next))\s+(\d{1,3})\s+days?\b/i) || q.match(/\b(\d{1,3})[\s-]*days?\b/i);
  if (m) return Math.min(365, Number(m[1]));
  if (/\b(this|past|last) week\b/i.test(q)) return 7;
  if (/\b(this|past|last) month\b/i.test(q)) return 30;
  if (/\btoday\b/i.test(q)) return 1;
  return null;
}

const RESULT_COLS = `r.result_id, s.sample_id, s.batch_id, r.method_id, r.instrument_id, r.analyst_id,
       r.value, r.unit, r.spec_text,
       CASE WHEN r.oos_flag = 1 THEN 'OOS' ELSE 'PASS' END AS outcome, r.run_ts`;

function resultFilters(q) {
  const where = [];
  const e = { batch: pick(q, "batch"), sample: pick(q, "sample"), instrument: pick(q, "instrument"), method: pick(q, "method"), analyst: pick(q, "analyst") };
  if (e.batch) where.push(`s.batch_id = ${lit(e.batch)}`);
  if (e.sample) where.push(`s.sample_id = ${lit(e.sample)}`);
  if (e.instrument) where.push(`r.instrument_id = ${lit(e.instrument)}`);
  if (e.method) where.push(`r.method_id = ${lit(e.method)}`);
  if (e.analyst) where.push(`r.analyst_id = ${lit(e.analyst)}`);
  const d = windowDays(q);
  if (d) where.push(`r.run_ts >= date('${NOW}', '-${d} day')`);
  return { where, any: Object.values(e).some(Boolean) || !!d };
}

const and = (where) => (where.length ? "\nWHERE " + where.join("\n  AND ") : "");

/** Returns { sql, intent } or null if the question matches no known shape. */
export function translate(question) {
  const q = String(question || "");
  const lower = q.toLowerCase();
  const inst = pick(q, "instrument");

  // Calibration due / overdue
  if (/\boverdue\b|\bdue (for|soon)\b|\bcalibration due\b|\bexpir/.test(lower) && /calibrat|instrument|equipment|hplc|due/.test(lower)) {
    const d = windowDays(q) ?? 30;
    return {
      intent: "instruments due or overdue for calibration",
      sql: `SELECT instrument_id, description, category, cal_due,
       CASE WHEN cal_due < ${today} THEN 'OVERDUE' ELSE 'DUE SOON' END AS state
FROM instruments
WHERE cal_due <= date('${NOW}', '+${d} day')
ORDER BY cal_due`,
    };
  }
  // Calibration history of one instrument
  if (inst && /calibration (history|record)|calibrations|when was .*calibrat|last calibrat/.test(lower)) {
    return {
      intent: "calibration history for an instrument",
      sql: `SELECT cal_id, instrument_id, cal_performed, interval_days, cal_due
FROM calibrations
WHERE instrument_id = ${lit(inst)}
ORDER BY cal_performed DESC`,
    };
  }
  // Calibration status
  if (/calibrat|\bcal status\b|\bin cal\b/.test(lower)) {
    const where = [];
    if (inst) where.push(`instrument_id = ${lit(inst)}`);
    else if (/\bhplc\b/.test(lower)) where.push(`type = 'HPLC'`);
    else if (/\bbalance/.test(lower)) where.push(`type = 'BALANCE'`);
    else if (/karl fischer|\bkf\b|titrator/.test(lower)) where.push(`type = 'KF'`);
    return {
      intent: "calibration status of instruments",
      sql: `SELECT instrument_id, description, type, category, cal_due, cal_status
FROM instruments${and(where)}
ORDER BY instrument_id`,
    };
  }
  // Analyst qualifications
  if (/qualif|trained|certified|authori[sz]ed/.test(lower)) {
    const where = [];
    const method = pick(q, "method"), analyst = pick(q, "analyst");
    if (method) where.push(`q.method_id = ${lit(method)}`);
    if (analyst) where.push(`q.analyst_id = ${lit(analyst)}`);
    if (/\blapsed|expired|not qualified|overdue\b/.test(lower)) where.push(`q.status = 'LAPSED'`);
    else if (!analyst) where.push(`q.status = 'CURRENT'`);
    return {
      intent: "analyst qualifications",
      sql: `SELECT q.analyst_id, a.name, q.method_id, q.granted, q.requal_due, q.status
FROM qualifications q
JOIN analysts a ON a.analyst_id = q.analyst_id${and(where)}
ORDER BY q.method_id, q.analyst_id`,
    };
  }
  const f = resultFilters(q);
  const oos = /\boos\b|out[\s-]+of[\s-]+spec|\bfail(ed|ing|ures?)?\b/.test(lower);
  // Counts
  if (/\bhow many\b|\bcount\b|\bnumber of\b/.test(lower) && (oos || /result|sample|test/.test(lower))) {
    return {
      intent: oos ? "count of OOS results" : "count of results",
      sql: `SELECT COUNT(*) AS ${oos ? "oos_results" : "results"}
FROM results r
JOIN samples s ON s.sample_id = r.sample_id${and(oos ? ["r.oos_flag = 1", ...f.where] : f.where)}`,
    };
  }
  // OOS results
  if (oos) {
    return {
      intent: "out-of-specification results",
      sql: `SELECT ${RESULT_COLS}
FROM results r
JOIN samples s ON s.sample_id = r.sample_id${and(["r.oos_flag = 1", ...f.where])}
ORDER BY r.run_ts DESC`,
    };
  }
  // Results / samples, filtered by any ids or time window
  if (f.any || /\bresults?\b|\bsamples?\b|\btested\b|\bruns?\b/.test(lower)) {
    if (!f.any && !/\ball\b/.test(lower)) return null; // "show results" with nothing to filter on is too vague
    return {
      intent: "results with outcome",
      sql: `SELECT ${RESULT_COLS}
FROM results r
JOIN samples s ON s.sample_id = r.sample_id${and(f.where)}
ORDER BY r.run_ts`,
    };
  }
  // Simple listings
  if (/\binstruments?\b|\bequipment\b/.test(lower)) return { intent: "instrument register", sql: "SELECT instrument_id, description, type, category, cal_status\nFROM instruments\nORDER BY instrument_id" };
  if (/\banalysts?\b/.test(lower)) return { intent: "analysts", sql: "SELECT analyst_id, name\nFROM analysts\nORDER BY analyst_id" };
  if (/\bbatch(es)?\b/.test(lower)) return { intent: "batches", sql: "SELECT batch_id, COUNT(*) AS samples, MIN(received) AS first_received, MAX(received) AS last_received\nFROM samples\nGROUP BY batch_id\nORDER BY batch_id" };
  return null;
}

/** True when the question asks to change data — answered with a refusal, never with a SELECT that looks like compliance. */
export function writeIntent(question) {
  return /\b(delete|remove|update|insert|drop|truncate|modify|overwrite|erase|invalidate)\b|\bmark\b.+\bas\b|\bset\b.+\bto\b|\bchange\b.+\bto\b/i.test(String(question || ""));
}

export const WRITE_REFUSAL =
  "LabAgent is read-only: it can look records up, but it can't change, delete or approve anything — and neither can any query it runs. " +
  "Changes to LIMS records go through the LIMS itself, by an authorised person.";

export const INSTANT_T2_HELP =
  "No validated query template matches this question. Templates cover results, OOS, samples, batches, instruments, " +
  "calibration and analyst qualifications — name an id or a topic, e.g. “OOS results for batch B-2291”, " +
  "“results on INS-114 in the last 7 days”, “who is qualified on MV-0407?”. With an AI model enabled, it can draft an " +
  "ad-hoc query instead, labelled unvalidated.";
