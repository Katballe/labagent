// A small, dependency-free retriever over the validated corpus (knowledge.js).
// It scores a question against every chunk with TF-IDF-style term weighting and
// returns the best chunks plus a 0..1 confidence. Terms in the question that
// don't appear ANYWHERE in the corpus count against confidence — that is what
// makes the assistant refuse out-of-scope questions instead of guessing.

import { KNOWLEDGE } from "../data/knowledge.js";

const STOP = new Set(
  ("a an the of for to in on at is are was be by with and or as what which who " +
    "how when where why does do did can could should would will shall this that " +
    "these those from into per me my our all any it its show list give tell about " +
    "under over between within need require required used use").split(" ")
);

// Crude but effective stemmer: collapse a word to its first 4 characters so
// "criterion"/"criteria", "calibration"/"calibrated", "instrument"/"instruments"
// all match. Tokens containing digits (ids like MV-0412) are left intact.
function stem(t) {
  if (/\d/.test(t)) return t;
  return t.length > 4 ? t.slice(0, 4) : t;
}

function tokens(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9%.\-]/g, " ")
    .split(/[\s.]+/)
    .flatMap((t) => {
      // split hyphenated ids into whole + parts: "mv-0412" -> mv-0412, mv, 0412
      if (t.includes("-")) return [t, ...t.split("-")];
      return [t];
    })
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t))
    .map(stem);
}

// Build the index once. `tags` carries ids the chunk is about (method,
// instrument) so "MV-0412" retrieves the right chunk without polluting the
// displayed excerpt.
const DOCS = KNOWLEDGE.map((c) => ({
  ...c,
  terms: new Set(tokens(`${c.doc} ${c.sec} ${c.text} ${(c.tags || []).join(" ")}`)),
}));
const N = DOCS.length;
const DF = new Map();
for (const d of DOCS) for (const t of d.terms) DF.set(t, (DF.get(t) || 0) + 1);

const IDF_MAX = Math.log(N / 0.5); // weight for a term absent from the corpus
function idf(t) {
  const df = DF.get(t);
  return df ? Math.log(N / df) + 0.25 : IDF_MAX;
}

// Returns { chunks: [{doc, sec, text, status, score}], confidence, conflict }.
export function retrieve(question, k = 4) {
  const qTerms = [...new Set(tokens(question))];
  if (!qTerms.length) return { chunks: [], confidence: 0, conflict: null };

  const queryMass = qTerms.reduce((s, t) => s + idf(t), 0);

  const scored = DOCS.map((d) => {
    let matched = 0;
    for (const t of qTerms) if (d.terms.has(t)) matched += idf(t);
    return { d, raw: matched };
  }).sort((a, b) => b.raw - a.raw);

  const best = scored[0]?.raw || 0;
  const top = scored.filter((s) => s.raw > 0).slice(0, k);

  // Confidence = how much of the question's weighted meaning the retrieved set
  // COLLECTIVELY covers. Terms absent from the corpus entirely carry a high idf
  // and are never matched, which is what drives an out-of-scope question down.
  const covered = new Set();
  for (const s of top) for (const t of qTerms) if (s.d.terms.has(t)) covered.add(t);
  const coveredMass = [...covered].reduce((s, t) => s + idf(t), 0);
  const confidence = queryMass ? Math.min(1, coveredMass / queryMass) : 0;

  const chunks = top
    .map((s) => ({
      doc: s.d.doc,
      sec: s.d.sec,
      text: s.d.text,
      status: s.d.status,
      // per-chunk score, normalized against the top hit for display
      score: best ? Math.max(0.4, Math.min(0.99, s.raw / best)) : 0,
    }));

  // Surface a superseded/effective conflict when both versions are retrieved.
  const docs = chunks.map((c) => c.doc);
  const hasSup = chunks.some((c) => c.status === "SUPERSEDED");
  const hasEff = chunks.some((c) => c.status === "EFFECTIVE");
  let conflict = null;
  if (hasSup && hasEff) {
    const sup = chunks.find((c) => c.status === "SUPERSEDED");
    conflict =
      `The corpus contains a superseded version (${sup.doc}). The answer below follows the EFFECTIVE version; the obsolete one is shown but not relied upon.`;
  }

  return { chunks, confidence, conflict, docs };
}
