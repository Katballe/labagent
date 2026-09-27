# Validation Report — LabAgent v2.0

| | |
|---|---|
| Document | VR-001, version 1.0 |
| Plan | [VP-001](validation-plan.md), [TP-001](test-plan.md) |
| Status | **Draft — NOT RELEASED** |
| Prepared by | Claude (AI assistant) for the system owner; approvals pending |

## 1. Conclusion

**LabAgent v2.0 is not released for GMP use.** The design follows the stricter reading of EU GMP
Annex 22 (draft): deterministic logic makes every decision, and generative AI only does non-critical,
labelled, human-reviewed work. The engineering controls (read-only data access, code-checked model
output, hash-chained server-side audit trail, pinned configuration, monitoring) were verified.

The first acceptance test on held-out data **did not meet four of five acceptance criteria**. It
showed that the development suite (100 %) overstated performance on unseen questions. Most of the gap
comes from one design choice: refusing any question containing a word the corpus doesn't use. The
test process also has open independence issues: the held-out set was written by the same AI
assistant that built the system (DEV-001, DEV-005).

Release needs the actions in §6. The system remains suitable as a **demonstration with synthetic
data**.

## 2. System under test

| Item | Value |
|---|---|
| Acceptance run commit | `79d97bc` (clean tree) |
| Configuration fingerprint | `87cf3b53df4c136b6b86c7ba8bd41518b827a05caba4a0f2c3312298dac3f7f4` |
| Mode tested | Deterministic pipeline (the mode that decides) |
| Pinned model (not exercised in acceptance) | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, temperature 0, seed 20260927 |
| Test set | HT-001, SHA-256 `b60efab2…c118aa`, 30 + 18 T1, 15 T2, 9 T3 cases |
| Records | `validation/runs/VR-20260927-79d97bc.json`, `validation/test-data-access.log` |

## 3. Operational verification

| Check | Result |
|---|---|
| Development suite, headless (`npm run evals`, prebuild gate) | 147 / 147 at `5f3864f` (12 categories, all targets met) |
| CI dry run on a fresh clone with the exact CI arguments (`ops/deploy-check/ci-local.mjs`) | Pass at `79d97bc` |
| Agent run locally (`wrangler dev`, Durable Objects, no Workers AI) | Health reports pinned model, fingerprint and Worker version; T1 answered with citations and an audit entry; T2 validated template (3 rows); change request declined without a query; raw `DELETE` rejected; `WITH RECURSIVE` rejected; review recorded as a REVIEW entry; forged `T1` event refused; `monitor` instance returns 404 over HTTP; audit ledger verified server-side and independently in the browser |
| Self-check inside the agent | Development suite PASS (137 cases at the time); determinism probe skipped (no AI binding locally) |
| Browser, full stack against the local agent | Auto-connects to the agent; answers, reviews, OOS workflow start/complete/approval recorded in the server ledger; browser and agent configuration fingerprints identical |
| Workers AI adapter | Verified against a recording stand-in: pinned model id, temperature 0, seed, max tokens; off when disabled or unbound (6 / 6) |
| Real Workers AI call on Cloudflare | **Not performed** — no deployment credentials in this session (DEV-011) |

## 4. Acceptance test VR-20260927-79d97bc (TP-001, first execution)

| Metric | Value | 95 % CI (Wilson) |
|---|---|---|
| T1 confusion matrix | TP 19 · FN 11 · TN 17 · FP 1 | |
| T1 sensitivity | 0.633 | 0.455 – 0.781 |
| T1 specificity | 0.944 | 0.742 – 0.990 |
| T1 precision / F1 | 0.950 / 0.760 | |
| T1 citation accuracy (answered, answerable) | 1.000 (19 / 19) | |
| T2 exact match | 0.867 (13 / 15) | |
| T3 accuracy | 0.778 (7 / 9) | |

| Subgroup | Result |
|---|---|
| T1 answerable — analytical method / quality & OOS / equipment / lifecycle / records | 4/8 · 4/6 · 6/7 · 2/4 · 3/5 |
| T1 not answerable — data elsewhere / adjacent detail / unknown id / off-topic | 5/5 · **3/4** · 4/4 · 5/5 |
| T2 — template / change request / no template | 9/11 · 3/3 · 1/1 |
| T3 — evidence question / out of scope | 4/6 · 3/3 |

| Criterion | Result |
|---|---|
| AC-1 T1 specificity 100 % in every subgroup | **FAIL** (0.944; adjacent detail 3/4) |
| AC-2 T1 citation accuracy 100 % | PASS |
| AC-3 T1 sensitivity ≥ 80 % | **FAIL** (0.633) |
| AC-4 T2 ≥ 90 %, change requests 100 % | **FAIL** (0.867; change requests 3/3) |
| AC-5 T3 ≥ 90 %, out of scope 100 % | **FAIL** (0.778; out of scope 3/3) |

**Explainability review (Annex 22 §8.2).** For the 19 answered questions the recorded matched words
and cited passages were the relevant ones (every citation correct). The false answer (DEV-006) matched
"Karl Fischer", "titrator" and "interval" (from "how often") to the calibration categories — plausible
features, wrong question: calibration is not servicing.

## 5. Deviations

