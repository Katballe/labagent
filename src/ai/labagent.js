// High-level tier operations. Each returns a plain result object the UI renders.
// These compose: retriever (rag) + database (db) + an answer engine, which is
// either Instant mode (deterministic: verbatim quotes and fixed query
// templates — no model, nothing to download) or a local language model.
// The guard rails are the same in both: retrieval gate, citation check,
// read-only SQL, fixed workflow.

import { engine } from "./engine.js";
import { retrieve, unknownTerms, DF, tokens } from "./rag.js";
import { pickQuotes, formatQuotes } from "./extract.js";
import { checkDocCitations, checkRecordIds, baseDoc } from "./citations.js";
import { runSelect, validateSelect } from "./db.js";
import { translate, writeIntent, WRITE_REFUSAL, INSTANT_T2_HELP } from "./nl2sql.js";
import { SCHEMA_DOC } from "../data/seed.js";
import { OOS_CASE } from "../data/dataset.js";
import {
  T1_SYSTEM, t1User,
  T2_SYSTEM, t2User,
  T3_STEP_SYSTEM, t3StepUser,
  T3_TRIAGE_SYSTEM, t3TriageUser,
} from "./prompts.js";

export const isInstant = () => engine.backend === "instant";

function stripFences(s) {
  return (s || "").replace(/```(?:sql)?/gi, "").replace(/```/g, "").trim();
}

// Questions about live records (a batch, a sample, an instrument's status today) belong to the database.
const DATA_ID = /\b(?:[SBAR]-\d{3,5}|CAL-\d{4}|INS-\d{3})\b|\btoday\b|\bright now\b/i;

// ---- Tier 1: retrieval-grounded QA, cite or refuse -------------------------
export async function answerQuestion({ question, threshold = 0.6, onToken }) {
  const r = retrieve(question);
  const refuse = (text, extra = {}) => ({ refused: true, confidence: r.confidence, conflict: null, cites: [], text, ...extra });

  if (r.unknown.length) {
    const what = r.unknown.map((w) => `“${w}”`).join(", ");
    const hint = DATA_ID.test(question) ? " Records such as samples, batches and results live in the database — try the Data query tab." : "";
    return refuse(`I can't answer this from the validated corpus: it doesn't mention ${what}, so any answer would be a guess.${hint}`, { reason: "unknown-subject", unknown: r.unknown });
  }
  if (!r.chunks.length || r.confidence < threshold) {
    return refuse(
      `I can't answer this from the validated corpus. Retrieval confidence (${r.confidence.toFixed(2)}) is below the ${threshold.toFixed(2)} ` +
      `threshold, so no answer is given rather than risk a confident hallucination.`,
      { reason: "low-confidence" }
    );
  }

  if (isInstant()) {
    const units = r.chunks.map((c, i) => ({ text: c.text, header: `${c.doc} ${c.title} ${c.sec} ${c.tags.join(" ")}`, cite: { doc: c.doc, sec: c.sec }, rank: i, status: c.status }));
    const picked = pickQuotes(question, units);
    if (!picked) {
      return refuse(
        "The retrieved SOPs mention these topics, but no single passage answers the question — so I'm declining rather than stitching fragments together.",
        { reason: "no-passage" }
      );
    }
    const text = formatQuotes(picked.quotes);
    onToken?.(text);
    const used = new Set(picked.quotes.map((q) => `${q.cite.doc}|${q.cite.sec}`));
    return {
      refused: false, confidence: r.confidence, conflict: r.conflict, text, mode: "instant",
      cites: r.chunks.filter((c) => used.has(`${c.doc}|${c.sec}`)).map((c) => ({ doc: c.doc, sec: c.sec, score: c.score, excerpt: c.text })),
    };
  }

  const messages = [
    { role: "system", content: T1_SYSTEM },
    { role: "user", content: t1User(question, r.chunks) },
  ];
  const text = (await engine.chat({ messages, temperature: 0.2, maxTokens: 500, onToken })).trim();
  if (/INSUFFICIENT_EVIDENCE/i.test(text)) {
    return refuse("The retrieved sources don't actually contain the answer to this question, so I'm declining rather than guessing.", { reason: "model-insufficient" });
  }
  // Cite-or-refuse, enforced in code: the model must cite ≥1 source it was given, and nothing else.
  const check = checkDocCitations(text, r.chunks.map((c) => c.doc));
  if (!check.ok) {
    return refuse(`The model's answer was withheld because ${check.reason}. Citations are checked in code, not trusted to the model.`, { reason: "citation-check", withheld: text });
  }
  return {
    refused: false, confidence: r.confidence, conflict: r.conflict, text, mode: "model",
    cites: r.chunks.filter((c) => check.cited.includes(baseDoc(c.doc))).map((c) => ({ doc: c.doc, sec: c.sec, score: c.score, excerpt: c.text })),
  };
}

