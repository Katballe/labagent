# LabAgent — GxP LIMS Assistant

A demo of an assistant for regulated (GxP) laboratory work, built to survive an audit:
**cite or refuse, read-only data access, a fixed-sequence OOS workflow ending at a human approval
gate, a hash-chained audit trail, and evals that run on every build.**

**Open it and use it — nothing to install, nothing to download, no account.** By default LabAgent
runs in *instant mode*: no language model at all, just retrieval, verbatim quotes and fixed query
templates, so it works immediately in any modern browser. A local AI model (in the browser via
WebGPU, or through Ollama) is an optional upgrade. Either way, everything runs on your device and
nothing you type is sent anywhere.

> All documents, samples, instruments and records are **synthetic and fictional**, authored for this
> project. This is a portfolio/reference implementation, not a validated production system.

---

## Quick start

```bash
git clone https://github.com/Katballe/labagent.git
cd labagent
npm install
npm run dev        # runs the evals, then serves http://localhost:5173
```

Requires Node 20.19+ (the CI uses Node 22).

---

## Three ways to answer

Pick one from the **engine** menu in the top bar. The guard rails are identical in all three.

### 1. Instant mode (default) — no model, no download

| Tab | What instant mode does |
|---|---|
| **Assistant** | Retrieves the best passage and quotes it **verbatim** with its document and section — or refuses. It cannot hallucinate because it never generates text. |
| **Data query** | Matches the question to one of a handful of fixed, parameterised read-only queries (OOS results, results by batch/sample/instrument/analyst/time window, calibration status and due dates, qualifications, counts). Anything it can't map, it says so. |
| **OOS triage** | Shows each step's fixed finding; the triage assistant quotes the gathered evidence or declines. |

Deterministic: the same question always gets the same answer, which is also what makes it testable.

### 2. AI model in the browser — WebLLM + WebGPU

A small open model runs on your GPU inside the tab and answers in its own words. The weights
(~0.9–1.9 GB) download once from Hugging Face and are cached by the browser; after that it works
offline. WebGPU ships in current desktop Chrome and Edge, Safari 26+, and Firefox 141+ on Windows.
The Qwen 2.5 and Llama 3.2 3B builds need a GPU with 16-bit float shader support; the dialog
disables them when yours doesn't have it.

| Model | Download | Notes |
|---|---|---|
| Llama 3.2 1B | ~0.9 GB | Fastest; runs on most laptops with WebGPU. |
| Qwen 2.5 1.5B | ~1.1 GB | Strong at structured output (SQL). Needs shader-f16. |
| Llama 3.2 3B | ~1.9 GB | Best answers; needs a capable GPU with shader-f16. |

While a model downloads, instant mode keeps answering; the model takes over when it's ready.

### 3. Ollama — bigger models

```bash
ollama pull llama3.2
ollama serve
```

Ollama only accepts requests from local pages by default. To use it from the **hosted** site, start it
with the site's origin allowed (the dialog shows the exact command for the page you're on):

```bash
OLLAMA_ORIGINS="https://katballe.github.io" ollama serve                 # macOS / Linux
$env:OLLAMA_ORIGINS="https://katballe.github.io"; ollama serve          # Windows PowerShell
```

The app checks that the model you name is actually pulled before switching to it.

**Be honest about small models.** A 1B model in a browser tab is not a frontier model. The architecture
around it is designed so that an imperfect model cannot produce an uncited or unsafe outcome — and the
model path is tested with a scripted stand-in model on every build (see *Evals*).

---

## The guard rails, and where they live

- **Cite or refuse** — `src/ai/rag.js` retrieves with TF-IDF over the chunks in
  `src/data/knowledge.js` (plus document titles and section headings). A question is refused before
  any answer is attempted if it names something the corpus never mentions (“…on the moon”, “batch
  B-9999”, “shelf life”) or if retrieval covers too little of it. A small synonym map keeps ordinary
  rephrasings (“scales” → balance, “moisture” → water) from being refused.
- **Citations are checked in code, not trusted to the model** — `src/ai/citations.js`. A model answer
  must cite at least one document it was given and nothing else; OOS summaries and triage answers may
  only mention record ids present in the gathered evidence. Failing answers are withheld (shown
  collapsed as “not relied upon”); failing step summaries fall back to the fixed text.
- **Superseded documents** — when an effective and a superseded version are both retrieved, the
  answer relies only on the effective one and a banner flags the conflict.
