// Answer engine. Three backends, one interface:
//   • "instant" — the default. No language model: answers are verbatim quotes
//                 from the corpus, data questions map onto fixed query templates,
//                 and the OOS workflow uses its fixed step texts. Nothing to
//                 download, works in every browser, fully deterministic.
//   • "webllm"  — a quantized LLM running 100% in this browser via WebGPU.
//                 Weights download once from Hugging Face, then are cached.
//   • "ollama"  — a local Ollama server (http://localhost:11434) for bigger models.
//
// Instant mode is always available: while a model downloads (or if it fails),
// the app keeps answering in instant mode. The rest of the app only calls
// engine.chat() and reads the snapshot; guard rails are applied outside it.

export const MODELS = [
  {
    id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    label: "Llama 3.2 1B",
    size: "~0.9 GB",
    note: "Fastest; runs on most laptops with WebGPU.",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 1.5B",
    size: "~1.1 GB",
    note: "Strong at structured output (SQL). Needs a GPU with 16-bit float support.",
    f16: true,
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B",
    size: "~1.9 GB",
    note: "Best answers; needs a capable GPU with 16-bit float support.",
    f16: true,
  },
];

export const DEFAULT_MODEL = MODELS[0].id;
export const DEFAULT_OLLAMA_MODEL = "llama3.2";
export const OLLAMA_URL = "http://localhost:11434";

export function engineLabel(backend, modelId) {
  if (backend === "instant") return "instant (no model)";
  if (backend === "ollama") return `ollama:${modelId}`;
  return String(modelId || "").replace(/-MLC$/, "");
}

const pct = (p) => (typeof p?.progress === "number" ? Math.round(p.progress * 100) : null);
const isLocalOrigin = () =>
  typeof location === "undefined" || /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname) || location.protocol === "file:";

class Engine {
  constructor() {
    this.backend = "instant"; // the backend that answers right now
    this.modelId = null;
    this.loading = null; // { backend, modelId, text, pct } while a model loads
    this.error = null; // last load error (instant mode keeps working)
    this.errorFor = null; // which backend that error belongs to
    this._webllm = null; // MLCEngine instance
    this._loadSeq = 0;
    this._listeners = new Set();
    this._rebuild();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  // useSyncExternalStore needs a referentially stable snapshot, so build it
  // once per state change rather than on every read.
  _rebuild() {
    this._snapshot = {
      backend: this.backend,
      modelId: this.modelId,
      label: engineLabel(this.backend, this.modelId),
      instant: this.backend === "instant",
      loading: this.loading,
      error: this.error,
      errorFor: this.errorFor,
    };
  }
  _emit() {
    this._rebuild();
    this._listeners.forEach((fn) => fn(this._snapshot));
  }
  snapshot() {
    return this._snapshot;
  }
  label() {
    return this._snapshot.label;
  }

  /** { ok, f16, reason } — whether this browser can run WebLLM at all. */
  static async webgpuSupport() {
    if (typeof navigator === "undefined" || !navigator.gpu) {
      return { ok: false, f16: false, reason: "This browser doesn't expose WebGPU." };
    }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { ok: false, f16: false, reason: "WebGPU is present but no usable GPU adapter was found (it may be disabled or blocklisted)." };
      return { ok: true, f16: adapter.features.has("shader-f16") };
    } catch (e) {
      return { ok: false, f16: false, reason: "WebGPU failed to initialise: " + (e?.message || e) };
    }
  }

  switchToInstant() {
    this._loadSeq++; // any load still in flight will not take over
    this.backend = "instant";
    this.modelId = null;
    this.loading = null;
    this.error = null;
    this._emit();
  }

