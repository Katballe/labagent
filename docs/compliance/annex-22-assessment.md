# EU GMP Annex 22 (draft) — assessment of LabAgent v2.0

| | |
|---|---|
| Document | CA-001, version 1.0 |
| Regulation | EudraLex Vol. 4, Annex 22 "Artificial Intelligence" — **draft for public consultation**, published 7 July 2025 together with revised Annex 11 and Chapter 4; consultation closed 7 October 2025 |
| Status of the regulation (checked 27 Sep 2026) | Not final and not enforceable. The EMA's GMP/GDP Inspectors Working Group held a multistakeholder workshop on 30 June–1 July 2026 on whether, and with which guardrails, dynamic, adaptive and probabilistic models, including generative AI and LLMs, could be allowed in GMP applications. A final text is expected but not yet published. |
| Approach | Comply with the stricter July 2025 draft now; re-assess when the final text appears ([operations](../operations/model-lifecycle.md) §8) |

## 1. What the draft requires, in brief

- **Scope (§1).** Applies to AI/ML models used in *critical* GMP applications (direct impact on patient
  safety, product quality or data integrity), as a supplement to Annex 11. Only **static** models
  (no learning in use) with **deterministic** output are covered. Dynamic models and models with
  probabilistic output **should not be used in critical applications**. The annex does **not** apply
  to **generative AI and LLMs, which should not be used in critical GMP applications**. In
  non-critical applications they may be used with **a qualified human in the loop** responsible for
  the output, and the annex's principles may be considered.
- **Principles (§2).** Cooperation of SMEs, QA, data scientists, IT; defined responsibilities and
  qualifications; documentation available to the regulated user even for supplier models; quality
  risk management.
- **Intended use (§3).** Detailed description, including the input sample space, variations,
  limitations and biases, approved by a process SME before acceptance testing; subgroups; the
  operator's responsibility where a human is in the loop.
- **Acceptance criteria (§4).** Case-dependent metrics (e.g. confusion matrix, sensitivity,
  specificity, accuracy, precision, F1); criteria set by the SME before testing, possibly per
  subgroup; no worse than the process replaced.
- **Test data (§5).** Representative, stratified, all subgroups, sufficient for statistical
  confidence, labels verified to a very high degree of correctness, pre-processing and exclusions
  justified; AI-generated test data or labels not recommended.
- **Test data independence (§6).** Technical/procedural controls so test data is never used in
  development; access control and audit trail on test data; record which data was used, when and how
  often; staff with access to test data kept out of training (or 4-eyes).
- **Test execution (§7).** Show the model generalises; approved test plan before testing (intended use,
  metrics, criteria, test data reference, script, calculations); deviations documented and justified;
  documentation retained.
- **Explainability (§8).** For critical applications, record which input features drove each outcome
  (e.g. SHAP, LIME, heat maps) and review them as part of result approval.
- **Confidence (§9).** Log a confidence score per prediction; use a threshold and flag low-confidence
  outcomes as "undecided".
- **Operation (§10).** Change control and configuration control before deployment; performance
  monitoring; input sample-space (drift) monitoring; records of human review where a human is in the
  loop.

## 2. How LabAgent is classified

| Component | Is it an "AI model" under the draft? | Use | Consequence |
|---|---|---|---|
| Retriever, refusal gate, extractive answers, query templates, SQL guard, OOS logic | No — explicitly programmed, deterministic (TF-IDF statistics are not a trained model) | Decides in F1–F4 | Conventional computerised system under Annex 11; Annex 22 principles applied voluntarily (intended use, held-out testing, confidence, explainability, monitoring) |
| Workers AI model (Llama 3.3 70B), WebLLM, Ollama | Yes — generative AI / LLM | Non-critical only: wording SOP answers from given passages, drafting unvalidated queries, explaining OOS evidence | Outside the annex's scope (§1); allowed only non-critically with HITL — which is how it is used |
| OOS record and classification | — | Critical | No generative AI at all (fixed findings, rule-based classification) |

## 3. Clause-by-clause

Status: **Met** · **Partial** · **Open** (a demonstration system: roles and approvals do not exist yet).

