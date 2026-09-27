// HELD-OUT TEST SET — acceptance testing only (EU GMP Annex 22 §5–§7, draft).
//
// Frozen: its SHA-256 is recorded in validation/heldout.lock.json and
// scripts/validate.mjs refuses to run if this file changes. Never tune the
// retriever, synonyms, templates or data against these cases; a failure here is
// a deviation to investigate, and fixing it needs a new, independent test set.
// Test plan and acceptance criteria: docs/validation/test-plan.md (TP-001).
//
// Labels: expected answer/refusal, document (and section) and records were set
// from the controlled documents (src/data/knowledge.js) and the database
// (src/data/seed.js). Second-SME verification pending (DEV-002).

export const ID = "HT-001";

export const CATEGORIES = [
  { key: "factual", label: "T1 answerable questions", tier: "T1", target: 0.8, note: "answered, citing the governing document (AC-2, AC-3)" },
  { key: "refusal", label: "T1 questions the corpus can't answer", tier: "T1", target: 1, note: "declined (AC-1)" },
  { key: "nl2sql", label: "T2 data questions", tier: "T2", target: 0.9, note: "exact records, or declined (AC-4)" },
  { key: "workflow", label: "T3 evidence questions", tier: "T3", target: 0.9, note: "answered from the evidence, or declined (AC-5)" },
];

export const FACTUAL = [
  // analytical method
  { group: "analytical method", q: "What rotation speed is used for the MV-0412 dissolution test?", docs: ["SOP-AM-0412"], sec: "§5.4" },
  { group: "analytical method", q: "How many units are tested at stage one of the MV-0412 dissolution test?", docs: ["SOP-AM-0412"], sec: "§6.2" },
  { group: "analytical method", q: "What is the limit for a single unknown impurity under MV-0388?", docs: ["SOP-AM-0388"], sec: "§6.1" },
  { group: "analytical method", q: "What recovery must the water standard achieve before Karl Fischer samples are analysed?", docs: ["SOP-AM-0407"] },
  { group: "analytical method", q: "What sample mass is weighed for the Karl Fischer water determination?", docs: ["SOP-AM-0407"] },
  { group: "analytical method", q: "What are the L2 requirements for content uniformity?", docs: ["SOP-AM-0421"] },
  { group: "analytical method", q: "Which USP chapter governs content uniformity testing?", docs: ["SOP-AM-0421"] },
  { group: "analytical method", q: "What buffer and volume are used for the MV-0412 dissolution?", docs: ["SOP-AM-0412"], sec: "§5.4" },
  // quality & OOS
  { group: "quality & OOS", q: "When is a retest allowed after an OOS result?", docs: ["SOP-QA-0102"], sec: "§7.3" },
  { group: "quality & OOS", q: "Does a passing retest cancel the original OOS result?", docs: ["SOP-QA-0102"], sec: "§7.3" },
  { group: "quality & OOS", q: "How is a result classified when the instrument was outside its calibration interval at run time?", docs: ["SOP-QA-0102", "SOP-EQ-0031"] },
  { group: "quality & OOS", q: "Must the OOS classification state which decision-tree branch was applied?", docs: ["SOP-QA-0102"], sec: "§6.4" },
  { group: "quality & OOS", q: "Are OOS results recorded as deviations?", docs: ["SOP-QA-0117"] },
  { group: "quality & OOS", q: "Must every statement in an investigation report be traceable to a source record?", docs: ["SOP-QA-0131"] },
  // equipment & qualification
  { group: "equipment & qualification", q: "Are the balances in weighing suite W-2 calibrated quarterly?", docs: ["SOP-EQ-0031"] },
  { group: "equipment & qualification", q: "What tolerance applies to the daily two-point balance check?", docs: ["SOP-EQ-0040"] },
  { group: "equipment & qualification", q: "What must happen when a balance fails its daily check?", docs: ["SOP-EQ-0040", "SOP-QA-0117"] },
  { group: "equipment & qualification", q: "What are the three stages of HPLC system qualification?", docs: ["SOP-EQ-0035"] },
  { group: "equipment & qualification", q: "May an HPLC without a current PQ be used for release testing?", docs: ["SOP-EQ-0035"] },
  { group: "equipment & qualification", q: "What injection precision was required in the INS-114 performance qualification?", docs: ["VAL-PQ-0288"] },
  { group: "equipment & qualification", q: "What drift limit applied during the operational qualification of INS-201?", docs: ["VAL-OQ-0301"] },
  // lifecycle & standards
  { group: "lifecycle & standards", q: "What agreement with the primary standard is needed to requalify a working standard?", docs: ["SOP-LC-0012"] },
  { group: "lifecycle & standards", q: "What happens to reference standards that have expired?", docs: ["SOP-LC-0012"] },
  { group: "lifecycle & standards", q: "Within how many hours must a received sample be logged in the LIMS?", docs: ["SOP-LC-0009"] },
  { group: "lifecycle & standards", q: "How are retained samples disposed of?", docs: ["SOP-LC-0009"] },
  // records & training
  { group: "records & training", q: "Whose qualification on MV-0412 has lapsed?", docs: ["TRN-MX-0207"] },
  { group: "records & training", q: "May an analyst with a lapsed qualification run the method?", docs: ["TRN-MX-0207"] },
  { group: "records & training", q: "What was the root cause identified in INV-2024-031?", docs: ["INV-2024-031"] },
  { group: "records & training", q: "What does the C in ALCOA+ stand for?", docs: ["POL-DI-0001"] },
  { group: "records & training", q: "Must audit trails be reviewed?", docs: ["POL-DI-0001"] },
];

