// Local AI engine. Two backends, one interface:
//   • "webllm"  — a quantized LLM running 100% in this browser via WebGPU.
//                 Weights download once from Hugging Face, then are cached and
//                 work fully offline. Nothing leaves the machine.
//   • "ollama"  — an optional local Ollama server (http://localhost:11434) for
//                 users who want bigger/faster models. Also fully local.
//
// The rest of the app only ever calls engine.chat({messages}) and reads
// engine state; it never knows which backend is active.

export const MODELS = [
  {
    id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    label: "Llama 3.2 1B",
    size: "~0.9 GB",
    note: "Fastest. Runs on most laptops. Good default.",
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B",
    size: "~1.9 GB",
    note: "Noticeably smarter. Needs a capable GPU.",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 1.5B",
    size: "~1.1 GB",
    note: "Strong at structured output (SQL, JSON).",
  },
];

export const DEFAULT_MODEL = MODELS[0].id;

function nowPct(p) {
  if (typeof p?.progress === "number") return Math.round(p.progress * 100);
  return null;
}

class Engine {
  constructor() {
    this.backend = "webllm";
    this.modelId = DEFAULT_MODEL;
    this.status = "idle"; // idle | loading | ready | error
    this.progress = { text: "", pct: null };
    this.error = null;
    this._webllm = null; // MLCEngine instance
    this._listeners = new Set();
    this._snapshot = null;
    this._rebuild();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
  // useSyncExternalStore requires a referentially stable snapshot, so we build
  // it once per state change rather than on every read.
  _rebuild() {
    this._snapshot = {
      backend: this.backend,
      modelId: this.modelId,
      status: this.status,
      progress: this.progress,
      error: this.error,
      ready: this.status === "ready",
    };
  }
  _emit() {
    this._rebuild();
    this._listeners.forEach((fn) => fn(this._snapshot));
  }
  snapshot() {
    return this._snapshot;
  }

  static webgpuAvailable() {
    return typeof navigator !== "undefined" && !!navigator.gpu;
  }

  async load(backend = this.backend, modelId = this.modelId) {
    this.backend = backend;
    this.modelId = modelId;
    this.error = null;

    if (backend === "ollama") {
      this.status = "loading";
      this.progress = { text: "Connecting to Ollama…", pct: null };
      this._emit();
      try {
        const res = await fetch("http://localhost:11434/api/tags");
        if (!res.ok) throw new Error("Ollama responded " + res.status);
        this.status = "ready";
        this.progress = { text: "Ollama connected", pct: 100 };
        this._emit();
      } catch (e) {
        this.status = "error";
        this.error =
          "Could not reach Ollama at localhost:11434. Install it from ollama.com, run `ollama serve`, and `ollama pull " +
          modelId +
          "`.";
        this._emit();
      }
      return;
    }

    // WebLLM
    if (!Engine.webgpuAvailable()) {
      this.status = "error";
      this.error =
        "WebGPU is not available in this browser. Use a recent Chrome or Edge (desktop), or switch to the Ollama backend.";
      this._emit();
      return;
    }

    this.status = "loading";
    this.progress = { text: "Loading engine…", pct: 0 };
    this._emit();

    try {
      const webllm = await import("@mlc-ai/web-llm");
      const initProgressCallback = (p) => {
        this.progress = { text: p.text || "Downloading model…", pct: nowPct(p) };
        this._emit();
      };
      // Reuse a single engine; reload if the model changed.
      if (this._webllm) {
        await this._webllm.reload(modelId);
      } else {
        this._webllm = await webllm.CreateMLCEngine(modelId, {
          initProgressCallback,
        });
      }
      this.status = "ready";
      this.progress = { text: "Model ready", pct: 100 };
      this._emit();
    } catch (e) {
      this.status = "error";
      this.error = (e && e.message) || String(e);
      this._emit();
    }
  }

  isReady() {
    return this.status === "ready";
  }

  // messages: [{role, content}]. Returns the full assistant string.
  // onToken(delta) is called as text streams in (WebLLM); for Ollama it fires
  // once with the whole message.
  async chat({ messages, temperature = 0.2, maxTokens = 700, onToken }) {
    if (this.backend === "ollama") {
      const res = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.modelId,
          messages,
          stream: false,
          options: { temperature, num_predict: maxTokens },
        }),
      });
      if (!res.ok) throw new Error("Ollama chat failed: " + res.status);
      const data = await res.json();
      const text = data?.message?.content || "";
      if (onToken && text) onToken(text);
      return text;
    }

    if (!this._webllm) throw new Error("Model not loaded.");

    const generate = async () => {
      const stream = await this._webllm.chat.completions.create({
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      });
      let out = "";
      for await (const chunk of stream) {
        const delta = chunk?.choices?.[0]?.delta?.content || "";
        if (delta) {
          out += delta;
          if (onToken) onToken(delta);
        }
      }
      return out;
    };

    try {
      return await generate();
    } catch (e) {
      const msg = (e && e.message) || String(e);
      // The browser GPU process can drop the model (a driver TDR / device-removed
      // reset, or a tab left backgrounded). Recover once by reloading the cached
      // weights — this is fast since nothing re-downloads.
      if (/ModelNotLoaded|device.?removed|Model not loaded|unmapped/i.test(msg)) {
        await this._webllm.reload(this.modelId);
        return await generate();
      }
      throw e;
    }
  }
}

export const engine = new Engine();
