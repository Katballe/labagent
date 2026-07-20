// High-level tier operations. Each returns a plain result object the UI renders.
// These compose: retriever (rag) + database (db) + the model (engine).

import { engine } from "./engine.js";
import { retrieve } from "./rag.js";
import { runSelect, validateSelect } from "./db.js";
import { SCHEMA_DOC } from "../data/seed.js";
import {
  T1_SYSTEM, t1User,
  T2_SYSTEM, t2User,
  T3_STEP_SYSTEM, t3StepUser,
  T3_TRIAGE_SYSTEM, t3TriageUser,
} from "./prompts.js";

function stripFences(s) {
  return (s || "")
    .replace(/```(?:sql)?/gi, "")
    .replace(/```/g, "")
    .trim();
}

// ---- Tier 1: retrieval-grounded QA with refusal ---------------------------
export async function answerQuestion({ question, threshold = 0.6, onToken }) {
  const { chunks, confidence, conflict } = retrieve(question);

  if (!chunks.length || confidence < threshold) {
    return {
      refused: true,
      confidence,
      conflict: null,
      cites: [],
      text:
        `I can't answer this from the validated corpus. Retrieval confidence ` +
        `(${confidence.toFixed(2)}) is below the ${threshold.toFixed(2)} threshold, so no answer ` +
        `is given rather than risk a confident hallucination. If this should be answerable, ` +
        `the source document may not be indexed — contact the corpus owner.`,
    };
  }

  const messages = [
    { role: "system", content: T1_SYSTEM },
    { role: "user", content: t1User(question, chunks) },
  ];
  let text = (await engine.chat({ messages, temperature: 0.2, maxTokens: 500, onToken })).trim();

  if (/INSUFFICIENT_EVIDENCE/i.test(text)) {
    return {
      refused: true,
      confidence,
      conflict: null,
      cites: [],
      text:
        `The retrieved sources don't actually contain the answer to this question, ` +
        `so I'm declining rather than guessing. (Retrieval matched documents but not the ` +
        `specific fact requested.)`,
    };
  }

  return {
    refused: false,
    confidence,
    conflict,
    text,
    cites: chunks.map((c) => ({ doc: c.doc, sec: c.sec, score: c.score, excerpt: c.text })),
  };
}

// ---- Tier 2: NL -> read-only SQL, executed for real -----------------------
export async function runDataQuery({ question, onToken }) {
  const messages = [
    { role: "system", content: T2_SYSTEM },
    { role: "user", content: t2User(question, SCHEMA_DOC) },
  ];
  let raw = (await engine.chat({ messages, temperature: 0, maxTokens: 300, onToken: null })).trim();
  let sql = stripFences(raw);

  if (/^NO_QUERY/i.test(sql) || !sql) {
    return {
      ok: false,
      sql: "-- No query generated.\n-- The question could not be mapped onto the allowed schema\n-- without guessing. Rephrase with an explicit entity (a batch,\n-- sample, instrument, method or analyst id).",
      cols: [], rows: [], note: "0 rows · nothing executed",
    };
  }

  const v = validateSelect(sql);
  if (!v.ok) {
    return {
      ok: false,
      sql,
      cols: [], rows: [],
      note: `Rejected by the read-only guard: ${v.reason}. Nothing executed.`,
      rejected: true,
    };
  }

  try {
    const { cols, rows } = await runSelect(v.sql);
    return {
      ok: true,
      sql: v.sql,
      cols,
      rows,
      note: `${rows.length} row${rows.length === 1 ? "" : "s"} · read-only · executed against synthetic SQLite`,
    };
  } catch (e) {
    return {
      ok: false,
      sql: v.sql,
      cols: [], rows: [],
      note: `SQL error: ${e.message}. Nothing written (read-only).`,
      error: true,
    };
  }
}

// ---- Tier 3: per-step reasoning, draft, triage assistant ------------------
function evidenceToText(step) {
  if (!step.evidence?.length) return "(no additional evidence for this step)";
  return step.evidence.map((e) => `- ${e.ref}: ${e.detail}`).join("\n");
}

export async function stepSummary({ step, onToken }) {
  // The evidence and the step are fixed; the model only phrases the finding.
  try {
    const messages = [
      { role: "system", content: T3_STEP_SYSTEM },
      { role: "user", content: t3StepUser(step, evidenceToText(step)) },
    ];
    const text = (await engine.chat({ messages, temperature: 0.2, maxTokens: 300, onToken })).trim();
    if (text.length < 8) return step.fallback;
    return text;
  } catch {
    return step.fallback; // deterministic fallback keeps the workflow honest if the model hiccups
  }
}

export function gatheredEvidenceText(steps) {
  const lines = steps.map(
    (s) => `Step ${s.n} (${s.title}): ${s.summaryText || s.fallback}` +
      (s.evidence?.length ? "\n  " + s.evidence.map((e) => `${e.ref}: ${e.detail}`).join("\n  ") : "")
  );
  return lines.join("\n");
}

export async function triageAnswer({ question, steps, onToken }) {
  const evidence = gatheredEvidenceText(steps);
  const messages = [
    { role: "system", content: T3_TRIAGE_SYSTEM },
    { role: "user", content: t3TriageUser(question, evidence) },
  ];
  const text = (await engine.chat({ messages, temperature: 0.2, maxTokens: 350, onToken })).trim();
  if (/OUT_OF_SCOPE/i.test(text) || text.length < 6) {
    return {
      refused: true,
      text:
        "I can only discuss the evidence gathered in this workflow's steps and the SOPs it cites — " +
        "I don't speculate beyond it. Try asking about the classification, INS-114's calibration, the analyst, the batch, or what happens on approval.",
    };
  }
  return { refused: false, text };
}
