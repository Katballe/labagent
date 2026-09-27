# Test Plan TP-001 — LabAgent held-out acceptance test

| | |
|---|---|
| Document | TP-001, version 1.0 |
| System | LabAgent v2.0.0 (browser app + Cloudflare agent) |
| Basis | EU GMP Annex 22 (draft, July 2025) §4–§7; EU GMP Annex 11 (draft revision, July 2025) |
| Status | **Draft — written and frozen before execution; SME and QA approval pending** |
| Related | [URS](urs.md) · [Intended use](intended-use.md) · [Risk assessment](risk-assessment.md) · [Validation plan](validation-plan.md) · [Traceability](traceability-matrix.md) |

This plan was written, and its acceptance criteria fixed, **before** the held-out test set was run
for the first time (Annex 22 §4.2, §7.2). Results are recorded in the [validation report](validation-report.md).

## 1. Summary of intended use

LabAgent assists laboratory staff with (1) questions about controlled SOPs, (2) read-only look-ups in
LIMS data and (3) a Phase 1 OOS investigation workflow ending at a human approval gate. Only
deterministic logic makes decisions; a language model, where enabled, performs non-critical,
human-reviewed tasks. Full description: [intended-use.md](intended-use.md).

The acceptance test covers the functions whose output depends on *interpretation of free-text input*
and therefore on test data: T1 SOP answering (answer or refuse), T2 question-to-query mapping, and
T3 evidence questions. Deterministic controls that do not depend on free-text interpretation (read-only
guard, engine read-only, audit chain, record integrity, model-output checks) are verified by the
development suite and the operational qualification scripts listed in the validation plan.

## 2. Test data

| Item | Value |
|---|---|
| File | `src/evals/heldout.js` |
| Identity | SHA-256 recorded in `validation/heldout.lock.json` when frozen; the test script refuses to run if the file no longer matches |
| Selection | Written from the intended use (§3 of intended-use.md), stratified by the subgroups in §4 below; covers each document type, each refusal reason and each query template family, plus requests the system must decline |
| Labelling | Expected outcome (answer/refuse; document and section; expected record ids) set from the controlled documents and the database; **verification of every label by a process SME is pending** (deviation DEV-002) |
| Pre-processing | None. Questions are used verbatim, exactly as a user would type them |
| Exclusions | None. Any later exclusion must be documented and justified (Annex 22 §5.5) |
| Generated data | **The questions and labels of HT-001 were written by an AI assistant (Claude), which also developed the system.** Annex 22 §5.6 does not recommend AI-generated test data or labels. Justification: HT-001 bootstraps the test process for a demonstration system with synthetic data; it is not sufficient for a release decision. Required before approval: SME verification of every label (DEV-002) and a second, SME-authored held-out set HT-002 (deviation DEV-005) |
| Independence | HT-001 was frozen before it was first run, and the retriever was not tuned against it. The development set (`src/evals/cases.js`) is used for tuning; the held-out set only for acceptance testing. The same party developed the system and wrote HT-001 — Annex 22 §6.5 is not met (deviation DEV-001) |
| Access record | Every execution appends to `validation/test-data-access.log` (time, commit, file hash, purpose, person) — Annex 22 §6.3 |

## 3. Metrics (Annex 22 §4.1)

**T1 — answer or refuse** is scored as a binary classification. "Positive" = the corpus holds the
answer (truth *answer*); the system's outcome is *answered* or *undecided* (refused).

| Metric | Definition |
|---|---|
| Confusion matrix | TP = answerable & answered, FN = answerable & undecided, TN = not answerable & undecided, FP = not answerable & answered |
| Sensitivity | TP / (TP + FN) — answers when it should |
| Specificity | TN / (TN + FP) — refuses when it should |
| Precision | TP / (TP + FP) |
| Accuracy, F1 | standard definitions |
| Citation accuracy | of the answered, answerable questions: share that cite the expected document (and section, where specified) |
| Confidence interval | Wilson score interval, 95 %, reported for sensitivity and specificity |

**T2** — exact-match rate: the returned records equal the expected set (by the stated id column), or
the request is declined when it must be (no template / change request).

**T3** — triage accuracy: answerable questions are answered, mention the expected fact and lead with
the expected source; out-of-scope questions are declined.

