# Traceability Matrix — LabAgent v2.0

| | |
|---|---|
| Document | TM-001, version 1.0 |
| Status | **Draft** |

Verification references: **DEV:** development-suite category (`src/evals/cases.js`, run on every build
and in the agent's daily self-check) · **HT/AC:** held-out acceptance criterion in
[TP-001](test-plan.md) · **SMOKE:** scripted API checks against the agent (recorded in the
[validation report](validation-report.md) §3) · **IQ:** installation verification on deployment ·
**REVIEW:** document/code review.

| URS | Requirement (short) | FS | Risks | Verification | Status |
|---|---|---|---|---|---|
| URS-001 | Answers only from the corpus, cited | FS-01, FS-03, FS-04 | R-01 | DEV factual (26/26); AC-2 (pass); AC-3 (fail) | Partially verified |
| URS-002 | UNDECIDED when not in corpus | FS-02 | R-03 | DEV refusal (15/15); AC-1 (**fail**, 1 false answer) | **Not met** — CR-001 |
| URS-003 | Confidence logged; threshold | FS-01, FS-02, FS-10 | R-03, R-04 | DEV refusal; SMOKE (audit content has confidence/threshold) | Verified |
| URS-004 | Passages and matched words recorded | FS-03, FS-10 | R-01 | SMOKE (audit content `retrieved`, `cited[].matched`); REVIEW | Verified |
| URS-005 | Effective version only; conflict shown | FS-01, FS-03 | R-02 | DEV superseded (2/2) | Verified |
| URS-006 | No generative AI in the OOS record | FS-09 | R-05 | DEV workflow (fixed findings), modelpath "step findings stay fixed text with a model loaded" | Verified |
| URS-007 | AI text labelled, shown with its source | FS-04, FS-06 | R-01, R-08 | REVIEW (UI labels); SMOKE | Verified by review |
| URS-008 | Model output checked in code; withheld otherwise | FS-04, FS-09 | R-01, R-06 | DEV citations (8/8), modelpath (14/14), adapter (6/6) | Verified (scripted model); real model: IQ/OQ pending |
| URS-009 | Human verdicts recorded and aggregated | FS-10, FS-13 | R-01 | SMOKE (review → REVIEW entry, monitor counters) | Verified |
| URS-010 | No write path; engine read-only | FS-07, FS-08 | R-07 | DEV sqlguard (17/17), readonly (5/5, node and agent) | Verified |
| URS-011 | Change requests declined | FS-05 | R-07 | DEV nl2sql; HT change requests (3/3) | Verified |
| URS-012 | Templates first; AI queries labelled unvalidated | FS-05, FS-06 | R-08, R-09 | DEV modelpath (template never reaches model; unvalidated flag); AC-4 (fail → 15/15 informational after CR-002/003) | Verified by DEV; acceptance pending HT-002 |
| URS-013 | Query limits | FS-07, FS-08 | R-10 | DEV timeout (browser); SMOKE (agent refuses RECURSIVE) | Verified |
| URS-014 | Fixed OOS sequence; approval/rejection rules | FS-09 | R-05 | REVIEW; browser test (approve needs name + confirmation; reject needs reason) | Verified by test/review |
| URS-015 | Audit trail content | FS-10, FS-14 | R-11 | DEV audit (6/6); SMOKE (entry fields) | Verified |
| URS-016 | Agent writes its own entries; client kinds restricted | FS-10 | R-11 | SMOKE (forged `T1` event refused) | Verified |
| URS-017 | Tamper-evident, independently verifiable, exportable | FS-10 | R-11, R-12 | DEV audit (edit, delete, reorder, re-hash detected); browser verify + tamper test + export | Verified |
| URS-018 | Verified identity or "(unverified)" | FS-11 | R-13 | REVIEW; IQ with Access | **Not verified** — needs Access (R-13) |
| URS-019 | Model and settings pinned | FS-12, FS-14 | R-14 | DEV adapter (pinned id, temperature 0, seed) | Verified |
| URS-020 | Fingerprint recorded and compared; commits shown | FS-14 | R-14, R-20 | SMOKE (browser = agent fingerprint); Compliance tab | Verified |
| URS-021 | Deterministic fallback with a note | FS-12 | — | SMOKE (agent without AI binding answers deterministically) | Partially verified (budget path: REVIEW) |
| URS-022 | Monitoring, drift, daily self-check | FS-13 | R-14, R-15, R-16 | SMOKE (self-check run in the agent: suite PASS; counters) | Verified locally; determinism probe pending deployment |
| URS-023 | Rate and budget limits | FS-15, FS-12 | R-18 | REVIEW | Not tested |
| URS-024 | Works with nothing to install | FS-16 | — | Browser test (Pages mirror / local) | Verified |
| URS-025 | Held-out acceptance testing controls | FS-17 | R-19 | Lock + access log + consumed guard exercised (VR-20260927-79d97bc and INFO runs) | Controls verified; independence **not met** (DEV-001, DEV-005) |
| URS-026 | Build gate | FS-17 | — | CI dry run (`ci-local.mjs`), `prebuild` | Verified |
