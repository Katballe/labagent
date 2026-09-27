// The LabAgent pipeline, independent of where it runs: the browser, the
// Cloudflare agent and the headless evals all call these functions. A language
// model is injected (`llm`) or absent (null = deterministic "instant" mode):
//   llm = { label, chat({ messages, temperature, seed, maxTokens, onToken }) → Promise<string> }
//
// Division of labour under EU GMP Annex 22 (draft):
//   • Deterministic code makes every decision: retrieval and refusal, the
//     validated query templates, the read-only guard, the OOS steps, findings
//     and classification.
//   • A model, when present, only does non-critical work a qualified person
//     reviews (human in the loop): wording an SOP answer from the retrieved
//     sources, drafting an ad-hoc query that is labelled unvalidated, and
//     answering questions about the gathered OOS evidence. Its output is
//     checked in code (citations, record ids, SQL guard) before anyone sees it.

import { retrieve, unknownTerms, DF, tokens, words, stem } from "./rag.js";
import { pickQuotes, formatQuotes } from "./extract.js";
import { checkDocCitations, checkRecordIds, baseDoc } from "./citations.js";
import { validateSelect } from "./sqlcore.js";
import { translate, writeIntent, WRITE_REFUSAL, INSTANT_T2_HELP } from "./nl2sql.js";
import { SCHEMA_DOC } from "../data/seed.js";
import { OOS_CASE } from "../data/dataset.js";
import { T1_SYSTEM, t1User, T2_SYSTEM, t2User, T3_TRIAGE_SYSTEM, t3TriageUser } from "./prompts.js";
import { GENERATION, DEFAULT_THRESHOLD } from "../compliance/config.js";

const gen = (maxTokens) => ({ temperature: GENERATION.temperature, seed: GENERATION.seed, maxTokens });
const stripFences = (s) => (s || "").replace(/```(?:sql)?/gi, "").replace(/```/g, "").trim();

// Questions about live records (a batch, a sample, an instrument's status today) belong to the database.
const DATA_ID = /\b(?:[SBAR]-\d{3,5}|CAL-\d{4}|INS-\d{3})\b|\btoday\b|\bright now\b/i;

// Explainability (Annex 22 §8): which words of the question each passage matched.
function matchedWords(question, chunk) {
  const terms = new Set(tokens(`${chunk.doc} ${chunk.title || ""} ${chunk.sec} ${chunk.text} ${(chunk.tags || []).join(" ")}`));
  return [...new Set(words(question).filter((w) => terms.has(stem(w))))];
}
const citeOf = (question) => (c) => ({ doc: c.doc, sec: c.sec, score: c.score, excerpt: c.text, status: c.status, matched: matchedWords(question, c) });

// ---- Tier 1: SOP questions — cite or refuse ---------------------------------
/**
 * Returns { decision: "ANSWERED" | "UNDECIDED", refused, reason?, text, mode, confidence, threshold,
 *           conflict, cites[], retrieved[], withheld?, unknown? }
 */
export async function answerQuestion({ question, threshold = DEFAULT_THRESHOLD, llm = null, onToken }) {
  const r = retrieve(question);
  const retrieved = r.chunks.map((c) => ({ doc: c.doc, sec: c.sec, score: Number(c.score.toFixed(3)) }));
  const base = { confidence: r.confidence, threshold, retrieved, mode: llm ? "generative" : "extractive" };
  const refuse = (text, extra = {}) => ({ ...base, decision: "UNDECIDED", refused: true, conflict: null, cites: [], text, ...extra });

  if (r.unknown.length) {
    const what = r.unknown.map((w) => `“${w}”`).join(", ");
    const hint = DATA_ID.test(question) ? " Records such as samples, batches and results live in the database — try the Data query tab." : "";
    return refuse(`I can't answer this from the validated corpus: it doesn't mention ${what}, so any answer would be a guess.${hint}`, { reason: "unknown-subject", unknown: r.unknown });
  }
  if (!r.chunks.length || r.confidence < threshold) {
    return refuse(
      `I can't answer this from the validated corpus. Retrieval confidence (${r.confidence.toFixed(2)}) is below the ${threshold.toFixed(2)} ` +
      `threshold, so the outcome is “undecided” rather than a guess.`,
      { reason: "low-confidence" }
    );
  }

  if (!llm) {
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
    return { ...base, decision: "ANSWERED", refused: false, conflict: r.conflict, text, cites: r.chunks.filter((c) => used.has(`${c.doc}|${c.sec}`)).map(citeOf(question)) };
  }

  const messages = [
    { role: "system", content: T1_SYSTEM },
    { role: "user", content: t1User(question, r.chunks) },
  ];
  const text = (await llm.chat({ messages, ...gen(GENERATION.maxTokens.t1), onToken })).trim();
  if (/INSUFFICIENT_EVIDENCE/i.test(text)) {
    return refuse("The retrieved sources don't actually contain the answer to this question, so I'm declining rather than guessing.", { reason: "model-insufficient" });
  }
  // Cite-or-refuse, enforced in code: the model must cite ≥1 source it was given, and nothing else.
  const check = checkDocCitations(text, r.chunks.map((c) => c.doc));
  if (!check.ok) {
    return refuse(`The model's answer was withheld because ${check.reason}. Citations are checked in code, not trusted to the model.`, { reason: "citation-check", withheld: text });
  }
  return {
    ...base, decision: "ANSWERED", refused: false, conflict: r.conflict, text, model: llm.label,
    cites: r.chunks.filter((c) => check.cited.includes(baseDoc(c.doc))).map(citeOf(question)),
  };
}

// ---- Tier 2: data questions → read-only SQL ---------------------------------
/**
 * `exec(sql)` runs a validated SELECT → { cols, rows, total, truncated }.
 * Validated templates are preferred; a model only drafts SQL when no template
 * matches, and such results are labelled unvalidated (informational only).
 */