| Clause | Requirement (paraphrase) | LabAgent | Evidence | Status |
|---|---|---|---|---|
| §1 | No LLM in critical applications; HITL in non-critical | LLM never writes or chooses the OOS record; LLM text labelled, shown with its source, reviewed | `src/ai/pipeline.js` (`stepFinding`), dev "modelpath" category, [IU-001](../validation/intended-use.md) | Met |
| §1 | Only static, deterministic models in critical use | No ML model in critical use; model pinned, temperature 0, fixed seed; determinism measured daily | `src/compliance/config.js`, self-check | Met |
| §2.1 | Cooperation; qualifications; responsibilities; access | Roles defined in VP-001 §4 | [VP-001](../validation/validation-plan.md) | Open (unassigned) |
| §2.2 | Documentation available and reviewed, incl. supplier models | Full set in `docs/`; supplier (Cloudflare/Meta model) documentation to be collected | this folder | Partial |
| §2.3 | Risk-based activities | FMEA with controls and verification | [RA-001](../validation/risk-assessment.md) | Partial (review pending) |
| §3.1 | Intended use incl. sample space, limitations, bias; SME-approved before testing | Written; SME approval pending | IU-001 §2–§3 | Partial |
| §3.2 | Subgroups | Defined; metrics reported per subgroup | IU-001 §4, VR-001 §4 | Met |
| §3.3 | Operator responsibility; training and performance monitored | Responsibilities stated; verdicts recorded; training/performance procedure drafted | IU-001 §5, OP-001 §7 | Partial |
| §4.1 | Suitable metrics | Confusion matrix, sensitivity, specificity, precision, F1, citation accuracy, T2/T3 accuracy | [TP-001](../validation/test-plan.md) §3, `scripts/validate.mjs` | Met |
| §4.2 | Criteria by SME before testing | Fixed and frozen before execution; SME approval pending | TP-001 §5 | Partial |
| §4.3 | No decrease vs. replaced process | Manual baseline unknown | DEV-004 | Open |
| §5.1 | Representative, stratified test data | Stratified by subgroup | HT-001 | Partial |
| §5.2 | Sufficient size | Wilson bounds reported; too small | DEV-003 | Open |
| §5.3 | Label verification | Pending | DEV-002 | Open |
| §5.4–5.5 | Pre-processing / exclusion justified | None applied | TP-001 §2 | Met |
| §5.6 | AI-generated test data not recommended | HT-001 was AI-written — disclosed and justified as bootstrap only | DEV-005 | Open |
| §6.1–6.3 | Independence controls; access audit trail; record of use | Separate set; SHA-256 lock; access log; consumed-set guard | `validation/heldout.lock.json`, `validation/test-data-access.log` | Met (controls) |
| §6.5 | Staff independence | Same party developed and wrote the set | DEV-001 | Open |
| §7.1–7.2 | Generalisation shown; approved plan before test | Plan frozen before run; held-out result exposed over-fitting of the dev set | VR-001 §4 | Partial |
| §7.3 | Deviations documented, investigated | 12 deviations with root cause and action; 5 change requests | VR-001 §5–§6 | Met |
| §7.4 | Retain test documentation | Run records, access log, plan, report in Git | `validation/`, `docs/validation/` | Met |
| §8.1–8.2 | Record contributing features; review them | Each answer records passages used and the question words each matched; reviewed in VR-001 §4 | audit entry `cited[].matched` | Met |
| §9.1–9.2 | Confidence per outcome; threshold → undecided | Logged; below threshold = UNDECIDED | audit entry `confidence`, `decision` | Met |
| §10.1 | Change control | PR + impact + re-test matrix | [OP-001](../operations/model-lifecycle.md) §2 | Met (procedure); branch protection to enable |
| §10.2 | Configuration control, detect unauthorised change | Fingerprint in every entry; commit-tagged deploys; Compliance tab comparison | OP-001 §3 | Met |
| §10.3 | Performance monitoring | Counters + daily self-check | `/api/monitor` | Met |
| §10.4 | Input sample-space monitoring | Out-of-corpus terms per day | monitor `unknownTerms` | Met |
| §10.5 | Records of human review | REVIEW entries; override rate | audit trail, monitor | Met |

## 4. Related revised Annex 11 (draft) topics

| Topic | LabAgent |
|---|---|
| Audit trail generated by the system, protected from change | Agent-written, append-only, hash-chained; clients limited to event kinds |
| Unique user identification | Cloudflare Access JWT verification; otherwise "(unverified)" — Access required for production |
| E-signatures | Demo only (name, meaning, time); a production signature needs re-authentication against a controlled identity |
| Supplier management / cloud | Supplier assessment of Cloudflare and the model required (OP-001 §9) |
| Security | Read-only data path; rate limiting; no secrets in code; Access for production |

## 5. Result

The architecture fits the draft: nothing critical depends on generative AI, and the non-critical uses
carry the HITL controls. The organisational and test-data obligations are **not yet met** (roles,
approvals, independent verified test data, baseline, statistical size), and the first acceptance test
failed. See the [validation report](../validation/validation-report.md) for the release actions.
