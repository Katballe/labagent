// Instant mode: deterministic, extractive answers — no language model at all.
// The answer is made only of passages quoted verbatim from the sources, each
// with its citation, so it cannot say anything the sources don't. If no single
// passage covers the question well enough, it refuses.

import { tokens, idf } from "./rag.js";

const baseId = (doc) => String(doc).replace(/\s+v\d+(\.\d+)*$/i, "");

/**
 * Pick the passages that answer the question.
 * units: [{ text, header?, cite: {doc, sec}, rank, status? }] — rank 0 is the
 * best-retrieved. `header` (document id, section title, tags) counts towards
 * coverage but is not quoted: "§6.2 Acceptance Criteria — Dissolution" is what
 * makes its text the answer to an acceptance-criterion question.
 * Returns { quotes: [{text, cite}], ratio } or null when nothing answers it.
 */
export function pickQuotes(question, units, { minRatio = 0.5, max = 2, weight = idf } = {}) {
  const qTerms = [...new Set(tokens(question))];
  if (!qTerms.length) return null;
  const all = qTerms.reduce((s, t) => s + weight(t), 0);
  // Never quote a superseded passage when an effective one is available.
  const hasEffective = units.some((u) => u.status !== "SUPERSEDED");
  // The effective version answers for the version it replaced: a question
  // phrased around the old rule ("retest at the analyst's discretion") is
  // answered with the current rule, and the conflict is flagged separately.
  const replaced = new Map();
  for (const u of units) {
    if (u.status !== "SUPERSEDED") continue;
    const base = baseId(u.cite.doc);
    replaced.set(base, [...(replaced.get(base) || []), ...tokens(u.text)]);
  }
  const pool = units
    .filter((u) => !(hasEffective && u.status === "SUPERSEDED"))
    .map((u) => {
      const list = tokens(`${u.text} ${u.header || ""}`);
      const terms = new Set([...list, ...(replaced.get(baseId(u.cite.doc)) || [])]);
      const covered = qTerms.filter((t) => terms.has(t));
      const got = covered.reduce((s, t) => s + weight(t), 0);
      // Between passages covering the same words, prefer the one whose heading is
      // about them (a section title says what the section is for), then the one
      // where they are densest, then the better-retrieved one.
      const head = new Set(tokens(u.header || ""));
      const topical = all ? covered.filter((t) => head.has(t)).reduce((s, t) => s + weight(t), 0) / all : 0;
      const focus = list.filter((t) => covered.includes(t)).length / Math.max(1, list.length);
      return { u, covered, ratio: all ? got / all : 0, score: got + 0.3 * topical + 0.5 * focus - u.rank * 0.01 };
    })
    .filter((p) => p.covered.length)
    .sort((a, b) => b.score - a.score);
  if (!pool.length || pool[0].ratio < minRatio) return null;

  // A second passage only if it covers a real part of the question the first doesn't.
  const chosen = [pool[0]];
  const have = new Set(pool[0].covered);
  for (const p of pool.slice(1)) {
    if (chosen.length >= max) break;
    const adds = p.covered.filter((t) => !have.has(t));
    const addWeight = adds.reduce((s, t) => s + weight(t), 0);
    if (addWeight >= 0.2 * all && p.score >= pool[0].score * 0.6) {
      chosen.push(p);
      adds.forEach((t) => have.add(t));
    }
  }
  return { quotes: chosen.map((p) => ({ text: p.u.text, cite: p.u.cite })), ratio: pool[0].ratio };
}

/** Format quotes as an answer: each quoted verbatim with its source. */
export function formatQuotes(quotes) {
  return quotes.map((q) => `“${q.text}”\n— ${q.cite.doc} ${q.cite.sec}`).join("\n\n");
}