  async load(backend, modelId) {
    if (backend === "instant") return this.switchToInstant();
    const seq = ++this._loadSeq;
    const stale = () => seq !== this._loadSeq;
    this.error = null;
    this.loading = { backend, modelId, text: backend === "ollama" ? "Connecting to Ollama…" : "Loading engine…", pct: null };
    this._emit();

    const fail = (msg) => {
      if (stale()) return;
      this.loading = null;
      this.error = msg;
      this.errorFor = backend;
      this._emit();
    };
    const succeed = () => {
      if (stale()) return;
      this.backend = backend;
      this.modelId = modelId;
      this.loading = null;
      this._emit();
    };

    if (backend === "ollama") {
      let res;
      try {
        res = await fetch(`${OLLAMA_URL}/api/tags`);
      } catch {
        // A network-level failure is either "not running" or, from a hosted
        // page, Ollama refusing the page's origin (CORS). Both look the same.
        return fail(isLocalOrigin() ? "ollama-down" : "ollama-cors");
      }
      if (!res.ok) return fail(`Ollama responded ${res.status}.`);
      const names = ((await res.json().catch(() => ({})))?.models || []).map((m) => m.name);
      const want = modelId.includes(":") ? modelId : `${modelId}:latest`;
      if (!names.includes(modelId) && !names.includes(want)) {
        return fail(`Ollama is running but doesn't have “${modelId}”. Run \`ollama pull ${modelId}\`` +
          (names.length ? `, or use one you have: ${names.slice(0, 6).join(", ")}.` : "."));
      }
      return succeed();
    }

    // WebLLM
    const support = await Engine.webgpuSupport();
    if (!support.ok) return fail(support.reason);
    const model = MODELS.find((m) => m.id === modelId);
    if (model?.f16 && !support.f16) return fail(`${model.label} needs 16-bit float shaders, which this GPU doesn't offer. Pick Llama 3.2 1B instead.`);

    try {
      const webllm = await import("@mlc-ai/web-llm");
      const initProgressCallback = (p) => {
        if (stale()) return;
        this.loading = { backend, modelId, text: p.text || "Downloading model…", pct: pct(p) };
        this._emit();
      };
      if (this._webllm) {
        this._webllm.setInitProgressCallback?.(initProgressCallback);
        await this._webllm.reload(modelId);
      } else {
        this._webllm = await webllm.CreateMLCEngine(modelId, { initProgressCallback });
      }
      succeed();
    } catch (e) {
      fail((e && e.message) || String(e));
    }
  }

  // messages: [{role, content}]. Returns the full assistant string; onToken(delta)
  // fires as text streams in.
  async chat({ messages, temperature = 0.2, maxTokens = 700, onToken }) {
    if (this.backend === "instant") throw new Error("Instant mode has no language model.");
    if (this.backend === "ollama") return this._ollamaChat({ messages, temperature, maxTokens, onToken });
    if (!this._webllm) throw new Error("Model not loaded.");

    const generate = async () => {
      const stream = await this._webllm.chat.completions.create({ messages, temperature, max_tokens: maxTokens, stream: true });
      let out = "";
      for await (const chunk of stream) {
        const delta = chunk?.choices?.[0]?.delta?.content || "";
        if (delta) { out += delta; onToken?.(delta); }
      }
      return out;
    };
    try {
      return await generate();
    } catch (e) {
      const msg = (e && e.message) || String(e);
      // The GPU process can drop the model (driver reset, long-backgrounded tab).
      // Recover once by reloading the cached weights — nothing re-downloads.
      if (/ModelNotLoaded|device.?(was )?(removed|lost)|Model not loaded|unmapped/i.test(msg)) {
        await this._webllm.reload(this.modelId);
        return await generate();
      }
      throw e;
    }
  }

  async _ollamaChat({ messages, temperature, maxTokens, onToken }) {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.modelId, messages, stream: true, options: { temperature, num_predict: maxTokens } }),
    });
    if (!res.ok || !res.body) throw new Error("Ollama chat failed: " + res.status);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", out = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.error) throw new Error("Ollama: " + msg.error);
        const delta = msg.message?.content || "";
        if (delta) { out += delta; onToken?.(delta); }
      }
    }
    return out;
  }
}

export const engine = new Engine();
