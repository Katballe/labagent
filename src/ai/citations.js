// Citation checking for answers written by a language model (local AI mode).
// Cite-or-refuse is enforced here, not trusted to the model: every document or
// record id in the answer must be one the model was actually given, and a
// Tier-1 answer must cite at least one of them. Otherwise the answer is
// withheld (shown collapsed as "not relied upon").

// Controlled-document ids: SOP-AM-0412, POL-DI-0001, VAL-PQ-0288, TRN-MX-0207, INV-2024-031
export const DOC_ID = /\b(?:SOP|POL|VAL|TRN)-[A-Z]{2}-\d{4}\b|\bINV-\d{4}-\d{3}\b/g;
// Any record id: the above plus S-8841, B-2291, INS-114, MV-0412, A-207, R-30117, CAL-2411
export const RECORD_ID = /\b(?:(?:SOP|POL|VAL|TRN)-[A-Z]{2}-\d{4}|INV-\d{4}-\d{3}|INS-\d{3}|MV-\d{4}|CAL-\d{4}|[SBAR]-\d{3,5})\b/g;

const uniq = (xs) => [...new Set(xs)];
export const baseDoc = (id) => id.replace(/\s+v\d+(\.\d+)*$/i, ""); // "SOP-QA-0102 v2.1" -> "SOP-QA-0102"

/**
 * Tier 1: the answer must cite ≥1 retrieved document and nothing else.
 * Returns { ok, cited, foreign, reason }.
 */
export function checkDocCitations(answer, retrievedDocs) {
  const allowed = new Set(retrievedDocs.map(baseDoc));
  const cited = uniq((answer.match(DOC_ID) || []).map(baseDoc));
  const foreign = cited.filter((c) => !allowed.has(c));
  if (foreign.length) return { ok: false, cited, foreign, reason: `it cited ${foreign.join(", ")}, which ${foreign.length > 1 ? "were" : "was"} not among the sources it was given` };
  if (!cited.length) return { ok: false, cited, foreign, reason: "it gave no citation" };
  return { ok: true, cited, foreign: [] };
}

/**
 * Tier 3 triage: every record id mentioned must appear in the gathered evidence.
 */
export function checkRecordIds(answer, evidenceText) {
  const known = new Set(evidenceText.match(RECORD_ID) || []);
  const mentioned = uniq(answer.match(RECORD_ID) || []);
  const foreign = mentioned.filter((m) => !known.has(m));
  if (foreign.length) return { ok: false, mentioned, foreign, reason: `it mentioned ${foreign.join(", ")}, which ${foreign.length > 1 ? "do" : "does"} not appear in the gathered evidence` };
  return { ok: true, mentioned, foreign: [] };
}
