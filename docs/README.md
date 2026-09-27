# LabAgent documentation

LabAgent is designed against **EU GMP Annex 22 "Artificial Intelligence" (draft, July 2025)** and
Annex 11. Start with the assessment, then the validation set.

**Status: demonstration system with synthetic data — not released for GMP use.** The first acceptance
test failed four of five criteria; see the validation report for what that means and what is needed.

| Document | What it answers |
|---|---|
| [Annex 22 assessment](compliance/annex-22-assessment.md) | What the draft requires, how LabAgent is classified, clause-by-clause status |
| [Intended use](validation/intended-use.md) | What each function is for, criticality, input sample space, human-in-the-loop duties |
| [User requirements (URS)](validation/urs.md) | 26 requirements for the app and its Cloudflare agent |
| [Functional & design spec](validation/functional-spec.md) | Architecture, components, API, configuration, security of the Cloudflare agent |
| [Risk assessment](validation/risk-assessment.md) | FMEA: 20 risks, controls, verification, residual risk |
| [Validation plan](validation/validation-plan.md) | Categorisation, roles, deliverables, test strategy, release criteria |
| [Test plan TP-001](validation/test-plan.md) | Held-out acceptance test: data, metrics, criteria fixed before execution |
| [Traceability matrix](validation/traceability-matrix.md) | URS → spec → risks → verification |
| [Validation report](validation/validation-report.md) | Results, deviations, change requests, release actions |
| [Operations](operations/model-lifecycle.md) | Change and configuration control, monitoring, audit-trail review, training, periodic review |
| [LabVantage integration](labvantage-integration.md) | How LabAgent applies to LabVantage LIMS and how to implement it |

Evidence lives next to the code: `validation/` (held-out lock, access log, run records),
`public/eval-results.json` (development suite, generated per build), and the agent's `/api/monitor`.
