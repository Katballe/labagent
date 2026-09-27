# LabAgent — GxP LIMS Assistant

A demonstration of an AI assistant for a GMP quality-control laboratory, built around the draft
**EU GMP Annex 22 "Artificial Intelligence"** (July 2025): **deterministic logic makes every
decision; a language model only does non-critical work that a person reviews.** It answers SOP
questions with the passage that governs (or says "undecided"), looks up LIMS data read-only, and
assembles a Phase 1 OOS investigation that a person signs. Everything is logged to a hash-chained
audit trail.

> **Status: demonstration with synthetic data, not released for GMP use.** The validation documents are
> drafts, and the first held-out acceptance test did not meet four of five criteria — see
> [docs/validation/validation-report.md](docs/validation/validation-report.md). All documents,
> samples, instruments and people are fictional.

- **Full app with the Cloudflare agent:** `https://labagent.mkatballe.workers.dev/` (after deployment)
- **Static mirror, instant mode only:** https://katballe.github.io/labagent/

## How it answers

| Engine | Where | What the model does |
|---|---|---|
| **LabAgent agent on Cloudflare** (default where deployed) | Cloudflare Worker + Agents SDK Durable Objects, pinned Workers AI model (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, temperature 0, fixed seed) | Words SOP answers from the retrieved passages; drafts an ad-hoc query when no validated template fits (labelled UNVALIDATED); explains OOS evidence. Never writes the investigation record. |
| **Instant mode** | In the browser, no model, nothing to download, works offline | Nothing — verbatim quotes, fixed query templates, fixed OOS findings |
| **WebLLM / Ollama** | Local model in the browser (WebGPU) or on this computer | Same non-critical roles as the agent |

The guard rails are the same in every mode because they live in one shared pipeline
([src/ai/pipeline.js](src/ai/pipeline.js)), not in the model:

- **Undecided, not guessed** — a question naming something the corpus never mentions, or retrieval
  confidence below the threshold, ends as UNDECIDED.
- **Citations checked in code** — model answers must cite a passage they were given and nothing
  else; OOS explanations may only mention records in the evidence; failing output is withheld.
- **Explainability** — each answer records the passages used and the question words each matched.
- **Read-only, three times over** — a lexing SQL guard, SQLite `PRAGMA query_only`, and change
  requests declined before any query exists. The agent also refuses recursive queries.
- **The OOS record is deterministic** — fixed steps, fixed findings, rule-based classification, human
  approval (name, confirmation, signature meaning; rejection needs a reason).
- **Audit trail written by the system** — the agent keeps an append-only, hash-chained ledger per
  session; clients can only add workflow, review and evaluation events. Identity comes from verified
  Cloudflare Access JWTs where configured, otherwise it is marked "(unverified)".
- **Configuration control** — model, settings, prompts, corpus, workflow and data hash into a
  configuration fingerprint recorded with every entry and compared with the validated run.
- **Monitoring** — the agent counts outcomes, human-review verdicts and out-of-corpus words, and runs
  a daily self-check (the development suite plus a model determinism probe).

## Evals and validation

| | Command | Role |
|---|---|---|
| Development suite (147 cases, 12 categories) | `npm run evals` | Regression gate: runs before every build, fails the build below target, also runs inside the agent daily |
| Held-out acceptance test | `npm run validate` | Annex 22 §4–§7: frozen by SHA-256, access logged, metrics (confusion matrix, sensitivity/specificity with Wilson intervals, citation accuracy) against criteria fixed beforehand; a consumed set can't give acceptance evidence again |

The Evals tab shows both; the Compliance tab shows intended use, configuration fingerprints, live
monitoring and Annex 22 clause status. The documents are in [docs/](docs/README.md), including the
[LabVantage integration analysis](docs/labvantage-integration.md).

## Run it

```bash
npm install
npm run dev            # app only, instant mode: http://localhost:5173
npm run agent:local    # app + Cloudflare agent via wrangler, without Workers AI: http://localhost:8788
```

Node 20.19+ (CI uses 22). Workers AI always needs a Cloudflare login, so the local agent answers
deterministically; everything else (Durable Objects, audit ledger, monitor, self-check) runs locally.

## Deploy

Pushing to `main` runs the standard Cloudflare workflow (`.github/workflows/deploy.yml`: `npm ci` →
evals → build → `wrangler deploy --tag <commit>`), which needs the repository secret
`CLOUDFLARE_API_TOKEN` ("Edit Cloudflare Workers"; add Workers AI permission if the deploy is refused
on the AI binding). `.github/workflows/pages.yml` publishes the instant-mode mirror to GitHub Pages.

For anything beyond this synthetic demo: put the Worker behind **Cloudflare Access** and set
`ACCESS_TEAM_DOMAIN` / `ACCESS_AUD`, review where data is processed (or use an on-premises model),
and complete the actions in the validation report.

## Project layout

```
src/ai/pipeline.js       the shared pipeline (browser, agent, evals)
src/ai/                  retriever, extractive answers, citation checks, templates, SQL guard, engines
src/compliance/          pinned configuration + fingerprint, intended use and Annex 22 status
src/evals/               development suite, held-out set HT-001 (consumed), runner
src/components/          Assistant, Data query, OOS triage, Audit trail, Evals, Compliance tabs
worker/                  Cloudflare agent: routing, Agent class, Workers AI adapter, DB, Access
scripts/                 run-evals.mjs (build gate), validate.mjs (acceptance test)
validation/              held-out lock, test-data access log, run records
docs/                    Annex 22 assessment, validation documents, operations, LabVantage
```

## Licence

MIT. The synthetic dataset is authored for this project and free to reuse.
