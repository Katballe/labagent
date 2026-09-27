// Intended use per function and the EU GMP Annex 22 (draft, July 2025) clause
// status, shown in the Compliance tab. The approved text lives in
// docs/validation/intended-use.md and docs/compliance/annex-22-assessment.md;
// keep this summary in step with them.

export const REGULATION = {
  name: "EU GMP Annex 22 — Artificial Intelligence",
  status: "Draft for consultation (published 7 July 2025, consultation closed 7 October 2025). Not yet final or enforceable.",
  note: "EMA held a workshop on 30 June–1 July 2026 on whether generative AI could be allowed in GMP with guardrails. Until the final text is published, LabAgent follows the stricter draft: no generative AI in critical applications.",
  source: "https://health.ec.europa.eu/document/download/5f38a92d-bb8e-4264-8898-ea076e926db6_en?filename=mp_vol4_chap4_annex22_consultation_guideline_en.pdf",
};

export const FUNCTIONS = [
  {
    id: "F1", tier: "T1", name: "SOP question answering",
    criticality: "Non-critical", critical: false,
    decides: "Deterministic retrieval decides whether to answer (otherwise UNDECIDED) and which controlled passage governs.",
    ai: "Optional. The model words the answer from the retrieved passages only; citations are checked in code; the verbatim passage is always shown.",
    human: "The user checks the answer against the passage and the controlled SOP before acting on it, and records a verdict.",
  },
  {
    id: "F2", tier: "T2", name: "Read-only data look-up",
    criticality: "Validated templates may support GMP decisions; AI-drafted queries are non-critical", critical: false,
    decides: "Fixed, tested query templates; a read-only guard; SQLite locked read-only; change requests declined.",
    ai: "Optional, only when no template fits. The query is labelled UNVALIDATED and is informational only.",
    human: "Results from unvalidated queries must be verified in the LIMS before use.",
  },
  {
    id: "F3", tier: "T3", name: "OOS Phase 1 triage",
    criticality: "Critical — feeds batch disposition", critical: true,
    decides: "Fixed 8-step sequence, fixed findings, rule-based classification (SOP-QA-0102 decision tree), human approval gate.",
    ai: "None in the record or the classification. Optional explanations of the evidence, labelled and not part of the record.",
    human: "A qualified person reviews every step and signs (demo e-signature) or rejects with a reason.",
  },
  {
    id: "F4", tier: "AT", name: "Audit trail",
    criticality: "Critical — data integrity", critical: true,
    decides: "Deterministic. SHA-256 hash chain, append-only, written by the system (the agent) — not by the client.",
    ai: "None.",
    human: "Periodic audit-trail review; export for inspection.",
  },
  {
    id: "F5", tier: "EV", name: "Monitoring & self-check",
    criticality: "Supporting", critical: false,
    decides: "Counters, input-drift terms, daily deterministic suite and model determinism probe.",
    ai: "The probe calls the pinned model to measure repeatability.",
    human: "System owner reviews trends and self-check failures; triggers change control.",
  },
];

// status: "met" | "partial" | "open" — honest, for a demonstration system.
export const ANNEX22 = [
  { clause: "1 Scope", status: "met", how: "LLM use limited to non-critical tasks with a human in the loop; the critical OOS record and classification are deterministic." },
  { clause: "2.1 Personnel", status: "open", how: "Roles defined in the validation plan; names, qualifications and access levels not yet assigned." },
  { clause: "2.2 Documentation", status: "partial", how: "Intended use, URS, FS, risk assessment, test plan, traceability and report exist; none approved yet." },
  { clause: "2.3 Quality risk management", status: "partial", how: "FMEA with controls traced to tests; needs SME/QA review." },
  { clause: "3.1 Intended use", status: "partial", how: "Described per function with input sample space and limitations; SME approval pending." },
  { clause: "3.2 Subgroups", status: "met", how: "Defined per function; metrics reported per subgroup." },
  { clause: "3.3 Human-in-the-loop", status: "partial", how: "Responsibilities stated; review verdicts recorded; operator training/performance monitoring procedure not yet in place." },
  { clause: "4.1–4.2 Metrics & acceptance criteria", status: "met", how: "Confusion matrix, sensitivity, specificity, precision, F1, citation accuracy; criteria fixed in TP-001 before execution (approval pending)." },
  { clause: "4.3 No decrease", status: "open", how: "Performance of the manual look-up process not yet measured." },
  { clause: "5.1–5.2 Test data selection & size", status: "partial", how: "Stratified by subgroup; too small for high-confidence claims (Wilson bounds reported)." },
  { clause: "5.3 Labelling", status: "open", how: "Labels set from the controlled sources; independent SME verification pending." },
  { clause: "5.4–5.5 Pre-processing & exclusion", status: "met", how: "None; questions used verbatim; nothing excluded." },
  { clause: "5.6 Generated test data", status: "open", how: "HT-001 was written by an AI assistant — justified as a bootstrap only; an SME-written set is required." },
  { clause: "6 Test data independence", status: "partial", how: "Separate held-out set, frozen by hash, access logged; the same party developed the system and wrote the set." },
  { clause: "7 Test execution", status: "partial", how: "Plan approved-before-run process, scripted execution, deviations recorded; approvals pending." },
  { clause: "8 Explainability", status: "met", how: "Each answer records the passages used and the question words each matched; reviewed as part of result approval." },
  { clause: "9 Confidence", status: "met", how: "Retrieval confidence logged per answer; below threshold the outcome is UNDECIDED." },
  { clause: "10.1–10.2 Change & configuration control", status: "met", how: "Pinned model and settings; configuration fingerprint in every audit entry and compared with the validated run; changes via Git + CI evals." },
  { clause: "10.3 Performance monitoring", status: "met", how: "Agent counters and daily self-check (deterministic suite + determinism probe)." },
  { clause: "10.4 Input sample-space monitoring", status: "met", how: "Out-of-corpus terms counted daily by the agent." },
  { clause: "10.5 Human review records", status: "met", how: "Reviewer verdicts written to the audit trail and counted by the monitor." },
];

export const DOCS_BASE = "https://github.com/Katballe/labagent/blob/main/docs/";