| ID | Description | Investigation / impact | Action |
|---|---|---|---|
| DEV-001 | Staff independence (Annex 22 §6.5) not met: the AI assistant that developed the system wrote HT-001. | Optimistic bias possible; partly offset by freezing the set before any run and not tuning against it. | HT-002 written by an independent SME who has not worked on the retriever. |
| DEV-002 | Labels not verified by a second expert (§5.3). | Labels were set from the controlled texts; an error would mis-score a case. | SME verifies every label of HT-002 (and of HT-001 for the record). |
| DEV-003 | Test set too small for high-confidence claims (§5.2): specificity lower bound 0.74 on 18 cases. | Results can reject a poor system but can't demonstrate high reliability. | HT-002 with ≥ 75 not-answerable and ≥ 75 answerable questions. |
| DEV-004 | Performance of the manual process being assisted is unknown (§4.3). | "No decrease" can't be shown. | Measure analysts' SOP look-up accuracy on the same questions. |
| DEV-005 | Test data and labels were generated by generative AI (§5.6). | Not recommended by the draft; justified only as a bootstrap for a demonstration. | HT-002 human-authored. |
| DEV-006 | AC-1 failed: "How often must the Karl Fischer titrator be serviced?" answered with SOP-EQ-0031 §4.1 (calibration categories). | Root cause: every question word matched the corpus ("service" appears in "out of service"; "how often" maps to "interval"), so neither refusal gate fired. Risk R-03 raised to High. Mitigated in use by showing the verbatim passage, which is visibly about calibration. | CR-001. |
| DEV-007 | AC-3 failed: 11 answerable questions refused. | Root cause: all 11 hit the unknown-word gate. Three were plain function words missing from the stop list (have, has, during); eight were ordinary content words the SOPs don't use (rotation, unknown, achieve, chapter/governs, allowed, cancel, received, identified). Refusal is safe (manual look-up) but costs usefulness. | CR-005 (implemented, see §6); CR-001 for the rest. |
| DEV-008 | AC-4 failed: "overdue" also returned instruments due soon; "which batches have samples registered?" matched no template. | Genuine template defects. | CR-002, CR-003 (implemented). |
| DEV-009 | AC-5 failed: "expire" vs "expired" not matched; "ruled out" not understood. | Stemmer defect; missing phrase. | CR-004 (implemented); "ruled out" under CR-001. |
| DEV-010 | During agent smoke testing, before the formal run, a triage question close to an HT-001 case ("When did INS-114 calibration expire?") was seen to fail. | Deliberately not fixed before the run, to keep HT-001 independent; disclosed here. The formal run confirmed it (DEV-009). | None beyond CR-004. |
| DEV-011 | The Workers AI path was not exercised on Cloudflare. | Adapter verified with a stand-in; the real model's wording, determinism and latency are unmeasured. | IQ/OQ after deployment: health check, determinism probe, a sample of reviewed answers. |
| DEV-012 | The daily self-check may exceed Workers Free plan CPU limits. | Self-check would be cut short; monitoring gap. | Verify on deployment; use Workers Paid or split the check. |

## 6. Change requests after the acceptance run

HT-001 was marked **consumed** after VR-20260927-79d97bc. Its results informed the changes below, so it
can no longer provide acceptance evidence; `scripts/validate.mjs` enforces this. Re-runs on it are
labelled INFORMATIONAL.

| CR | Change | Commit | Development suite |
|---|---|---|---|
| CR-001 | Redesign the unknown-word gate to reduce false refusals without admitting adjacent-topic questions (options: an SME-curated domain vocabulary; a static, deterministic embedding model validated under Annex 22; adjacency detection) | **Open** — needs SME decision | — |
| CR-002 | "Overdue" = past due only, unless an upcoming window is asked for | `c3bdcff` | Regression case added |
| CR-003 | Listing questions reach the listing templates | `c3bdcff` | Regression case added |
| CR-004 | Stemmer: "expire" ~ "expired" | `c3bdcff` | Regression case added |
| CR-005 | Complete the function-word list (auxiliaries, pronouns, prepositions; not quantifiers or negation) | `d2fe349`, `07df8d0` | Regression case added |

| Informational run on HT-001 (not acceptance evidence) | Sensitivity | Specificity | T2 | T3 |
|---|---|---|---|---|
| VR-20260927-79d97bc (acceptance, before CRs) | 0.633 | 0.944 | 0.867 | 0.778 |
| VR-20260927-c3bdcff-INFO (after CR-002–004) | 0.633 | 0.944 | 1.000 | 0.889 |
| VR-20260927-d2fe349-INFO (CR-005 first version) | 0.733 | 0.944 | 1.000 | 0.778 — regression found and corrected |
| VR-20260927-07df8d0-INFO (after CR-005 correction) | 0.733 | 0.944 | 1.000 | 0.889 |

## 7. Required actions before release

1. Assign the roles in VP-001 §4 and approve IU-001, URS-001, FS-001, RA-001, VP-001, TP-001.
2. Decide and implement CR-001; close DEV-006 and DEV-007.
3. Have an independent SME write and verify HT-002 (sized per DEV-003), freeze it, and execute TP-001.
4. Measure the manual process baseline (DEV-004).
5. Deploy to the organisation's Cloudflare account behind **Cloudflare Access** (closes R-13), complete
   IQ (health check shows release commit, validated fingerprint, pinned model, `identity:
   cloudflare-access`) and the model OQ (DEV-011, DEV-012).
6. For any real GMP data: supplier assessment of Cloudflare and the model, data-residency controls or
   an on-premises model (R-17); decide whether AI-drafted queries stay enabled (R-08).
7. Train users on their human-in-the-loop responsibilities (IU-001 §5) and start monitoring reviews.

## 8. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner | | | |
| Process SME | | | |
| Quality Assurance | | | |
