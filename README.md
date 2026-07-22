# LabAgent — GxP LIMS Assistant

A retrieval-grounded AI assistant for regulated (GxP) laboratory work, designed to survive an audit:
**citations or refusal, read-only data access, a fixed-sequence OOS workflow ending at a human approval
gate, an append-only audit trail, and a published eval scorecard.**

The AI runs **100% on your own machine**. No API key. No server. No account. Nothing you type ever
leaves your computer.

> All documents, samples, instruments and records are **synthetic and fictional**, authored for this
> project. No employer material is used. This is a portfolio/reference implementation, not a validated
> production system.

---

## Quick start

```bash
git clone https://github.com/katballe/labagent.git
cd labagent
npm install
npm run dev
```

Open http://localhost:5173, pick a model, and click **Download & start model**.

**Requirements:** Node 18+ and a browser with WebGPU — desktop **Chrome or Edge 113+** (enabled by
default). Firefox and Safari do not yet ship WebGPU; use the Ollama backend there.

---

## How the AI actually works (read this)

There are two backends. Both are fully local.

### 1. In-browser (default) — WebLLM + WebGPU

A quantized open-weights model runs directly in the browser tab on your GPU.

**The model weights are not in this git repository, and cannot be.** A 1–2 GB model exceeds GitHub's
file limits and would make the repo unusable. Instead, the first time you click *Download & start
model*, the weights stream from Hugging Face's CDN and are stored in your browser's Cache Storage.

After that first download:

- the app works **fully offline** — disconnect your network and it still answers;
- startup is instant (loaded from local cache);
- nothing is ever sent to Hugging Face, Anthropic, or anyone else at inference time.

| Model | Download | Notes |
|---|---|---|
| Llama 3.2 1B | ~0.9 GB | Fastest, runs on most laptops. Default. |
| Llama 3.2 3B | ~1.9 GB | Noticeably better reasoning. Needs a capable GPU. |
| Qwen 2.5 1.5B | ~1.1 GB | Strong at structured output (SQL, JSON). |

### 2. Ollama (optional) — bigger models

If you already run [Ollama](https://ollama.com):

```bash
ollama pull llama3.2
ollama serve
```

Then choose **Ollama (local server)** in the startup dialog. This gives you access to far larger
models, still entirely on your machine.

**Be honest about small models.** A 1B model running in a browser tab is not GPT-4. It will
occasionally phrase things awkwardly or miss a nuance. The architecture around it — hard retrieval
gating, a SELECT-only database guard, a fixed workflow sequence, and a human approval gate — is
specifically designed so that the model being imperfect cannot produce an unsafe or uncited outcome.
That is the entire point of the project.

---

## The five tiers

| Tab | What it does | What is *real* |
|---|---|---|
| **T1 Assistant** | Document QA over a 17-document validated corpus | Real TF-IDF retrieval, real grounded generation, real confidence-threshold refusal |
| **T2 Data query** | Natural language → read-only SQL | The model writes real SQL, a guard proves it is SELECT-only, and it executes against a **real in-browser SQLite** (sql.js) |
| **T3 OOS triage** | 8-step Phase 1 investigation per SOP-QA-0102 | The sequence is fixed in code; the model reasons *within* each step from gathered evidence. Ends at a human signature gate |
| **Audit trail** | Append-only log of every interaction | Real **SHA-256** content hashes via Web Crypto, model + prompt version stamped |
| **Evals** | Published scorecard + a live suite | The live suite genuinely runs 6 cases against your loaded model and scores them |

### The safety properties, and where they live in the code

- **Cite or refuse** — `src/ai/rag.js` scores the question against the corpus. Terms absent from the
  corpus entirely carry maximum IDF weight and are never matched, which drives out-of-scope questions
  below the refusal threshold. Measured separation on the current corpus: in-scope questions score
  0.70–1.00, out-of-scope 0.00–0.47, against a default threshold of 0.60.
- **No write path** — `src/ai/db.js` `validateSelect()` rejects multiple statements, anything not
  beginning `SELECT`/`WITH`, and any `INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/ATTACH/PRAGMA/…`. The
  model cannot reach the database except through this guard.
- **The model never chooses the workflow** — the 8 OOS steps are a constant array in
  `src/data/dataset.js`. The model only writes the summary text for a step it was handed.
- **Nothing is written anywhere** — approval produces an export and an audit entry. There is no LIMS
  integration in any state.
- **Superseded documents are surfaced** — retrieving both an effective and a superseded version
  raises a conflict banner rather than silently picking one.

---

## Project layout

```
src/
  ai/
    engine.js      backend abstraction (WebLLM | Ollama), model loading + streaming
    rag.js         TF-IDF retriever, confidence scoring, refusal + conflict detection
    db.js          sql.js SQLite, SELECT-only guard
    labagent.js    tier operations composing retriever + db + model
    prompts.js     system prompts (the behavioural contract)
  data/
    dataset.js     corpus metadata, OOS case + fixed steps, draft, eval scorecard
    knowledge.js   the retrievable chunks — the entire world the assistant may cite
    seed.js        synthetic LIMS database schema + rows
  components/      the five tabs + model loading gate
  state/store.jsx  shared state, audit trail with real SHA-256
```

## Build & deploy

```bash
npm run build      # -> dist/
npm run preview    # serve the build locally
```

`base: "./"` in `vite.config.js` keeps all asset paths relative, so the build works from a GitHub
Pages sub-path or opened from disk. Pushing to `main` deploys automatically via
`.github/workflows/deploy.yml` — enable **Settings → Pages → Source: GitHub Actions** once.

## Licence

MIT. The synthetic dataset is authored for this project and free to reuse.