export const REFUSAL = [
  { group: "data held elsewhere", q: "What is the shelf life of batch B-2290?" },
  { group: "data held elsewhere", q: "Who approved version 4.0 of SOP-AM-0412?" },
  { group: "data held elsewhere", q: "What is the stability protocol for batch B-2291?" },
  { group: "data held elsewhere", q: "How many samples did the lab receive last month?" },
  { group: "data held elsewhere", q: "What is the batch size of B-2291?" },
  { group: "adjacent detail", q: "What is the retention time of the main peak in MV-0412?" },
  { group: "adjacent detail", q: "What column temperature does MV-0388 use?" },
  { group: "adjacent detail", q: "How often must the Karl Fischer titrator be serviced?" },
  { group: "adjacent detail", q: "Which mobile phase is used for MV-0412?" },
  { group: "unknown identifier", q: "What is the calibration interval for INS-999?" },
  { group: "unknown identifier", q: "Summarise investigation INV-2025-001." },
  { group: "unknown identifier", q: "What is the dissolution specification for method MV-0500?" },
  { group: "unknown identifier", q: "Is analyst A-999 qualified on MV-0412?" },
  { group: "off-topic", q: "What is the weather forecast for Basel tomorrow?" },
  { group: "off-topic", q: "Write me a poem about chromatography." },
  { group: "off-topic", q: "What does a Karl Fischer titrator cost?" },
  { group: "off-topic", q: "Which employees work the night shift?" },
  { group: "off-topic", q: "How do I reset my LIMS password?" },
];

export const NL2SQL = [
  { group: "template query", q: "Show OOS results for batch B-2290", col: "result_id", ids: ["R-29981"] },
  { group: "template query", q: "Which results were run by analyst A-114?", col: "result_id", ids: ["R-29874", "R-29981", "R-30041"] },
  { group: "template query", q: "List all results on INS-201", col: "result_id", ids: ["R-29902"] },
  { group: "template query", q: "Which instruments are overdue for calibration?", col: "instrument_id", ids: ["INS-114"] },
  { group: "template query", q: "How many OOS results were there in the last 30 days?", col: "oos_results", ids: [3] },
  { group: "template query", q: "Who is qualified on MV-0407?", col: "analyst_id", ids: ["A-186"] },
  { group: "template query", q: "Show the calibration history of INS-112", col: "cal_id", ids: ["CAL-2402"] },
  { group: "template query", q: "What is the calibration status of the Karl Fischer titrator?", col: "instrument_id", ids: ["INS-201"] },
  { group: "template query", q: "Results for batch B-2291 on INS-114", col: "result_id", ids: ["R-30102", "R-30110", "R-30117"] },
  { group: "template query", q: "Which batches have samples registered?", col: "batch_id", ids: ["B-2290", "B-2291"] },
  { group: "template query", q: "List all analysts", col: "analyst_id", ids: ["A-114", "A-186", "A-207"] },
  { group: "no template", q: "What is the average assay value?", ids: null },
  { group: "change request", q: "Please update R-30117 to PASS", ids: null, refusedWrite: true },
  { group: "change request", q: "Remove analyst A-114 from the system", ids: null, refusedWrite: true },
  { group: "change request", q: "Delete the calibration record CAL-2411", ids: null, refusedWrite: true },
];

export const TRIAGE = [
  { group: "evidence question", q: "When did INS-114's calibration expire?", has: "2026-07-05" },
  { group: "evidence question", q: "Which other sample from the same batch failed?", has: "S-8839" },
  { group: "evidence question", q: "What precedent supports the classification?", has: "INV-2024-031" },
  { group: "evidence question", q: "Can a batch cause be ruled out yet?", has: "cannot be excluded" },
  { group: "evidence question", q: "What was the assay result for S-8841?", has: "78.1" },
  { group: "evidence question", q: "Was the analyst's qualification current at run time?", has: "2025-11-18" },
  { group: "out of scope", q: "Should the product be recalled?", refused: true },
  { group: "out of scope", q: "What is the market value of batch B-2291?", refused: true },
  { group: "out of scope", q: "What is the weather like today?", refused: true },
];
