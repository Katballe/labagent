// Retrievable knowledge base — the "validated corpus" the Tier 1 assistant is
// allowed to answer from. Each chunk is a short, citable excerpt with a stable
// document id and section. The retriever scores a question against these and the
// assistant may ONLY use the chunks it is handed. Nothing here is invented at
// answer time — this is the whole world the model can cite.

export const KNOWLEDGE = [
  { doc: "SOP-AM-0412", sec: "§6.2 Acceptance Criteria — Dissolution", status: "EFFECTIVE", tags: ["MV-0412", "assay", "dissolution", "acceptance criterion"],
    text: "Dissolution Stage 1 (S1): Q = 80% of label claim dissolved at 30 min, n = 6 units. No individual unit below Q − 5%. On S1 failure, extend to Stage 2 (n = 12 additional units) per USP <711>." },
  { doc: "SOP-AM-0412", sec: "§5.4 Dissolution Conditions", status: "EFFECTIVE", tags: ["MV-0412", "dissolution", "apparatus", "paddle speed", "medium volume", "temperature"],
    text: "Dissolution apparatus 2 (paddle), 50 rpm, 900 mL phosphate buffer pH 6.8, 37.0 ± 0.5 °C." },
  { doc: "SOP-AM-0388", sec: "§6.1 Related Substances Limits", status: "EFFECTIVE", tags: ["MV-0388", "related substances", "impurity"],
    text: "Related substances by HPLC: any individual impurity NMT 0.20%, total impurities NMT 0.50%. Reporting threshold 0.05%." },
  { doc: "SOP-AM-0407", sec: "§6.1 Water Content Specification & System Suitability", status: "EFFECTIVE", tags: ["MV-0407", "water content", "karl fischer", "specification"],
    text: "Karl Fischer water content: NMT 0.5% w/w for the drug substance. Sample mass 250–350 mg dissolved directly in the vessel. System suitability: water standard recovery 97.0–103.0% before sample analysis." },
  { doc: "SOP-AM-0421", sec: "§6.3 Content Uniformity Acceptance", status: "EFFECTIVE", tags: ["MV-0421", "content uniformity", "acceptance criterion"],
    text: "Content uniformity per USP <905>. L1: acceptance value AV ≤ 15.0, n = 10. L2: n = 30 total, AV ≤ 15.0, no unit outside 0.75–1.25 M." },
  { doc: "SOP-QA-0102", sec: "§6.4 Classification (decision tree)", status: "EFFECTIVE", tags: ["OOS", "classification", "investigation"],
    text: "Phase 1 classification decision tree: (a) obvious error check; (b) instrument calibration status at run time; (c) analyst qualification; (d) pattern review; (e) classify. Branch L2: where the instrument was outside its calibration interval at run time, classify as probable laboratory error pending retest. Classification must state the branch applied and the facts driving it." },
  { doc: "SOP-QA-0102", sec: "§7.3 Retesting", status: "EFFECTIVE", tags: ["OOS", "retest", "retesting policy"],
    text: "Retesting shall be performed only against a documented laboratory-error hypothesis and with QA pre-approval. Retest is from the original preparation for instrument/measurement error, or a new preparation for preparation error. Retest results do not invalidate the original OOS result; only a concluded Phase 1 investigation can." },
  { doc: "SOP-QA-0102 v2.1", sec: "§7.1 Retesting (SUPERSEDED)", status: "SUPERSEDED", tags: ["OOS", "retest", "retesting policy"],
    text: "[Superseded 2025-10-01 by v3.0] Analyst may initiate a single retest at their discretion where laboratory error is suspected." },
  { doc: "SOP-QA-0117", sec: "§5.1 Deviation Triggers", status: "EFFECTIVE",
    text: "Failed equipment verification checks, OOS results and process excursions are recorded as deviations and assessed for CAPA." },
  { doc: "SOP-EQ-0031", sec: "§4.1 Calibration Categories", status: "EFFECTIVE", tags: ["INS-112", "INS-113", "INS-114", "INS-201", "quarterly calibration", "instruments"],
    text: "Category A: daily verification. Category B (quarterly): release-testing HPLC systems (INS-112/113/114), Karl Fischer titrator INS-201, balances in suite W-2. Category C: annual. Results from an instrument outside its calibration interval are not reportable." },
  { doc: "SOP-EQ-0040", sec: "§4.2 Balance Daily Verification", status: "EFFECTIVE", tags: ["balance", "weighing", "daily verification"],
    text: "Before first GxP use each day: level check, zero check, and a two-point verification with certified weights bracketing the working range, tolerance ±0.1% of nominal. Record in the balance logbook before use. A failed check takes the balance out of service and raises a deviation." },
  { doc: "SOP-LC-0012", sec: "§5.2 Working Standard Use Period", status: "EFFECTIVE", tags: ["reference standard", "working standard", "qualification"],
    text: "Working reference standards: 12-month use period from qualification against the primary standard, or the primary's expiry, whichever is earlier. Requalification requires assay agreement within ±1.0% of the primary. Expired standards are quarantined pending QA disposition." },
  { doc: "SOP-QA-0131", sec: "§4 Investigation Report Content", status: "EFFECTIVE", tags: ["investigation report", "phase 1 report"],
    text: "A Phase 1 investigation report contains: (1) description of the OOS result with raw-data references; (2) obvious-error review; (3) instrument status at run time; (4) analyst qualification; (5) pattern review across instrument, batch and method; (6) classification with the decision-tree path taken; (7) proposed corrective actions. Every factual statement must be traceable to a source record ID." },
  { doc: "POL-DI-0001", sec: "§3 ALCOA+", status: "EFFECTIVE",
    text: "Data must be Attributable, Legible, Contemporaneous, Original and Accurate, plus Complete, Consistent, Enduring and Available. Audit trails are append-only and reviewed." },
  { doc: "INV-2024-031", sec: "§5 Conclusion", status: "CLOSED", tags: ["INS-112", "precedent", "investigation"],
    text: "Precedent investigation: assay OOS on an out-of-calibration HPLC (INS-112, 2024). Root cause: quantitation drift on an out-of-calibration detector. Concluded probable laboratory error; retest from the original preparation after recalibration passed at 99.1 %LC." },
  { doc: "SOP-EQ-0035", sec: "§5 Qualification Stages & Requalification", status: "EFFECTIVE", tags: ["HPLC", "qualification", "IQ", "OQ", "PQ"],
    text: "HPLC systems are qualified in three stages: installation qualification (IQ), operational qualification (OQ) and performance qualification (PQ). PQ is repeated after major repair, relocation or detector replacement, and at least every 36 months. A system without a current PQ must not be used for release testing." },
  { doc: "SOP-LC-0009", sec: "§4 Sample Receipt, Storage & Disposal", status: "EFFECTIVE", tags: ["sample", "receipt", "retention", "disposal"],
    text: "Samples are logged in the LIMS within 24 hours of receipt, labelled with a unique sample ID and stored under the conditions stated on the sample request. Retained samples are kept for 1 year after batch expiry, then disposed of under a witnessed disposal record." },
  { doc: "VAL-PQ-0288", sec: "§6 Result", status: "EXECUTED", tags: ["INS-114", "PQ", "performance qualification", "HPLC"],
    text: "Performance qualification of HPLC INS-114 executed 2024-03-11: system suitability, injection precision (RSD ≤ 1.0%) and detector linearity (r ≥ 0.999) all met acceptance criteria. INS-114 released for GxP use; PQ valid until 2027-03-11." },
  { doc: "TRN-MX-0207", sec: "§2 Method Qualifications", status: "EFFECTIVE", tags: ["training", "qualification", "analyst", "MV-0412", "MV-0407", "MV-0388", "A-207", "A-186", "A-114"],
    text: "Analyst qualifications on MV-0412: A-207 granted 2025-11-18 (current), A-186 granted 2025-08-11 (current), A-114 lapsed 2026-05-02. MV-0407: A-186 (current). MV-0388: A-114 (lapsed 2026-03-10). An analyst with a lapsed qualification may not run the method until requalified." },
  { doc: "VAL-OQ-0301", sec: "§6 Result", status: "EXECUTED", tags: ["INS-201", "OQ", "operational qualification", "karl fischer"],
    text: "Operational qualification of the Karl Fischer titrator INS-201 executed 2025-02-06: titer determination, drift (≤ 20 µg/min) and endpoint detection within limits. INS-201 released for use with method MV-0407." },
];

// Topics deliberately NOT in the corpus — used to sanity-check refusal behaviour.
// (Shelf-life/stability, pricing/procurement, HR — the assistant must decline.)
export const OUT_OF_SCOPE_HINTS = ["shelf life", "stability", "price", "cost", "procurement", "salary", "weather"];
