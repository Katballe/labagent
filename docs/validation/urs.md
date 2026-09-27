# User Requirements Specification — LabAgent v2.0 and the LabAgent Cloudflare agent

| | |
|---|---|
| Document | URS-001, version 1.0 |
| Scope | The LabAgent application and its Cloudflare agent (`worker/`), which is the default answering engine where deployed |
| Basis | EU GMP Annex 22 (draft, July 2025); EU GMP Annex 11 (draft revision, July 2025); 21 CFR Part 11 (as a reference for e-records/e-signatures); GAMP 5 2nd ed. |
| Status | **Draft — approval pending** |
| Related | [Intended use](intended-use.md) · [Functional spec](functional-spec.md) · [Risk assessment](risk-assessment.md) · [Traceability](traceability-matrix.md) |

**Priority**: H = GxP-critical (patient safety, product quality, data integrity), M = important for
compliance or reliable operation, L = business/usability. Each requirement is verified as listed in the
[traceability matrix](traceability-matrix.md).

## 1. Answering SOP questions (F1)

| ID | Requirement | Priority | Source |
|---|---|---|---|
| URS-001 | The system shall answer questions about controlled documents only from the approved corpus and shall cite the document and section of every passage it relies on. | H | Intended use; Annex 22 §3.1 |
| URS-002 | When the corpus does not contain the answer, the outcome shall be UNDECIDED (a refusal with its reason), not an answer. | H | Annex 22 §9.2 |
| URS-003 | The system shall compute and record a confidence score for each answer and shall apply a threshold (default 0.60, adjustable 0.30–0.90) below which the outcome is UNDECIDED. | H | Annex 22 §9.1–9.2 |
| URS-004 | For each answer the system shall record the passages retrieved and used, and the words of the question each used passage matched. | M | Annex 22 §8.1–8.2 |
| URS-005 | Where an effective and a superseded version of a document are both relevant, the answer shall rely only on the effective version and the conflict shall be shown. | H | GMP documentation (Ch. 4) |

## 2. Use of generative AI

| ID | Requirement | Priority | Source |
|---|---|---|---|
| URS-006 | No generative model shall produce, change or choose any content of the OOS investigation record, its findings or its classification. | H | Annex 22 §1 |
| URS-007 | Any text written by a model shall be labelled as AI-generated and shown together with the verbatim source (passage, query or evidence) it is based on. | H | Annex 22 §1, §3.3 |
| URS-008 | Model output shall be checked in code before it is shown: an SOP answer must cite at least one of the passages it was given and no other document; an OOS explanation may only mention record ids present in the gathered evidence. Output failing a check shall be withheld (and shown only collapsed, marked "not relied upon"). | H | Annex 22 §1 |
| URS-009 | Users shall be able to record a verdict (matches the source / incorrect) on each answer. Verdicts shall be recorded in the audit trail and aggregated for monitoring. | M | Annex 22 §3.3, §10.5 |

## 3. Data access (F2)

| ID | Requirement | Priority | Source |
|---|---|---|---|
| URS-010 | The system shall have no write path to LIMS data. Only a single read-only SELECT statement may execute, and the database engine itself shall refuse writes. | H | Annex 11; data integrity |
| URS-011 | Requests to change data shall be declined without generating or running a query. | H | Data integrity |
| URS-012 | Where a validated query template applies, it shall be used. A model may draft a query only where no template applies; such results shall be labelled unvalidated and informational only. | H | Annex 22 §1; Annex 11 |
| URS-013 | Queries shall not be able to exhaust the system: the browser stops a query after 3 s; the agent refuses recursive queries and caps returned rows. | M | Availability |
| URS-027 | In the Document QA, questions about open work ("what should I prioritise?") and questions the SOPs can't answer but that are purely about LIMS records shall be answered from validated read-only query templates — never a model-drafted query — and labelled as coming from the LIMS extract. A question about data the LIMS extract doesn't hold shall be refused with that reason. (CR-007) | M | User testing, 27 Sep 2026 (DEV-014) |

## 4. OOS Phase 1 workflow (F3)

| ID | Requirement | Priority | Source |
|---|---|---|---|
| URS-014 | The workflow shall follow the fixed sequence of SOP-QA-0102 and end at a human approval gate. Approval shall require the reviewer's name, confirmation that every step and its evidence was reviewed, and shall record the signature's meaning and time. Rejection shall require a reason. Nothing shall be written to the LIMS. | H | SOP-QA-0102; Part 11 §11.50 (reference) |

## 5. Audit trail and identity

| ID | Requirement | Priority | Source |
|---|---|---|---|
| URS-015 | Every question, answer, query, workflow step, approval, rejection and review shall be recorded in an append-only audit trail with timestamp (with time zone), actor, action, model, prompt version and configuration fingerprint. | H | Annex 11 (audit trails); ALCOA+ |
| URS-016 | When the agent answers, the agent shall write the audit entry itself; a client shall only be able to add workflow, review, evaluation and system events. | H | Annex 11; data integrity |
| URS-017 | The audit trail shall be tamper-evident (edit, deletion and reordering detectable by verification), verifiable by the user independently of the server, and exportable. | H | Annex 11; ALCOA+ |
| URS-018 | User identity shall come from a verified identity provider (Cloudflare Access JWT) where configured; otherwise entries shall be marked "(unverified)". | H | Annex 11; Part 11 §11.10(d) (reference) |

## 6. Agent, model and configuration

| ID | Requirement | Priority | Source |
|---|---|---|---|
| URS-019 | The agent's model identifier and generation settings (temperature 0, fixed seed, token limits) shall be pinned in version-controlled configuration. | H | Annex 22 §10.1–10.2 |
| URS-020 | The system shall compute a configuration fingerprint over prompts, generation settings, model, threshold, corpus, workflow and database seed; it shall be recorded with every audit entry and shown against the fingerprint of the validated run, together with the build and tested commits. | H | Annex 22 §10.2 |
| URS-021 | If the model is unavailable or the daily model budget is exhausted, the agent shall answer deterministically and state that it did so. | M | Availability |
| URS-022 | The agent shall monitor outcomes (answered, undecided and why, withheld, review verdicts), input drift (words asked about that the corpus lacks) and shall run a daily self-check: the deterministic suite plus a model determinism probe. | M | Annex 22 §10.3–10.4 |
| URS-023 | The agent shall limit requests per client and model calls per day. | L | Cost / abuse |
| URS-024 | The application shall be usable with nothing to install or download; where the agent is unavailable it shall work deterministically in the browser. | L | Business |

## 7. Testing

| ID | Requirement | Priority | Source |
|---|---|---|---|
| URS-025 | Acceptance testing shall use a held-out test set that was not used in development, frozen (hashed) before first use, with every access recorded, and metrics and acceptance criteria fixed in an approved test plan before execution. A set whose results informed development shall not provide acceptance evidence again. | H | Annex 22 §4–§7 |
| URS-026 | Every build shall run the development suite and shall fail (so nothing deploys) if any category is below target. | M | Change control |

## 8. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Process owner | | | |
| Process SME | | | |
| Quality Assurance | | | |
