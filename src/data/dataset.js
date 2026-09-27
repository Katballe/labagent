// LabAgent synthetic dataset — all fictional, authored for the project.
// No real company documents. IDs follow GxP-style conventions.
// Ported from the original prototype's labagent-data.js.

export const CORPUS = [
  { id: "SOP-AM-0412", title: "Analytical Method MV-0412 — Assay & Dissolution (HPLC)", ver: "4.0", eff: "2026-01-12", status: "EFFECTIVE", type: "Analytical Method" },
  { id: "SOP-AM-0388", title: "Analytical Method MV-0388 — Related Substances (HPLC)", ver: "2.1", eff: "2025-09-03", status: "EFFECTIVE", type: "Analytical Method" },
  { id: "SOP-AM-0407", title: "Analytical Method MV-0407 — Water Content (Karl Fischer)", ver: "1.3", eff: "2025-11-20", status: "EFFECTIVE", type: "Analytical Method" },
  { id: "SOP-QA-0102", title: "Handling of Out-of-Specification (OOS) Results", ver: "3.0", eff: "2025-10-01", status: "EFFECTIVE", type: "Quality SOP" },
  { id: "SOP-QA-0102 v2.1", title: "Handling of Out-of-Specification (OOS) Results", ver: "2.1", eff: "2023-06-14", status: "SUPERSEDED", type: "Quality SOP" },
  { id: "SOP-QA-0117", title: "Deviation Management and CAPA", ver: "2.0", eff: "2025-07-08", status: "EFFECTIVE", type: "Quality SOP" },
  { id: "SOP-EQ-0031", title: "Equipment Calibration Programme", ver: "5.2", eff: "2025-12-15", status: "EFFECTIVE", type: "Equipment SOP" },
  { id: "SOP-EQ-0035", title: "HPLC System Qualification (IQ/OQ/PQ)", ver: "3.1", eff: "2025-08-22", status: "EFFECTIVE", type: "Equipment SOP" },
  { id: "SOP-LC-0009", title: "Sample Lifecycle — Receipt to Disposal", ver: "4.4", eff: "2026-02-02", status: "EFFECTIVE", type: "Lifecycle SOP" },
  { id: "POL-DI-0001", title: "Data Integrity Policy (ALCOA+)", ver: "2.0", eff: "2025-05-30", status: "EFFECTIVE", type: "Policy" },
  { id: "VAL-PQ-0288", title: "Performance Qualification Protocol — HPLC INS-114", ver: "1.0", eff: "2024-03-11", status: "EXECUTED", type: "Validation" },
  { id: "TRN-MX-0207", title: "Training Matrix — Analytical Laboratory", ver: "live", eff: "—", status: "EFFECTIVE", type: "Training Record" },
  { id: "SOP-AM-0421", title: "Analytical Method MV-0421 — Content Uniformity (UV)", ver: "1.1", eff: "2026-03-14", status: "EFFECTIVE", type: "Analytical Method" },
  { id: "SOP-QA-0131", title: "Laboratory Investigation Report Writing", ver: "1.0", eff: "2025-04-19", status: "EFFECTIVE", type: "Quality SOP" },
  { id: "SOP-EQ-0040", title: "Analytical Balance Verification and Use", ver: "2.3", eff: "2026-01-28", status: "EFFECTIVE", type: "Equipment SOP" },
  { id: "VAL-OQ-0301", title: "Operational Qualification Protocol — KF Titrator INS-201", ver: "1.0", eff: "2025-02-06", status: "EXECUTED", type: "Validation" },
  { id: "SOP-LC-0012", title: "Reference Standard Management", ver: "3.0", eff: "2025-12-01", status: "EFFECTIVE", type: "Lifecycle SOP" },
  { id: "INV-2024-031", title: "Laboratory Investigation — Assay OOS on HPLC INS-112", ver: "final", eff: "2024-05-20", status: "CLOSED", type: "Investigation" },
];

// Suggested questions for the Assistant tab — a mix the corpus answers and
// ones it deliberately can't (so the refusal path is visible too).
export const SUGGESTED = [
  "What's the acceptance criterion for dissolution in method MV-0412?",
  "Which instruments require quarterly calibration?",
  "What is the retest policy after an OOS result?",
  "What's the shelf life of batch B-2291?",
  "What is the specification for water content under MV-0407?",
  "What checks are required before using an analytical balance?",
  "What must a Phase 1 investigation report contain?",
  "What does an HPLC column cost?",
];

