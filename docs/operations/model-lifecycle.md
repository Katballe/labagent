# Operations — change control, configuration, monitoring and review

| | |
|---|---|
| Document | OP-001, version 1.0 |
| Basis | EU GMP Annex 22 (draft) §10; Annex 11 (change and configuration management, periodic review, audit trail review, security) |
| Status | **Draft** |

## 1. What is under control

| Item | Where | Identified by |
|---|---|---|
| Code (app, pipeline, agent) | Git, `main` branch | Commit; deployed Worker version tag = commit (CI `--tag`) |
| Pinned model and generation settings | `src/compliance/config.js` | Configuration fingerprint |
| Prompts | `src/ai/prompts.js` | `PROMPT_VERSION` + fingerprint |
| Corpus, OOS workflow, database seed | `src/data/*` | Fingerprint |
| Platform configuration | `wrangler.jsonc` | Commit |
| Development suite | `src/evals/cases.js` | Commit |
| Held-out sets | `src/evals/heldout*.js` + `validation/heldout*.lock.json` | SHA-256 lock |

The fingerprint is recorded in every audit entry and shown in the Compliance tab next to the
fingerprint and commit of the validated run. A difference means an untested configuration.

## 2. Change control (Annex 22 §10.1)

Every change is a pull request to `main` with:

1. **Description and reason**, and the change request id if it follows a deviation.
2. **Impact assessment** — which functions (F1–F5) and risks (RA-001) are affected.
3. **Development suite** — must pass; CI refuses to deploy otherwise.
4. **Re-test decision**, documented in the PR:

| Change | Re-test required |
|---|---|
| Retrieval (stop words, synonyms, stemmer, tags, threshold), extractive selection, templates | Development suite **and** a new acceptance run on an unconsumed held-out set |
| Corpus content or database seed | Development suite (integrity category) and acceptance run for affected subgroups |
| Prompts, model id, generation settings | Development suite, model-path checks, determinism probe, and a reviewed sample of model outputs |
| Workers AI announces deprecation or change of the pinned model | Treat as a model change before the provider's date |
| UI text only, documentation | Development suite; no acceptance run (justify in the PR) |
| Platform (wrangler, compatibility date, Agents SDK) | Development suite, CI dry run (`ops/deploy-check/ci-local.mjs`), agent self-check after deploy |

A decision not to re-test must be justified in the PR (Annex 22 §10.1).

## 3. Configuration control (Annex 22 §10.2)

- Deploys happen only through the standard GitHub Actions workflow; each deploy is tagged with its
  commit, so `ops/deploy-check` can prove production = `main`.
- Unauthorised change detection: the Compliance tab and `/api/health` expose the running fingerprint,
  commit and Worker version; the daily self-check records the fingerprint it ran with.
- Branch protection on `main` (required review + passing CI) should be enabled before release.

## 4. Monitoring (Annex 22 §10.3–10.4)

| Signal | Source | Review | Trigger |
|---|---|---|---|
| Daily self-check (development suite inside the agent) | `/api/monitor` → `checks` | Daily, automatic | Any failure → incident, stop model use if it concerns model checks |
| Determinism probe (same question twice through the model) | self-check | Weekly | Output differs or loses its citation twice in a week → change assessment |
| Answered / undecided (by reason) / withheld | monitor counters | Weekly | Undecided or withheld rate moves > 10 points from the 4-week mean |
| Human-review override rate (incorrect / all reviews) | monitor counters, REVIEW entries | Weekly | > 5 % → investigate; > 10 % → suspend generative wording (`LLM_ENABLED=false`) |
| Input drift — words asked about that the corpus lacks | monitor `unknownTerms` | Monthly | Recurring terms → corpus gap or out-of-scope use; feed to the SME |
| AI budget use | monitor `llm-calls` | Monthly | Cap reached often → capacity decision |

## 5. Audit trail review, retention and backup

- The agent's ledger is authoritative. Review a sample of entries monthly (Annex 11 audit-trail review),
  including all REVIEW entries marked incorrect and all withheld outputs.
- Verify the chain on export (the Audit tab verifies in the browser, independently of the server).
- Durable Object storage is durable but not an archive: production needs scheduled export of each
  ledger to an archive with its own retention and access controls, and a restore test.

## 6. Incidents

Wrong answer relied upon, audit-chain failure, unexpected model behaviour, security event:

1. Record in the QMS; preserve the audit trail export.
2. Contain: `LLM_ENABLED=false` (deterministic only) or take the Worker offline; the Pages mirror stays
   available in deterministic mode.
3. Investigate root cause; raise a change request; re-test per §2.

## 7. Training (Annex 22 §3.3)

Users are trained before access on: what the system decides and what it doesn't; that the controlled
SOP governs; how to read the verbatim source and record a verdict; that UNVALIDATED queries must be
verified in the LIMS; the OOS approval meaning. Operator performance (review consistency) is part of
periodic review.

## 8. Periodic review

Every 6 months, and when the final Annex 22 is published: monitoring trends, deviations and CRs,
supplier changes (Cloudflare, model), regulatory changes, whether the intended use still matches actual
use (drift terms), and whether the validated state still holds. The EMA's 2026 consultation follow-up
may allow generative AI in more roles with guardrails; any extension of the model's role is a change
under §2 with a new risk assessment.

## 9. Supplier management

Cloudflare (Workers, Durable Objects, Workers AI, Access) and the model provider are assessed before
release: security certifications, data processing terms and location, sub-processors, change and
deprecation notices for Workers AI models, incident notification, and exit (the pipeline can run
without Workers AI: deterministic, or with an on-premises model through Ollama).