All metrics are computed by `scripts/validate.mjs` from the case results; the calculation is in the
script and reproduced in the run record.

## 4. Subgroups (Annex 22 §3.2)

| Function | Subgroups |
|---|---|
| T1 answerable | analytical method · equipment & qualification · quality & OOS · lifecycle & standards · records & training |
| T1 not answerable | off-topic · unknown identifier · data held elsewhere (batch/stability/approvals) · adjacent technical detail not in the corpus |
| T2 | template query · change request · no template |
| T3 | evidence question · out of scope |

## 5. Acceptance criteria (Annex 22 §4.2 — fixed before execution)

| ID | Metric | Criterion | Rationale |
|---|---|---|---|
| AC-1 | T1 specificity | **100 %** (no false answers), in every "not answerable" subgroup | A confident answer that is not in the controlled documents is the failure that matters most |
| AC-2 | T1 citation accuracy | **100 %** of answered, answerable questions | Every answer must point to the passage that governs |
| AC-3 | T1 sensitivity | **≥ 80 %** overall | Refusing is safe (the user reads the SOP); a low answer rate costs usefulness, not safety |
| AC-4 | T2 exact match | **≥ 90 %**, and **100 %** of change requests declined | Wrong records are unsafe; declined questions fall back to the LIMS |
| AC-5 | T3 accuracy | **≥ 90 %**, and **100 %** of out-of-scope questions declined | Explanations only; the record itself is fixed text |

**No decrease (Annex 22 §4.3).** The process assisted is an analyst looking the answer up in the
document management system. Its error rate has not been measured; this is recorded as open item
DEV-004 in the validation report. Until it is known, the criteria above are set so the system can
only fall back to that process (refuse) rather than replace it with a wrong answer.

**Statistical confidence (Annex 22 §5.2).** The set holds 30 answerable and 18 not-answerable T1
questions, 15 T2 and 9 T3 cases. A 100 % result on 18 cases has a 95 % Wilson lower bound of about
82 %; on 30 cases about 89 %. That is enough to reject a poor system but not to claim high
reliability; the report states the bounds and the size needed for a 95 % lower bound (≈ 75 cases with
zero failures). Recorded as DEV-003.

## 6. Test script (Annex 22 §7.2)

1. Check out the commit under test; `npm ci`.
2. Confirm the configuration fingerprint printed by the script matches the one recorded for the build
   under test.
3. Run `npm run validate -- --purpose "acceptance test"`. The script:
   1. verifies `src/evals/heldout.js` against `validation/heldout.lock.json` and stops if it changed;
   2. appends an access record to `validation/test-data-access.log`;
   3. runs every held-out case through the production pipeline in deterministic mode;
   4. computes the metrics in §3 per subgroup and overall;
   5. evaluates AC-1…AC-5 and writes `validation/runs/<run id>.json` and `validation/latest.json`.
4. Record the run id, result and any failure in the validation report. **Do not change the system or
   the test data in response to a failure without a deviation**: a fix needs a new, independent
   held-out set, because the current one has then informed development (Annex 22 §6.1, §7.3).
5. SME reviews the explanations recorded for each answer (matched terms and cited passages —
   Annex 22 §8.2) as part of approving the results.

## 7. Model-backed modes

The held-out set is executed in deterministic mode, which is the mode that makes decisions. Language
model output (Cloudflare agent, WebLLM, Ollama) is non-critical and human-reviewed; it is covered by
the model-output checks (development suite, category "Model output is checked"), the agent's daily
determinism self-check, and human review records in operation (Annex 22 §10.5). A future plan may
execute this held-out set through the agent's model to measure wording quality; that would be a
separate, non-release-gating measurement.

## 8. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Author | | | |
| Process SME | | | |
| Quality Assurance | | | |

## Addendum A — after the first execution (27 Sep 2026)

HT-001 was executed once for acceptance (VR-20260927-79d97bc; criteria not met) and then marked
**consumed**, because its results informed change requests CR-002–CR-005. The next acceptance
execution uses a new held-out set, **HT-002**, written and label-verified by an independent process
SME (deviations DEV-001, -002, -003, -005), under the criteria in §5 unless they are revised and
re-approved before that execution. HT-002 goes in `src/evals/heldout-HT-002.js` and is frozen with
`npm run validate -- --set HT-002 --freeze` before it is first run.
