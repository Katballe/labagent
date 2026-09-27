// A small, dependency-free retriever over the validated corpus (knowledge.js).
// It scores a question against every chunk with TF-IDF-style term weighting and
// returns the best chunks plus a 0..1 confidence (how much of the question the
// retrieved chunks cover).
//
// Two ways a question is refused here, before any answer is attempted:
//   1. coverage below the confidence threshold, and
//   2. the question names something the corpus never mentions at all
//      ("…dissolution on the moon?", "…batch B-9999?") — the rest of the words
//      may match, but the corpus can't be the source of an answer about it.
// A small synonym map keeps ordinary rephrasings ("scales" for "balance") from
// being refused just because the SOPs use a different word.

import { KNOWLEDGE } from "../data/knowledge.js";
import { CORPUS } from "../data/dataset.js";

const TITLE = new Map(CORPUS.map((c) => [c.id, c.title]));

// Function words and question framing — never evidence of topic.
const STOP = new Set(
  ("a an the of for to in on at is are was were be been by with and or as what which who whom whose " +
    "how when where why does do did can could should would will shall may might this that these those " +
    "from into per me my our we us you your i it its all any show list give tell about under over " +
    "between within need needs needed require required requires used use using there their them they " +
    "if then than so such some one ones get got please kindly exactly currently actually really " +
    "happen happens happened mean means meaning explain describe say says state stated according " +
    "rule rules requirement requirements procedure procedures document documents often much many " +
    "long count counts counted thing things anything something okay ok also just still before after " +
    "whats what's is there are there own stand cover covers covered event events situation situations case cases circumstance " +
    "circumstances").split(/\s+/)
);

// Multi-word rewrites applied to the lowercased question first.
const PHRASES = [
  [/\bout[\s-]+of[\s-]+spec(ification)?s?\b/g, "oos"],
  [/\bhow often\b/g, "interval"],
  [/\bkf\b/g, "karl fischer"],
  [/\bcu\b/g, "content uniformity"],
];

// Single-word synonyms → the corpus's own vocabulary.
const SYNONYMS = {
  scale: "balance", scales: "balance",
  moisture: "water",
  frequency: "interval", frequently: "interval",
  redo: "retest",
  lab: "laboratory", labs: "laboratory",
  spec: "specification", specs: "specification",
  impurities: "impurity", degradants: "impurity",
  equipment: "instrument",
  speed: "rpm",
  trained: "qualified", training: "qualification",
};

// Light stemmer: strip one common suffix, then keep the first 6 characters, so
// "criterion"/"criteria", "calibration"/"calibrated", "instrument"/"instruments"
// match while "analyst"/"analytical" stay apart. Ids (anything with a digit,
// like MV-0412) are left intact.
const SUFFIXES = ["ations", "ation", "ities", "ity", "ically", "ical", "ings", "ing", "ied", "ies", "ed", "es", "s", "ly"];
export function stem(t) {
  if (/\d/.test(t)) return t;
  for (const s of SUFFIXES) {
    if (t.endsWith(s) && t.length - s.length >= 4) { t = t.slice(0, -s.length); break; }
  }
  if (t.length > 4 && t.endsWith("e")) t = t.slice(0, -1); // CR-004: "expire" ~ "expired"
  return t.length > 6 ? t.slice(0, 6) : t;
}

/** Normalised words of a text (after phrase + synonym mapping, before stemming). */
export function words(s) {
  let text = (s || "").toLowerCase();
  for (const [re, to] of PHRASES) text = text.replace(re, to);
  return text
    .replace(/[^a-z0-9%.\-]/g, " ")
    .split(/[\s.]+/)
    .flatMap((t) => (t.includes("-") ? [t, ...t.split("-")] : [t])) // "mv-0412" -> mv-0412, mv, 0412
    .map((t) => t.replace(/^-+|-+$/g, "").trim())
    .filter((t) => t.length >= 2 && !STOP.has(t))
    .flatMap((t) => (SYNONYMS[t] ? SYNONYMS[t].split(" ") : [t]));
}

export function tokens(s) {
  return words(s).map(stem);
}

// Build the index once. `tags` carries ids the chunk is about (method,
// instrument) so "MV-0412" retrieves the right chunk without polluting the
// displayed excerpt.
export const DOCS = KNOWLEDGE.map((c) => ({
  ...c,
  title: TITLE.get(c.doc) || "",
  terms: new Set(tokens(`${c.doc} ${TITLE.get(c.doc) || ""} ${c.sec} ${c.text} ${(c.tags || []).join(" ")}`)),
}));
const N = DOCS.length;
export const DF = new Map();
for (const d of DOCS) for (const t of d.terms) DF.set(t, (DF.get(t) || 0) + 1);

const IDF_MAX = Math.log(N / 0.5); // weight for a term absent from the corpus
export function idf(t) {
  const df = DF.get(t);
  return df ? Math.log(N / df) + 0.25 : IDF_MAX;
}

/** Question words the corpus has never seen (after synonyms) — the "unknown subject". */
export function unknownTerms(question, vocabulary = DF) {
  const out = [];
  for (const w of new Set(words(question))) {
    if (w.length < 3 || /^\d+$/.test(w)) continue; // bare numbers are parts of ids, judged via the whole id
    if (!vocabulary.has(stem(w))) out.push(/\d/.test(w) ? w.toUpperCase() : w);
  }
  return out;
}

// Returns { chunks: [{doc, sec, text, status, score}], confidence, conflict, unknown }.
export function retrieve(question, k = 4) {
  const qTerms = [...new Set(tokens(question))];
  const unknown = unknownTerms(question);
  if (!qTerms.length) return { chunks: [], confidence: 0, conflict: null, unknown, qTerms };

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

  const chunks = top.map((s) => ({
    doc: s.d.doc,
    sec: s.d.sec,
    text: s.d.text,
    title: s.d.title,
    tags: s.d.tags || [],
    status: s.d.status,
    // per-chunk score, normalized against the top hit for display
    score: best ? Math.max(0.4, Math.min(0.99, s.raw / best)) : 0,
  }));

  // Surface a superseded/effective conflict when both versions are retrieved.
  let conflict = null;
  if (chunks.some((c) => c.status === "SUPERSEDED") && chunks.some((c) => c.status === "EFFECTIVE")) {
    const sup = chunks.find((c) => c.status === "SUPERSEDED");
    conflict = `The corpus also holds a superseded version (${sup.doc}, ${sup.sec.replace(/\s*\(SUPERSEDED\)/, "")}) that says something different. This answer relies only on the EFFECTIVE version.`;
  }

  return { chunks, confidence, conflict, unknown, qTerms };
}