- **No write path, three times over** — `src/ai/sqlcore.js`: (1) a guard that lexes out strings and
  comments, then allows exactly one `SELECT`/`WITH` statement with no write/DDL/PRAGMA keywords;
  (2) the SQLite database itself is switched to `PRAGMA query_only`, so a write that slipped past the
  guard would still fail; (3) requests to change data (“delete…”, “set … to …”) are declined before a
  query is even generated.
- **No runaway queries** — queries run in a Web Worker (`src/ai/db.worker.js`); one that takes longer
  than 3 s is stopped by terminating the worker, and the next query starts a fresh one. The page never
  freezes.
- **The model never chooses the workflow** — the 8 OOS steps are a constant array in
  `src/data/dataset.js`; the model only phrases the finding of the step it was handed.
- **Human approval gate** — approving needs a typed name, a confirmation that every step and its
  evidence was reviewed, and records the signature's meaning and time. Rejecting needs a reason. This
  is a demo e-signature: real 21 CFR Part 11 signing also re-authenticates the signer against a
  controlled account, and this demo has no accounts.
- **Hash-chained audit trail** — `src/lib/audit.js`. Every entry stores the SHA-256 of its content and
  of the previous entry, and its own hash covers both, so editing, removing or reordering any entry is
  detected by *Verify chain*. The trail lives in this browser's localStorage: tamper-*evident*, not
  tamper-proof (a production system keeps the chain on a server users can't write to). Export it as
  JSON, or run the *Tamper test*, which edits a copy and shows where verification breaks.

---

## Evals

`npm run evals` runs ~135 cases against the real pipeline in instant mode and writes
`public/eval-results.json`, which the **Evals** tab displays. It runs before every build and **exits
non-zero if any category is below its target — so a regression fails the build and nothing deploys.**

| Category | What is checked |
|---|---|
| Factual answers | answered, quoting the right document (and section, where given) — including paraphrases |
| Refusals | off-topic questions, unknown ids, data the corpus doesn't hold |
| Superseded document | answers only from the effective version, flags the old one |
| Citation check | the validator on fabricated, foreign and missing citations |
| Read-only SQL guard | writes, stacked statements, PRAGMA, comment/string tricks; legitimate reads still run |
| Engine-level read-only | writes executed *past* the guard are refused by SQLite itself (build only) |
| Runaway query | an endless recursive query is stopped and the database recovers (browser only) |
| Data questions → records | each template returns exactly the expected rows, or declines |
| OOS workflow & triage | fixed steps; triage quotes the right evidence or declines |
| Records & corpus integrity | every document and record the app mentions exists; the workflow's stated facts match the database |
| Audit chain | intact chain verifies; edits, removals, reordering and re-hashed forgeries are detected |
| Model output is checked | a scripted stand-in model's answers, SQL and summaries go through the same checks as a real model's (build only) |

The Evals tab can also run the suite **in your browser**, through whichever engine is active — with a
local model loaded, that measures the model itself. Honest limits: the retriever was tuned against
these cases, so they are regression tests rather than a blind benchmark, and the corpus is small.

---

## Project layout

```
src/
  ai/
    engine.js      answer engine: instant | WebLLM | Ollama, model loading + streaming
    rag.js         TF-IDF retriever, unknown-subject + confidence refusal, conflict detection
    extract.js     instant mode: verbatim passage selection
    citations.js   citation / record-id checks for model output
    nl2sql.js      instant mode: question → fixed read-only query templates
    sqlcore.js     SELECT-only guard, database seeding with PRAGMA query_only
    db.js          worker client with timeout + restart
    db.worker.js   sql.js database in a Web Worker
    labagent.js    tier operations composing retriever + database + engine
    prompts.js     system prompts for model mode
  evals/           eval cases + runner (shared by the build and the Evals tab)
  data/            corpus list, retrievable chunks, OOS case, synthetic LIMS seed
  lib/             audit chain, SHA-256
  components/      the five tabs + engine dialog
  state/store.jsx  shared state, reviewer name, serialised audit appends
scripts/run-evals.mjs  headless eval run for the build
```

## Build & deploy

```bash
npm run build      # evals, then vite build -> dist/
npm run preview    # serve the build locally
```

`base: "./"` keeps all asset paths relative, so the build works from a GitHub Pages sub-path. Pushing
to `main` runs `.github/workflows/deploy.yml`: install, evals, build, publish to GitHub Pages.

## Licence

MIT. The synthetic dataset is authored for this project and free to reuse.
