# Validation Plan — LabAgent v2.0

| | |
|---|---|
| Document | VP-001, version 1.0 |
| Status | **Draft — approval pending** |

## 1. Purpose and scope

Establish that LabAgent (browser application and Cloudflare agent) is fit for the intended use in
[IU-001](intended-use.md) and remains so in operation. In scope: the application, the agent
(`worker/`), the pinned model configuration, the data and corpus it serves, the build and deploy
pipeline, and the operational controls. Out of scope: the Cloudflare platform itself (qualified by
supplier assessment), and any LIMS/DMS integration (see [LabVantage integration](../labvantage-integration.md),
which would be its own project).

## 2. Regulatory basis

- **EU GMP Annex 22 — Artificial Intelligence** (draft for consultation, 7 July 2025). Not final. The
  EMA workshop of 30 June–1 July 2026 is considering risk-based use of generative AI with guardrails;
  this plan follows the stricter draft until the final text is published, and will be re-assessed
  then (see [operations](../operations/model-lifecycle.md) §8).
- **EU GMP Annex 11 — Computerised Systems** (current, and the July 2025 draft revision) and
  **Chapter 4** (documentation, draft revision).
- **21 CFR Part 11** — used as a reference for electronic records and signatures.
- **GAMP 5 2nd ed.** (2022) including its guidance on AI/ML-enabled systems; ICH Q9(R1) for risk.

## 3. System categorisation (GAMP 5)

| Element | Category | Approach |
|---|---|---|
| LabAgent application and agent code | 5 — custom | Full lifecycle: URS → FS → risk → tests → report |
| Retrieval, templates, guard, OOS logic | 5 — custom, deterministic | Development suite + acceptance test |
| Workers AI model (Llama 3.3 70B, Meta; hosted by Cloudflare) | Third-party AI component, used non-critically | Supplier assessment; pinned version; model-path checks; daily determinism probe; HITL records |
| Agents SDK, sql.js, React, Vite | 1/3 — libraries/tools | Version-pinned via lockfile; covered by system tests |
| Cloudflare Workers, Durable Objects, Access | 1 — infrastructure | Supplier assessment (security certifications, DPA, change notices), installation verification |

## 4. Roles

| Role | Responsibility | Assigned |
|---|---|---|
| Process owner | Owns the intended use; approves URS and release | — |
| Process SME | Intended use, subgroups, acceptance criteria, label verification, test-plan input, feature review (Annex 22 §3–§8) | — |
| System owner | Configuration, monitoring, change control, periodic review | — |
| Quality Assurance | Approves plan, test plan, report; oversees deviations | — |
| Developer / data scientist | Builds the system; runs the development suite; must not access held-out data (Annex 22 §6.5) | Claude (AI assistant) for v2.0 — see DEV-001 |
| Test data custodian | Holds the held-out set, controls access, keeps the access log | — |

All personnel need defined qualifications and access levels (Annex 22 §2.1). None are assigned yet.

## 5. Deliverables

| Deliverable | Document | Status |
|---|---|---|
| Intended use | [intended-use.md](intended-use.md) | Draft |
| User requirements | [urs.md](urs.md) | Draft |
| Functional & design specification | [functional-spec.md](functional-spec.md) | Draft |
| Risk assessment | [risk-assessment.md](risk-assessment.md) | Draft |
| Test plan (acceptance) | [test-plan.md](test-plan.md) | Draft, frozen before execution |
| Traceability matrix | [traceability-matrix.md](traceability-matrix.md) | Draft |
| Test records | `validation/runs/*.json`, `validation/test-data-access.log`, CI build logs (development suite) | Generated |
| Validation report | [validation-report.md](validation-report.md) | Draft — not released |
| Operations (change, configuration, monitoring, review) | [../operations/model-lifecycle.md](../operations/model-lifecycle.md) | Draft |
| Annex 22 assessment | [../compliance/annex-22-assessment.md](../compliance/annex-22-assessment.md) | Draft |

## 6. Test strategy

| Stage | What | How | Evidence |
|---|---|---|---|
| Installation verification (IQ) | The deployed Worker runs the intended commit with the intended bindings and configuration | `GET /api/health`: `worker.tag` = release commit, `config` = validated fingerprint, `model` = pinned id, `identity` = `cloudflare-access`; `wrangler deployments list`; ops/deploy-check | Screenshot/JSON attached to the report |
| Operational verification (OQ) | Each function behaves as specified, including failure handling | Development suite (`npm run evals`, runs on every build and gates deploy); agent self-check (same suite inside the Durable Object incl. engine read-only and model-path checks); scripted API checks (rate limit, forged event kinds, monitor not reachable) | CI logs, `public/eval-results.json`, monitor self-check records |
| Acceptance (PQ) | Fit for intended use on data not used in development | Held-out set per [TP-001](test-plan.md) (`npm run validate`), criteria fixed beforehand | `validation/runs/VR-*.json`, access log |
| Operation | Stays fit for use | Monitor counters, drift terms, daily self-check, human-review records, periodic review | Monitor, audit trail |

**Development vs held-out data.** `src/evals/cases.js` is the development set: used for tuning and as
a build gate. The held-out set is used only for acceptance; it is frozen by SHA-256 before first use
(`validation/heldout.lock.json`), each access is logged, and once its results inform development it is
marked consumed and can no longer produce acceptance evidence (Annex 22 §6).

## 7. Acceptance and release criteria

Release for use requires: all acceptance criteria of TP-001 met on a held-out set that is independent
and SME-verified; all High risks closed or formally accepted by QA; deviations closed or justified; IQ
completed on the production deployment; approvals of all deliverables.

## 8. Deviations and change control

Deviations are numbered DEV-nnn in the validation report, each with an investigation, impact and
action. Changes after testing follow [operations](../operations/model-lifecycle.md) §2: impact
assessment, development suite, and — where retrieval, answering or template behaviour changes — a new
held-out acceptance test.

## 9. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Process owner | | | |
| System owner | | | |
| Quality Assurance | | | |
