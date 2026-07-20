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
];

// Suggested questions + reference answers. The reference answers double as
// gold-standard eval targets; the cites become the retrievable knowledge base.
export const QA = [
  {
    keys: ["dissolution", "mv-0412", "acceptance criterion"],
    q: "What's the acceptance criterion for dissolution in method MV-0412?",
    confidence: 0.94,
    answer: "For method MV-0412, the dissolution acceptance criterion at Stage 1 (S1) is Q = 80% of label claim dissolved at 30 minutes, n = 6 units, no unit below Q − 5%. If S1 fails, proceed to Stage 2 (n = 12 additional units) per USP <711> as referenced in §6.2.",
    cites: [
      { doc: "SOP-AM-0412", sec: "§6.2 Acceptance Criteria — Dissolution", score: 0.94, excerpt: "Stage 1 (S1): Q = 80% of label claim at 30 min, n = 6. No individual unit < Q − 5%. On S1 failure, extend to Stage 2 per USP <711>." },
      { doc: "SOP-AM-0412", sec: "§5.4 Dissolution Conditions", score: 0.81, excerpt: "Apparatus 2 (paddle), 50 rpm, 900 mL phosphate buffer pH 6.8, 37.0 ± 0.5 °C." },
    ],
  },
  {
    keys: ["quarterly", "calibration", "instruments require"],
    q: "Which instruments require quarterly calibration?",
    confidence: 0.89,
    answer: "Per the calibration programme, Category B instruments are calibrated quarterly: analytical balances in weighing suite W-2, the Karl Fischer titrator (INS-201), and all HPLC systems used for release testing (INS-112, INS-113, INS-114). Category A (daily verification) and Category C (annual) instruments are listed in Appendix 1.",
    cites: [
      { doc: "SOP-EQ-0031", sec: "§4.1 Calibration Categories", score: 0.89, excerpt: "Category B (quarterly): release-testing HPLC systems (INS-112/113/114), KF titrator INS-201, balances in suite W-2." },
      { doc: "SOP-EQ-0031", sec: "Appendix 1 — Instrument Register", score: 0.77, excerpt: "Full register of instrument categories, calibration intervals and responsible technicians." },
    ],
  },
  {
    keys: ["retest", "policy", "after an oos"],
    q: "What is the retest policy after an OOS result?",
    confidence: 0.9,
    conflict: "Note: the corpus also contains SOP-QA-0102 v2.1 (superseded 2025-10-01), which permitted retesting on analyst discretion. The current v3.0 requires QA pre-approval. Answer below follows the effective version.",
    answer: "Under the effective OOS procedure, retesting requires a documented hypothesis of laboratory error and QA pre-approval before any retest is performed. Retest is from the original sample preparation where the hypothesis implicates instrument or measurement error, or from a new preparation where preparation error is suspected. The original OOS result is never invalidated by the retest alone — only by a concluded Phase 1 investigation (§7.3).",
    cites: [
      { doc: "SOP-QA-0102", sec: "§7.3 Retesting", score: 0.9, excerpt: "Retesting shall be performed only against a documented laboratory-error hypothesis and with QA pre-approval. Retest results do not invalidate the original OOS result." },
      { doc: "SOP-QA-0102 v2.1", sec: "§7.1 (SUPERSEDED)", score: 0.72, excerpt: "[Superseded 2025-10-01] Analyst may initiate a single retest at their discretion where laboratory error is suspected." },
    ],
  },
  {
    keys: ["shelf life", "b-2291", "expiry of batch"],
    q: "What's the shelf life of batch B-2291?",
    refusal: true,
    confidence: 0.31,
    answer: "I can't answer this from the validated corpus. Shelf-life and stability data for batch B-2291 are not in the indexed document set. Consult the stability programme records in the QMS, or ask QA for the approved shelf-life statement.",
    cites: [],
  },
  {
    keys: ["karl fischer", "water content", "mv-0407"],
    q: "What is the specification for water content under MV-0407?",
    confidence: 0.92,
    answer: "Method MV-0407 (Karl Fischer, volumetric) specifies water content NMT 0.5% w/w for the drug substance. Sample mass 250–350 mg, dissolved directly in the titration vessel; system suitability requires a water standard recovery of 97.0–103.0% before sample runs (§6.1).",
    cites: [
      { doc: "SOP-AM-0407", sec: "§6.1 Specification & System Suitability", score: 0.92, excerpt: "Water content: NMT 0.5% w/w. System suitability: water standard recovery 97.0–103.0% prior to sample analysis." },
    ],
  },
  {
    keys: ["content uniformity", "mv-0421", "uniformity"],
    q: "What is the acceptance criterion for content uniformity under MV-0421?",
    confidence: 0.91,
    answer: "Method MV-0421 applies the USP <905> acceptance value: AV ≤ 15.0 for the first 10 units (L1). If AV exceeds 15.0, test 20 additional units; the batch complies if the final AV ≤ 15.0 and no individual unit is outside 0.75–1.25 times M (§6.3).",
    cites: [
      { doc: "SOP-AM-0421", sec: "§6.3 Acceptance Criteria", score: 0.91, excerpt: "L1: AV ≤ 15.0, n = 10. L2: n = 30 total, AV ≤ 15.0, no unit outside 0.75–1.25 M. Per USP <905>." },
    ],
  },
  {
    keys: ["reference standard", "expiry of standards", "standard management"],
    q: "How long can a working reference standard be used after qualification?",
    confidence: 0.88,
    answer: "Working standards are assigned a 12-month use period from qualification against the primary standard, or the primary standard's own expiry, whichever is earlier. Requalification requires assay agreement within ±1.0% of the primary (§5.2). Standards past their use period are quarantined, not discarded, pending QA disposition.",
    cites: [
      { doc: "SOP-LC-0012", sec: "§5.2 Working Standard Use Period", score: 0.88, excerpt: "Use period: 12 months from qualification or primary expiry, whichever earlier. Requalification: assay within ±1.0% of primary." },
    ],
  },
  {
    keys: ["balance", "daily verification", "weighing"],
    q: "What checks are required before using an analytical balance?",
    confidence: 0.9,
    answer: "Before first use each day: level check, zero check, and a daily verification with two certified weights bracketing the working range (tolerance ±0.1% of nominal). Results are recorded in the balance logbook before any GxP weighing. A failed verification takes the balance out of service and triggers a deviation per SOP-QA-0117.",
    cites: [
      { doc: "SOP-EQ-0040", sec: "§4.2 Daily Verification", score: 0.9, excerpt: "Daily: level, zero, two-point check with certified weights, tolerance ±0.1% nominal. Record before GxP use." },
      { doc: "SOP-QA-0117", sec: "§5.1 Deviation Triggers", score: 0.74, excerpt: "Failed equipment verification checks are recorded as deviations." },
    ],
  },
  {
    keys: ["investigation report", "phase 1 report", "report writing"],
    q: "What must a Phase 1 investigation report contain?",
    confidence: 0.93,
    answer: "Per SOP-QA-0131 §4: (1) description of the OOS result with raw-data references; (2) obvious-error review; (3) instrument status at run time; (4) analyst qualification; (5) pattern review across instrument, batch and method; (6) classification with the SOP-QA-0102 decision-tree path taken; and (7) proposed corrective actions. Every factual statement must cite its source record.",
    cites: [
      { doc: "SOP-QA-0131", sec: "§4 Report Content", score: 0.93, excerpt: "Sections 1–7 as listed; each factual statement traceable to a source record ID." },
      { doc: "SOP-QA-0102", sec: "§6.4 Classification", score: 0.79, excerpt: "Classification shall state the decision-tree branch applied and the facts driving each branch decision." },
    ],
  },
  {
    keys: ["price", "cost of", "salary", "weather", "column cost"],
    q: "What does an HPLC column cost?",
    refusal: true,
    confidence: 0.12,
    answer: "I can't answer this from the validated corpus. Procurement and pricing information is not in the indexed document set.",
    cites: [],
  },
];