// ---- Tier 2 read-only query knowledge (used as suggestions + eval targets) --
export const QUERIES = [
  {
    keys: ["out-of-spec", "oos", "b-2291"],
    q: "Show me all out-of-spec results for batch B-2291 in the last 30 days",
  },
  {
    keys: ["ins-114", "tested on", "this week"],
    q: "List samples tested on INS-114 this week",
  },
  {
    keys: ["calibration status", "instrument", "register"],
    q: "What is the current calibration status of all release HPLC systems?",
  },
  {
    keys: ["qualified on", "qualification", "trained on"],
    q: "Which analysts are qualified on method MV-0412?",
  },
  {
    keys: ["b-2290", "results for batch"],
    q: "Summarise all results for batch B-2290",
  },
  {
    keys: ["overdue", "due for calibration", "next 30 days"],
    q: "Which instruments are overdue or due for calibration in the next 30 days?",
  },
];

// ---- Tier 3 OOS workflow ---------------------------------------------------
export const OOS_CASE = {
  trigger: "Sample S-8841 failed assay for method MV-0412 — result 78.1 %LC against specification 95.0–105.0 %LC.",
  sample: "S-8841", batch: "B-2291", method: "MV-0412", instrument: "INS-114", analyst: "A-207",
  runTs: "2026-07-08 14:22", stage: "Phase III clinical",
};

// The 8 steps are a FIXED sequence per SOP-QA-0102. The model reasons WITHIN a
// step (fills `summary` from the evidence) but never chooses the steps.
export const OOS_STEPS = [
  {
    n: 1, verb: "RETRIEVE", tier: "T1", title: "OOS procedure & decision tree",
    task: "State, in two sentences, the Phase 1 laboratory investigation decision tree from SOP-QA-0102 §6.1–6.4.",
    fallback: "Retrieved SOP-QA-0102 v3.0 (effective). Phase 1 decision tree: (a) obvious error check → (b) instrument status → (c) analyst qualification → (d) pattern review → (e) classification.",
    evidence: [{ ref: "SOP-QA-0102 §6.1–6.4", kind: "doc", detail: "Phase 1 laboratory investigation flow, decision criteria for lab-error vs manufacturing classification." }],
    status: "ok",
  },
  {
    n: 2, verb: "LOOKUP", tier: "T2", title: "Sample record S-8841",
    task: "Summarise the sample record for S-8841 including result, spec, instrument and analyst.",
    fallback: "Sample S-8841 · batch B-2291 · method MV-0412 (assay, HPLC) · instrument INS-114 · analyst A-207 · run 2026-07-08 14:22 · stage Phase III clinical. Result 78.1 %LC vs spec 95.0–105.0 %LC.",
    evidence: [{ ref: "samples/S-8841 · results/R-30117", kind: "db", detail: "SELECT … FROM samples JOIN results WHERE sample_id='S-8841' — 1 row, read-only." }],
    status: "ok",
  },
  {
    n: 3, verb: "CHECK", tier: "T2", title: "Instrument calibration at run time",
    task: "Was INS-114 in calibration when S-8841 was run? Compare cal_due to run_ts and state the compliance impact.",
    fallback: "INS-114 calibration expired 2026-07-05 — three days BEFORE the S-8841 run on 2026-07-08. The result was generated on an out-of-calibration instrument; per SOP-EQ-0031 §4.1 it is not reportable. Probable lab-error root cause.",
    evidence: [
      { ref: "instruments/INS-114 · calibrations/CAL-2411", kind: "db", detail: "cal_performed 2026-04-05, interval 91 d (Category B, quarterly), cal_due 2026-07-05 < run_ts 2026-07-08." },
      { ref: "SOP-EQ-0031 §4.1", kind: "doc", detail: "Category B instruments: quarterly calibration. Results from out-of-calibration instruments are not reportable." },
    ],
    status: "flag",
    flag: "CALIBRATION EXPIRED AT RUN TIME",
  },
  {
    n: 4, verb: "CHECK", tier: "T2", title: "Analyst qualification on MV-0412",
    task: "Was analyst A-207 qualified on MV-0412 at run time? State the qualification dates.",
    fallback: "Analyst A-207 qualified on MV-0412 since 2025-11-18 (requalification current, due 2026-11-18). No qualification gap at run time.",
    evidence: [{ ref: "TRN-MX-0207 / A-207 · MV-0412", kind: "db", detail: "Qualification granted 2025-11-18, status CURRENT at 2026-07-08." }],
    status: "ok",
  },
  {
    n: 5, verb: "SEARCH", tier: "T2", title: "Related OOS — instrument / batch / method, 90 d",
    task: "Given related OOS results, state whether the failure signature follows the instrument or the batch.",
    fallback: "One other related OOS in the last 90 days: R-30102 (S-8839, same batch B-2291, INS-114, 2026-07-06). Both B-2291 OOS results were run on INS-114 after its calibration expired on 2026-07-05 — consistent with an instrument cause. Every B-2291 result so far comes from INS-114, so a batch cause cannot be excluded until the retest on an in-calibration system.",
    evidence: [
      { ref: "results — 2 rows: R-30117, R-30102", kind: "db", detail: "oos_flag=1 AND (instrument='INS-114' OR batch='B-2291' OR method='MV-0412') AND run_ts ≥ now−90d." },
      { ref: "results — R-29981", kind: "db", detail: "The only other OOS in the window (S-8815, MV-0388, INS-113) — unrelated method and instrument." },
    ],
    status: "flag",
    flag: "2ND OOS ON INS-114 POST-EXPIRY",
  },
  {
    n: 6, verb: "SEARCH", tier: "T1", title: "Precedent search — similar historical investigations",
    task: "Does precedent INV-2024-031 match this signature, and what did it conclude?",
    fallback: "1 precedent: INV-2024-031 — assay OOS on out-of-calibration HPLC (INS-112, 2024). Concluded lab error; retest from original preparation after recalibration passed at 99.1 %LC. Known failure mode.",
    evidence: [{ ref: "INV-2024-031 §5 Conclusion", kind: "doc", detail: "Root cause: quantitation drift on out-of-calibration detector. Corrective action: recalibrate, retest per SOP-QA-0102 §7.3." }],
    status: "ok",
  },
  {
    n: 7, verb: "APPLY", tier: "AI", title: "Walk SOP decision tree — classification",
    task: "Walk the SOP-QA-0102 §6.4 decision tree using the gathered facts and state the proposed classification with its supporting evidence.",
    fallback: "Decision tree §6.4: (a) no transcription/preparation error → (b) instrument NOT in calibration at run time → branch L2: probable laboratory error. Supporting: identical signature on second B-2291 sample post-expiry; precedent INV-2024-031; analyst qualification excluded.",
    evidence: [
      { ref: "SOP-QA-0102 §6.4 branch L2", kind: "doc", detail: "Where the instrument was outside its calibration interval at run time, classify as probable laboratory error pending retest." },
    ],
    status: "ok",
    proposal: "PROBABLE LABORATORY ERROR",
  },
  {
    n: 8, verb: "DRAFT", tier: "AI", title: "Phase 1 investigation record",
    task: "Note that the draft investigation record has been generated and is awaiting human review.",
    fallback: "Draft INV-2026-084 generated. Every fact cited to its source record, 0 uncited claims. Awaiting qualified-person review — nothing has been written to the LIMS.",
    evidence: [],
    status: "ok",
  },
];

