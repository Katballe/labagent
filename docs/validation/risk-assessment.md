# Risk Assessment — LabAgent v2.0 (FMEA)

| | |
|---|---|
| Document | RA-001, version 1.0 |
| Method | Failure mode and effects analysis per ICH Q9(R1) and GAMP 5 2nd ed.; Annex 22 §2.3 (draft) |
| Status | **Draft — SME and QA review pending** |

**Scales.** Severity (S): H = could affect patient safety, product quality or data integrity; M = GMP
non-compliance without direct product impact; L = usability/cost. Probability (P) after design
controls: H / M / L. Detectability (D): H = the failure is visible to the user or detected
automatically; L = it could go unnoticed. **Risk class** = S × P, then raised one level when D is L.
Evidence for "observed" probabilities comes from the acceptance run VR-20260927-79d97bc.

| ID | Function | Failure mode | Effect | S | P | D | Class | Design controls | Verification | Residual / action |
|---|---|---|---|---|---|---|---|---|---|---|
| R-01 | F1 | Answer states something the SOP doesn't say (hallucination) | Wrong lab practice | H | L | H | Medium | Extractive default; model answers must cite a given passage (checked in code); verbatim passage shown; AI label; human verdict | Dev: citations, modelpath; HT-001 AC-2 (19/19) | Accept with HITL; monitor override rate |
| R-02 | F1 | Answer relies on a superseded version | Obsolete procedure followed | H | L | H | Medium | Superseded passages never quoted when an effective one exists; conflict banner; prompt instruction | Dev: superseded (2/2) | Accept |
| R-03 | F1 | Question outside the corpus is answered with a loosely related passage | User acts on an irrelevant passage | H | **M (observed 1/18)** | H | **High** | Unknown-word gate; confidence threshold; verbatim passage + citation shown so a reader sees what it actually says | HT-001 AC-1 **failed** (KF "serviced" answered with a calibration passage) | **Open — DEV-006 / CR-001.** Until closed: F1 is a look-up aid only; users trained that the passage, not the phrasing, governs |
| R-04 | F1 | Answerable question refused | User looks it up manually (existing process) | L | **H (observed 11/30)** | H | Medium | Refusal states the reason; manual path unchanged | HT-001 AC-3 **failed** (0.633) | **Open — DEV-007 / CR-001** (usability, not safety) |
| R-05 | F3 | Generative model influences the OOS record or classification | Wrong disposition of a batch | H | L | L | **Medium** | Findings and classification are fixed text; `stepFinding` never calls a model; explanations labelled and outside the record | Dev: workflow, modelpath "step findings stay fixed" | Accept |
| R-06 | F1/F3 | Model output names a record or document that doesn't exist / wasn't given | Fabricated evidence in a decision | H | M | H | Medium | `checkDocCitations`, `checkRecordIds`; withheld outputs shown collapsed only | Dev: citations (8/8), modelpath | Accept |
| R-07 | F2 | A query modifies data | Data integrity breach | H | L | H | Medium | No write path; guard; `PRAGMA query_only`; change requests declined before any query | Dev: sqlguard (17/17), readonly (5/5), modelpath; HT-001 change requests 3/3 | Accept |
| R-08 | F2 | Result of an AI-drafted (unvalidated) query used for a GMP decision | Decision on wrong data | H | M | M | **High** | Templates first; model SQL labelled UNVALIDATED — informational only; SQL shown verbatim | Dev: modelpath "flagged unvalidated" | Procedure: verify in LIMS (training). Consider disabling model SQL in production |
| R-09 | F2 | Template returns the wrong records | Wrong data shown | H | L (after CR-002/003) | M | Medium | Templates covered by expected-row tests; SQL shown | Dev: nl2sql (20/20); HT-001 AC-4 failed before CR-002/003, 15/15 informational after | Re-test with HT-002 |
| R-10 | F2 | Runaway query exhausts resources | Outage | L | M | H | Low | Browser: 3 s worker kill; agent: recursion refused, 500-row cap, platform CPU limit | Browser: timeout test; agent: guard test | Accept |
| R-11 | F4 | Audit entry missing, edited or reordered | Loss of traceability | H | L | H | Medium | Agent writes its own entries; hash chain; serialised appends; no update/delete code; client events restricted to T3/REVIEW/SYS/EVAL | Dev: audit (6/6); agent smoke test (forged T1 event refused) | Accept; production needs backup/archival (see operations) |
| R-12 | F4 | Local (browser) ledger cleared | Loss of local records | M | M | H | Medium | Clearing records a new chain with the old head hash; agent ledger is authoritative | Manual | Accept for demo; production uses the agent only |
| R-13 | F4 | Actor identity spoofed | Records attributed to the wrong person | H | M (no Access in demo) | L | **High** | Access JWT verified (RS256, audience, issuer, expiry); otherwise "(unverified)" | Code review; production IQ with Access | **Open — requires Cloudflare Access in production** |
| R-14 | Agent | Model changed or retired by the provider | Untested behaviour | M | M | M | Medium | Model id pinned; fingerprint; daily determinism probe; supplier change notices | Self-check; monitor | Change control triggers re-test |
| R-15 | Agent | Model output not repeatable | Inconsistent answers | M | M | H | Medium | Temperature 0 + fixed seed; only non-critical uses; probe records identical/not | Daily probe | Accept (non-critical) |
| R-16 | Agent | Questions drift outside the intended use | Performance no longer representative | M | M | M | Medium | Out-of-corpus terms counted daily; undecided rate trend | Monitor | Periodic review |
| R-17 | Agent | Confidential GMP data processed outside the organisation's control | Data protection / confidentiality breach | H | L (synthetic) / H (real data) | L | **High for real data** | Synthetic data only; model optional; on-prem model path (Ollama) available | — | **Open for any real deployment**: organisation's account, Access, data localisation, supplier assessment, or on-prem model |
| R-18 | Agent | Cost overrun / abuse | Budget, availability | L | M | H | Low | Rate limit; daily model cap | Code review | Accept |
| R-19 | Validation | Test data not independent of development | Over-estimated performance | H | **H (observed: dev 100 % vs held-out 63 %)** | M | **High** | Separate held-out set, hash lock, access log, consumed-set guard | VR-20260927-79d97bc; lock/guard | **Open — DEV-001/-005**: SME-authored HT-002 needed |
| R-21 | F1→F2 | Document QA shows database records for a question meant for the SOPs, or the fixed order of the open-items view is taken as a priority decision (CR-007) | Wrong information acted on; prioritisation delegated to the tool | M | L | H | Low | SOP path first; routing only after an SOP refusal and a full schema-vocabulary match; validated templates only; labelled FROM THE LIMS / OPEN ITEMS, SQL shown; the view states that priorities are the user's; narrow worklist patterns | DEV routing (14/14) | Accept; SME to approve the open-items list, its explanations and its order |
| R-20 | Config | Browser and agent run different configurations | Untested combination | M | L | H | Low | Fingerprint shown for both and compared with the validated run | Compliance tab | Accept |

## Summary

Controls reduce most risks to Medium or Low. Five High risks remain open and block any use with real
GMP data: **R-03** (false answers to adjacent questions), **R-08** (reliance on unvalidated AI
queries), **R-13** (unverified identity), **R-17** (data leaving the organisation's control) and
**R-19** (test-data independence). Each has an owner action in the
[validation report](validation-report.md#6-required-actions-before-release).