export const SUGGESTED = QA.map((x) => x.q);

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
    fallback: "2 additional OOS in window: R-30102 (S-8839, B-2291, INS-114, 07-06 — also after calibration expiry) and R-29981 (S-8815, MV-0388, INS-113 — unrelated method/instrument). Both B-2291 assay OOS occurred on INS-114 after 07-05. Signature is instrument-consistent, not batch-consistent.",
    evidence: [
      { ref: "results — 3 rows", kind: "db", detail: "oos_flag=1 AND (instrument='INS-114' OR batch='B-2291' OR method='MV-0412') AND run_ts ≥ now−90d." },
    ],
    status: "flag",
    flag: "2ND OOS ON INS-114 POST-EXPIRY",
  },
  {
    n: 6, verb: "SEARCH", tier: "T1", title: "Historical investigations, similar signature",
    task: "Does precedent INV-2024-031 match this signature, and what did it conclude?",
    fallback: "1 match: INV-2024-031 — assay OOS on out-of-calibration HPLC (INS-112, 2024). Concluded lab error; retest from original preparation after recalibration passed at 99.1 %LC. Known failure mode.",
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
    { h: "5. Pattern review", t: "One additional OOS (R-30102, S-8839, same batch) also on INS-114 after calibration expiry; no OOS for B-2291 on in-calibration instruments. Signature is instrument-consistent, not batch-consistent. Historical precedent: INV-2024-031.", cite: "results query · INV-2024-031" },
    { h: "6. Proposed classification & next steps", t: "Probable laboratory error per SOP-QA-0102 §6.4 branch L2. Proposed actions: remove INS-114 from service; recalibrate; retest S-8841 and S-8839 from original preparations with QA pre-approval per §7.3; extend review to all INS-114 results 2026-07-05 → present.", cite: "SOP-QA-0102 §6.4, §7.3" },
  ],
};