export const OOS_DRAFT = {
  id: "INV-2026-084 (DRAFT)",
  classification: "Probable laboratory error",
  confidence: "High — pending confirmatory retest",
  sections: [
    { h: "1. Description of OOS result", t: "Sample S-8841 (batch B-2291, Phase III clinical) returned an assay result of 78.1 %LC against a specification of 95.0–105.0 %LC. Method MV-0412 (HPLC), instrument INS-114, analyst A-207, run completed 2026-07-08 14:22.", cite: "results/R-30117" },
    { h: "2. Obvious error review", t: "No transcription, dilution or sample-preparation error identified in the raw data review. Chromatographic system suitability passed at sequence start.", cite: "results/R-30117 · raw data" },
    { h: "3. Instrument status", t: "INS-114 was OUTSIDE its calibration interval at run time. Calibration CAL-2411 expired 2026-07-05; the run occurred 2026-07-08. Per SOP-EQ-0031 §4.1 results from out-of-calibration instruments are not reportable.", cite: "calibrations/CAL-2411 · SOP-EQ-0031 §4.1" },
    { h: "4. Analyst qualification", t: "Analyst A-207 held a current qualification on MV-0412 at run time (granted 2025-11-18). Analyst error is not indicated.", cite: "TRN-MX-0207" },
    { h: "5. Pattern review", t: "One additional OOS (R-30102, S-8839, same batch) also on INS-114 after calibration expiry. All B-2291 results so far were run on INS-114, so the pattern is consistent with an instrument cause but cannot yet exclude a batch cause — the retest on an in-calibration system decides. Historical precedent with the same signature: INV-2024-031.", cite: "results query · INV-2024-031" },
    { h: "6. Proposed classification & next steps", t: "Probable laboratory error per SOP-QA-0102 §6.4 branch L2. Proposed actions: remove INS-114 from service; recalibrate; retest S-8841 and S-8839 from original preparations with QA pre-approval per §7.3; extend review to all INS-114 results 2026-07-05 → present.", cite: "SOP-QA-0102 §6.4, §7.3" },
  ],
};