export async function runDataQuery({ question, llm = null, exec, guard = {} }) {
  if (writeIntent(question)) {
    return { ok: false, refused: true, source: "none", validated: false, sql: "-- No query generated: the request asks to change data.", cols: [], rows: [], note: WRITE_REFUSAL, how: null };
  }
  let sql, how, source, validated, template = null;
  const t = translate(question);
  if (t) {
    ({ sql } = t);
    template = t.intent;
    how = `validated template · ${t.intent}`;
    source = "template";
    validated = true;
  } else if (llm) {
    const messages = [
      { role: "system", content: T2_SYSTEM },
      { role: "user", content: t2User(question, SCHEMA_DOC) },
    ];
    sql = stripFences((await llm.chat({ messages, ...gen(GENERATION.maxTokens.t2) })).trim());
    how = `unvalidated · drafted by ${llm.label}`;
    source = "model";
    validated = false;
    if (/^NO_QUERY/i.test(sql) || !sql) {
      return {
        ok: false, how, source, validated,
        sql: "-- No query generated.\n-- The question could not be mapped onto the allowed schema without guessing.",
        cols: [], rows: [], note: "0 rows · nothing executed",
      };
    }
  } else {
    return { ok: false, source: "none", validated: false, sql: "-- No query generated (no matching validated template).", cols: [], rows: [], note: INSTANT_T2_HELP, how: null };
  }

  const v = validateSelect(sql, guard);
  if (!v.ok) return { ok: false, sql, how, source, validated, template, cols: [], rows: [], note: `Rejected by the read-only guard: ${v.reason}. Nothing executed.`, rejected: true };

  const caveat = validated ? "" : " · UNVALIDATED query drafted by AI — informational only; verify before using it for any GMP decision";
  try {
    const { cols, rows, truncated, total } = await exec(v.sql);
    return {
      ok: true, sql: v.sql, how, source, validated, template, cols, rows,
      note: `${total} row${total === 1 ? "" : "s"}${truncated ? ` (first ${rows.length} shown)` : ""} · read-only · executed against synthetic SQLite${caveat}`,
    };
  } catch (e) {
    return { ok: false, sql: v.sql, how, source, validated, template, cols: [], rows: [], note: e.timeout ? e.message : `SQL error: ${e.message}. Nothing written (read-only).`, error: true };
  }
}

// ---- Tier 3: OOS Phase 1 (critical: deterministic only) ---------------------
/** A step's finding is fixed, reviewed text — never generated. */
export function stepFinding(step) {
  return { text: step.finding, source: "fixed" };
}

export function gatheredEvidenceText(steps) {
  return steps
    .map((s) => `Step ${s.n} (${s.title}): ${s.finding}` +
      (s.evidence?.length ? "\n  " + s.evidence.map((e) => `${e.ref}: ${e.detail}`).join("\n  ") : ""))
    .join("\n");
}

export const APPROVAL_FACTS =
  "Approval releases the record to the QA queue as a signed export. The AI has no write path to the LIMS in any state. " +
  "Rejecting the draft discards it, and the rejection itself is recorded on the audit trail.";

export function evidenceUnits(steps) {
  const units = [];
  steps.forEach((s) => {
    units.push({ text: s.finding, header: s.title, cite: { doc: `Step ${s.n}`, sec: s.title }, rank: 0 });
    for (const e of s.evidence || []) units.push({ text: e.detail, header: e.ref, cite: { doc: e.ref, sec: `(step ${s.n})` }, rank: 0.1 });
  });
  units.push({ text: OOS_CASE.trigger, header: "OOS trigger", cite: { doc: "OOS trigger", sec: OOS_CASE.sample }, rank: 0 });
  units.push({ text: APPROVAL_FACTS, header: "approval gate approve reject sign", cite: { doc: "Approval gate", sec: "human review" }, rank: 0 });
  return units;
}

/** Questions about the gathered evidence — non-critical explanation, never part of the record. */
export async function triageAnswer({ question, steps, llm = null, onToken }) {
  const evidence = gatheredEvidenceText(steps) + "\n" + OOS_CASE.trigger + "\n" + APPROVAL_FACTS;
  const outOfScope = {
    refused: true, decision: "UNDECIDED", mode: llm ? "generative" : "extractive",
    text: "I can only discuss the evidence gathered in this workflow's steps and the SOPs it cites — I don't speculate beyond it. " +
      "Try asking about the classification, INS-114's calibration, the analyst, the batch, or what happens on approval.",
  };

  if (!llm) {
    const vocab = new Set([...DF.keys(), ...tokens(evidence)]);
    if (unknownTerms(question, vocab).length) return outOfScope;
    const picked = pickQuotes(question, evidenceUnits(steps), { max: 2 });
    if (!picked) return outOfScope;
    const text = formatQuotes(picked.quotes);
    onToken?.(text);
    return { refused: false, decision: "ANSWERED", mode: "extractive", text, sources: picked.quotes.map((q) => q.cite.doc) };
  }

  const messages = [
    { role: "system", content: T3_TRIAGE_SYSTEM },
    { role: "user", content: t3TriageUser(question, evidence) },
  ];
  const text = (await llm.chat({ messages, ...gen(GENERATION.maxTokens.t3), onToken })).trim();
  if (/OUT_OF_SCOPE/i.test(text) || text.length < 6) return outOfScope;
  const check = checkRecordIds(text, evidence);
  if (!check.ok) return { refused: true, decision: "UNDECIDED", mode: "generative", withheld: text, text: `The model's answer was withheld because ${check.reason}.` };
  return { refused: false, decision: "ANSWERED", mode: "generative", text, model: llm.label };
}
