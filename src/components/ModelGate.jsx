import React, { useState } from "react";
import { css } from "../lib/css.js";
import { useApp } from "../state/store.jsx";
import { MODELS, DEFAULT_MODEL, engine } from "../ai/engine.js";

// Full-screen overlay shown until a local model is ready. This is where the
// "the AI is in it" story is honest: the model downloads once, then is cached
// and runs fully offline.
export default function ModelGate() {
  const { engine: eng, loadModel } = useApp();
  const [backend, setBackend] = useState("webllm");
  const [modelId, setModelId] = useState(DEFAULT_MODEL);

  if (eng.ready) return null;

  const loading = eng.status === "loading";
  const webgpu = engine.constructor.webgpuAvailable?.() ?? !!navigator.gpu;

  return (
    <div style={css("position:fixed;inset:0;z-index:100;background:rgba(28,36,34,.72);display:grid;place-items:center;padding:20px")}>
      <div style={css("width:560px;max-width:100%;background:#F7F8F7;border:1px solid #C6CCC9;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden")}>
        <div style={css("background:#1C2422;color:#E8ECEA;padding:16px 20px;border-bottom:2px solid #0F6E63")}>
          <div style={css("display:flex;align-items:baseline;gap:8px")}>
            <span style={css("font-weight:700;font-size:16px")}>LabAgent</span>
            <span style={css("font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:#8FA39D")}>LOCAL AI · runs in your browser</span>
          </div>
          <div style={css("font-size:12px;color:#AFC0BB;margin-top:6px;line-height:1.5")}>
            A real language model runs 100% on your machine — no server, no API key, nothing sent anywhere.
            The weights download once (from Hugging Face), are cached by your browser, then work fully offline.
          </div>
        </div>

        <div style={css("padding:18px 20px;display:flex;flex-direction:column;gap:14px")}>
          {loading ? (
            <div style={css("display:flex;flex-direction:column;gap:10px")}>
              <div style={css("font-size:12.5px;color:#3A4744;font-family:'IBM Plex Mono',monospace")}>{eng.progress.text || "Loading…"}</div>
              <div style={css("height:12px;background:#E6E9E7;border-radius:6px;overflow:hidden;position:relative")}>
                <div style={{ ...css("position:absolute;inset:0;background:#0F6E63;border-radius:6px;transition:width .3s"), width: (eng.progress.pct ?? 4) + "%" }} />
              </div>
              <div style={css("font-size:11px;color:#71807B")}>
                First run downloads the model ({MODELS.find((m) => m.id === modelId)?.size || "~1 GB"}). Subsequent runs load it instantly from cache.
              </div>
            </div>
          ) : (
            <>
              <div style={css("display:flex;gap:8px")}>
                <button onClick={() => setBackend("webllm")} style={css(`flex:1;padding:10px;border-radius:5px;border:1px solid ${backend === "webllm" ? "#0F6E63" : "#C6CCC9"};background:${backend === "webllm" ? "#E4EEEC" : "#fff"};cursor:pointer;font-size:12.5px;font-weight:600;color:#1C2422`)}>
                  In-browser (WebGPU)
                </button>
                <button onClick={() => setBackend("ollama")} style={css(`flex:1;padding:10px;border-radius:5px;border:1px solid ${backend === "ollama" ? "#0F6E63" : "#C6CCC9"};background:${backend === "ollama" ? "#E4EEEC" : "#fff"};cursor:pointer;font-size:12.5px;font-weight:600;color:#1C2422`)}>
                  Ollama (local server)
                </button>
              </div>

              {backend === "webllm" && !webgpu && (
                <div style={css("font-size:11.5px;color:#A33025;background:#F4E3E1;border:1px solid #DCB4AF;border-radius:4px;padding:8px 10px;line-height:1.5")}>
                  WebGPU isn't available in this browser. Use a recent desktop Chrome or Edge, or switch to the Ollama backend.
                </div>
              )}

              {backend === "webllm" ? (
                <div style={css("display:flex;flex-direction:column;gap:8px")}>
                  {MODELS.map((m) => (
                    <label key={m.id} style={css(`display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid ${modelId === m.id ? "#0F6E63" : "#D9DDDB"};border-radius:5px;background:${modelId === m.id ? "#F2F7F5" : "#fff"};cursor:pointer`)}>
                      <input type="radio" name="model" checked={modelId === m.id} onChange={() => setModelId(m.id)} style={{ marginTop: "2px" }} />
                      <div style={css("display:flex;flex-direction:column;gap:2px")}>
                        <span style={css("font-size:12.5px;font-weight:600")}>{m.label} <span style={css("font-family:'IBM Plex Mono',monospace;font-size:10px;color:#71807B;font-weight:400")}>{m.size}</span></span>
                        <span style={css("font-size:11px;color:#5A6663")}>{m.note}</span>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div style={css("font-size:11.5px;color:#3A4744;background:#EFF1F0;border:1px solid #D9DDDB;border-radius:4px;padding:10px 12px;line-height:1.6")}>
                  Requires <b>Ollama</b> running locally. Install from ollama.com, then:
                  <pre style={css("margin:6px 0 0;background:#1C2422;color:#C9E4DE;padding:8px 10px;border-radius:4px;font-size:11px;overflow-x:auto")}>ollama pull llama3.2{"\n"}ollama serve</pre>
                  <input defaultValue="llama3.2" onChange={(e) => setModelId(e.target.value)} placeholder="model name (e.g. llama3.2)" style={css("margin-top:8px;width:100%;font-size:12px;padding:8px 10px;border:1px solid #B9C0BD;border-radius:4px;font-family:'IBM Plex Mono',monospace")} />
                </div>
              )}

              {eng.status === "error" && eng.error && (
                <div style={css("font-size:11.5px;color:#A33025;background:#F4E3E1;border:1px solid #DCB4AF;border-radius:4px;padding:8px 10px;line-height:1.5")}>{eng.error}</div>
              )}

              <button
                onClick={() => loadModel(backend, backend === "ollama" && modelId === DEFAULT_MODEL ? "llama3.2" : modelId)}
                disabled={backend === "webllm" && !webgpu}
                style={css(`padding:12px;background:${backend === "webllm" && !webgpu ? "#B9C0BD" : "#0F6E63"};color:#fff;border:none;border-radius:5px;font-size:13.5px;font-weight:600;cursor:${backend === "webllm" && !webgpu ? "not-allowed" : "pointer"}`)}
              >
                {backend === "webllm" ? "Download & start model" : "Connect to Ollama"}
              </button>
              <div style={css("font-size:10.5px;color:#71807B;line-height:1.5")}>
                All lab documents, samples and records in this app are synthetic and fictional. LabAgent proposes; a qualified human signs; nothing writes to a real LIMS.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
