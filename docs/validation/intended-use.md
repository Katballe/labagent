# Intended Use — LabAgent v2.0

| | |
|---|---|
| Document | IU-001, version 1.0 |
| Basis | EU GMP Annex 22 (draft, July 2025) §1, §3; EU GMP Annex 11 (draft revision, July 2025) |
| Status | **Draft — process SME approval required before acceptance testing is repeated (Annex 22 §3.1)** |

## 1. Context

LabAgent assists staff in a GMP quality-control laboratory. It sits beside the LIMS and the document
management system (DMS); it never replaces them and has no write access to either. All documents,
records and people in this implementation are **synthetic**.

The system has two kinds of logic:

- **Deterministic logic** — retrieval with a refusal threshold, fixed query templates, a read-only
  guard, a fixed OOS workflow with fixed findings and a rule-based classification. This is
  conventional software (Annex 11). It is the only logic that makes a decision.
- **A generative language model** (optional) — the pinned Workers AI model in the Cloudflare agent,
  or a local model (WebLLM / Ollama). Annex 22 (draft) §1 says generative AI and LLMs *should not be
  used in critical GMP applications*; in non-critical applications a qualified person must be
  responsible for the output (human in the loop, HITL). LabAgent uses the model only in the
  non-critical roles below, and never in the investigation record.

## 2. Functions, criticality and responsibilities

| ID | Function | Task assisted | Criticality | What decides | Model role (if enabled) | Operator responsibility (Annex 22 §3.3) |
|---|---|---|---|---|---|---|
| F1 | SOP question answering (T1) | Finding the governing passage of an SOP | **Non-critical** — a look-up aid; the controlled SOP governs | Retrieval: answer or UNDECIDED; which passage governs | Words the answer from the retrieved passages; citations checked in code | Read the verbatim passage shown with every answer; act only on the controlled SOP; record a verdict (✓ / ✗) |
| F2 | Data look-up (T2) | Read-only questions about samples, results, instruments, calibration, qualifications | Template results: may inform GMP work. AI-drafted queries: **non-critical, informational only** | Validated templates; read-only guard; SQLite `query_only` | Drafts an ad-hoc SELECT only when no template fits; labelled UNVALIDATED | Verify any unvalidated result in the LIMS before relying on it |
| F3 | OOS Phase 1 triage (T3) | Assembling a Phase 1 laboratory investigation draft (SOP-QA-0102) | **Critical** — feeds batch disposition | Fixed step sequence, fixed findings, rule-based classification (decision tree branch L2) | **None in the record.** Explains the gathered evidence on request; labelled; not part of the record | Review every step and its evidence; approve with a signature (name, meaning, time) or reject with a reason |
| F4 | Audit trail | Recording every interaction | **Critical** — data integrity | Deterministic hash chain, written by the system | None | Periodic audit-trail review |
| F5 | Monitoring & self-check | Detecting degradation and drift | Supporting | Counters, drift terms, deterministic self-check | Determinism probe only | System owner reviews trends; raises change control |

## 3. Input sample space (Annex 22 §3.1)

| Function | Expected input | Common variations | Rare / limiting variations | Known erroneous or biased input |
|---|---|---|---|---|
| F1 | English questions (≤ 500 characters) about the effective SOPs, methods, equipment, standards, sample lifecycle, training records and closed investigations in the corpus | Paraphrase ("scales" for balance, "moisture" for water), abbreviations (KF, CU, OOS), document or method ids | Questions spanning two SOPs; questions phrased around a superseded rule; questions about adjacent technical detail not in the corpus (mobile phase, column temperature) | Unknown ids (MV-9999), off-topic requests, requests for data held elsewhere (shelf life, approvals, stability), non-English input (not supported — refused as unknown terms) |
| F2 | English questions naming a record id, a topic (OOS, calibration, qualification) or a time window | "last 30 days", "this week", "overdue", "due soon" | Aggregates beyond count; comparisons across tables | Requests to change data (declined); free-form analytics with no template (declined, or AI-drafted and labelled unvalidated) |
| F3 | The OOS event for sample S-8841 (fixed case in this implementation); free-text questions about the gathered evidence | Questions about calibration, analyst, batch, precedent, approval | Questions that require evidence not gathered | Requests to decide (recall, batch release) — out of scope |

**Limitations.** Small synthetic corpus (18 documents, 20 chunks) and database (7 results); English
only; relative dates count from the data set's frozen date 2026-07-12; the unknown-word gate refuses
many legitimate paraphrases (measured sensitivity 0.63 on HT-001 — see the validation report).

## 4. Subgroups (Annex 22 §3.2)

| Function | Subgroups |
|---|---|
| F1 answerable | analytical method · quality & OOS · equipment & qualification · lifecycle & standards · records & training |
| F1 not answerable | off-topic · unknown identifier · data held elsewhere · adjacent technical detail |
| F2 | template query · change request · no template |
| F3 | evidence question · out of scope |

## 5. Human in the loop (Annex 22 §3.3, §10.5)

Where the model contributes (F1 wording, F2 unvalidated queries, F3 explanations) testing effort for
that output is reduced, so:

1. The operator's responsibility is as stated in §2 and is part of their training (see
   [operations](../operations/model-lifecycle.md) §7).
2. Every model output is shown with its source (verbatim passage, SQL, or evidence) and a label.
3. Verdicts are recorded in the audit trail and aggregated by the agent's monitor (override rate);
   operator consistency is reviewed like any other manual process.

## 6. Out of scope

Batch release or disposition decisions; writing to the LIMS, DMS or QMS; authoring or approving
controlled documents; use with real GMP data before the actions in the validation report are closed.

## 7. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Process SME | | | |
| System owner | | | |
| Quality Assurance | | | |