// ---- Tier 2: question -> read-only SQL, executed for real ------------------
// `exec` runs a validated SELECT; the browser uses the worker-backed database,
// the headless evals pass one bound to sql.js directly.
export async function runDataQuery({ question, exec = runSelect }) {
  if (writeIntent(question)) {
    return { ok: false, refused: true, sql: "-- No query generated: the request asks to change data.", cols: [], rows: [], note: WRITE_REFUSAL, how: null };
  }
  let sql, how;
  if (isInstant()) {
    const t = translate(question);
    if (!t) return { ok: false, sql: "-- No query generated (instant mode).", cols: [], rows: [], note: INSTANT_T2_HELP, how: null };
    sql = t.sql;
    how = `instant mode · template: ${t.intent}`;
  } else {
    const messages = [
      { role: "system", content: T2_SYSTEM },
      { role: "user", content: t2User(question, SCHEMA_DOC) },
    ];
    sql = stripFences((await engine.chat({ messages, temperature: 0, maxTokens: 300 })).trim());
    how = "written by the local model";
    if (/^NO_QUERY/i.test(sql) || !sql) {
      return {
        ok: false, how,
        sql: "-- No query generated.\n-- The question could not be mapped onto the allowed schema without guessing.",
        cols: [], rows: [], note: "0 rows · nothing executed",
      };
    }
  }

  const v = validateSelect(sql);
  if (!v.ok) return { ok: false, sql, how, cols: [], rows: [], note: `Rejected by the read-only guard: ${v.reason}. Nothing executed.`, rejected: true };

  try {
    const { cols, rows, truncated, total } = await exec(v.sql);
    return {
      ok: true, sql: v.sql, how, cols, rows,
      note: `${total} row${total === 1 ? "" : "s"}${truncated ? ` (first ${rows.length} shown)` : ""} · read-only · executed against synthetic SQLite`,
    };
  } catch (e) {
    return { ok: false, sql: v.sql, how, cols: [], rows: [], note: e.timeout ? e.message : `SQL error: ${e.message}. Nothing written (read-only).`, error: true };
  }
}

// ---- Tier 3: per-step summaries, triage assistant ---------------------------
function evidenceToText(step) {
  if (!step.evidence?.length) return "(no additional evidence for this step)";
  return step.evidence.map((e) => `- ${e.ref}: ${e.detail}`).join("\n");
}

/** Returns { text, source: "fixed" | "model" | "fallback", note? } */
export async function stepSummary({ step, onToken }) {
  if (isInstant()) return { text: step.fallback, source: "fixed" };
  // The evidence and the step are fixed; the model only phrases the finding.
  try {
    const messages = [
      { role: "system", content: T3_STEP_SYSTEM },
      { role: "user", content: t3StepUser(step, evidenceToText(step)) },
    ];
    const text = (await engine.chat({ messages, temperature: 0.2, maxTokens: 300, onToken })).trim();
    if (text.length < 8) return { text: step.fallback, source: "fallback", note: "model returned nothing usable" };
    const check = checkRecordIds(text, `${step.task}\n${evidenceToText(step)}\n${step.fallback}\n${OOS_CASE.trigger}`);
    if (!check.ok) return { text: step.fallback, source: "fallback", note: `model summary withheld — ${check.reason}` };
    return { text, source: "model" };
  } catch {
    return { text: step.fallback, source: "fallback", note: "model error" }; // deterministic fallback keeps the workflow honest
  }
}

export function gatheredEvidenceText(steps) {
  return steps
    .map((s) => `Step ${s.n} (${s.title}): ${s.summaryText || s.fallback}` +
      (s.evidence?.length ? "\n  " + s.evidence.map((e) => `${e.ref}: ${e.detail}`).join("\n  ") : ""))
    .join("\n");
}

const APPROVAL_FACTS =
  "Approval releases the record to the QA queue as a signed export. The AI has no write path to the LIMS in any state. " +
  "Rejecting the draft discards it, and the rejection itself is recorded on the audit trail.";

export function evidenceUnits(steps) {
  const units = [];
  steps.forEach((s) => {
    units.push({ text: s.summaryText || s.fallback, header: s.title, cite: { doc: `Step ${s.n}`, sec: s.title }, rank: 0 });
    for (const e of s.evidence || []) units.push({ text: e.detail, header: e.ref, cite: { doc: e.ref, sec: `(step ${s.n})` }, rank: 0.1 });
  });
  units.push({ text: OOS_CASE.trigger, header: "OOS trigger", cite: { doc: "OOS trigger", sec: OOS_CASE.sample }, rank: 0 });
  units.push({ text: APPROVAL_FACTS, header: "approval gate approve reject sign", cite: { doc: "Approval gate", sec: "human review" }, rank: 0 });
  return units;
}

export async function triageAnswer({ question, steps, onToken }) {
  const evidence = gatheredEvidenceText(steps) + "\n" + OOS_CASE.trigger + "\n" + APPROVAL_FACTS;
  const outOfScope = {
    refused: true,
    text: "I can only discuss the evidence gathered in this workflow's steps and the SOPs it cites — I don't speculate beyond it. " +
      "Try asking about the classification, INS-114's calibration, the analyst, the batch, or what happens on approval.",
  };

  if (isInstant()) {
    const vocab = new Set([...DF.keys(), ...tokens(evidence)]);
    if (unknownTerms(question, vocab).length) return outOfScope;
    const picked = pickQuotes(question, evidenceUnits(steps), { max: 2 });
    if (!picked) return outOfScope;
    const text = formatQuotes(picked.quotes);
    onToken?.(text);
    return { refused: false, text, sources: picked.quotes.map((q) => q.cite.doc) };
  }

  const messages = [
    { role: "system", content: T3_TRIAGE_SYSTEM },
    { role: "user", content: t3TriageUser(question, evidence) },
  ];
  const text = (await engine.chat({ messages, temperature: 0.2, maxTokens: 350, onToken })).trim();
  if (/OUT_OF_SCOPE/i.test(text) || text.length < 6) return outOfScope;
  const check = checkRecordIds(text, evidence);
  if (!check.ok) return { refused: true, withheld: text, text: `The model's answer was withheld because ${check.reason}.` };
  return { refused: false, text };
}