// ---- Eval scorecard --------------------------------------------------------
export const EVALS = {
  meta: { cases: 60, lastRun: "2026-07-10 06:00 UTC", runtime: "4 m 12 s", verdict: "PASS" },
  rows: [
    { cat: "Factual retrieval", n: 20, target: "≥95%", baseline: 80, current: 95, pass: true, note: "correct answer + correct citation, exact-match on citation IDs" },
    { cat: "Refusal (out-of-corpus)", n: 15, target: "≥98%", baseline: 73, current: 100, pass: true, note: "must decline — info not in corpus", hero: true },
    { cat: "Contradiction handling", n: 8, target: "≥90%", baseline: 50, current: 92, pass: true, note: "surfaces the conflict, never silently picks a side" },
    { cat: "Superseded document", n: 5, target: "100%", baseline: 60, current: 100, pass: true, note: "cites current version, flags the obsolete one" },
    { cat: "Multi-hop OOS workflow", n: 12, target: "≥85%", baseline: 58, current: 88, pass: true, note: "per-step scoring: retrieval, checks, pattern, classification" },
  ],
  fabricated: { label: "Fabricated citations", n: 60, current: 0, note: "zero tolerance — any step citing a non-existent record fails the whole run" },
  failures: [
    { id: "EV-041", cat: "Multi-hop", desc: "Ambiguous two-signal case: classified 'probable lab error' where rubric requires 'indeterminate'. Overconfident on weak pattern evidence." },
    { id: "EV-017", cat: "Factual", desc: "Cited §5.4 (conditions) instead of §6.2 (criteria) for a dissolution question phrased around apparatus settings. Correct answer, wrong section." },
    { id: "EV-052", cat: "Contradiction", desc: "Surfaced the SOP-QA-0102 version conflict but did not state which version governed the answer." },
  ],
};

// ---- Audit log seed --------------------------------------------------------
export const AUDIT_SEED = [
  { id: "AUD-04212", ts: "2026-07-10 06:00:14", actor: "eval-runner", kind: "EVAL", action: "Eval suite run · 60 cases · verdict PASS", model: "local", prompt: "v1.4.2", hash: "c41a…9e02" },
  { id: "AUD-04211", ts: "2026-07-09 15:41:02", actor: "m.katballe", kind: "T1", action: "QA: retest policy after OOS — answered, 2 citations, conflict surfaced", model: "local", prompt: "v1.4.2", hash: "88f0…1bd7" },
  { id: "AUD-04210", ts: "2026-07-09 15:38:47", actor: "m.katballe", kind: "T1", action: "QA: stability data for B-2291 — REFUSED (below threshold)", model: "local", prompt: "v1.4.2", hash: "3d9c…77aa" },
  { id: "AUD-04209", ts: "2026-07-09 11:02:19", actor: "a.sorensen", kind: "T2", action: "Query: OOS results for B-2291, 30 d — 3 rows, read-only", model: "local", prompt: "v1.4.2", hash: "51be…c418" },
  { id: "AUD-04208", ts: "2026-07-08 16:05:33", actor: "system", kind: "T3", action: "OOS trigger received: S-8841 / MV-0412 — workflow armed, awaiting operator start", model: "—", prompt: "—", hash: "0a77…e6f3" },
];

export const AUDIT_START = 4212;
