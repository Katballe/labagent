import React, { useEffect, useState } from "react";
import { css } from "../lib/css.js";
import { useApp } from "../state/store.jsx";
import { MODELS, DEFAULT_MODEL, DEFAULT_OLLAMA_MODEL, engine } from "../ai/engine.js";
import { CLOUD_MODEL } from "../compliance/config.js";

const mono = "font-family:'IBM Plex Mono',monospace";
const pre = `margin:6px 0 0;background:#1C2422;color:#C9E4DE;padding:8px 10px;border-radius:4px;font-size:11px;overflow-x:auto;${mono};white-space:pre`;
const errBox = "font-size:11.5px;color:#A33025;background:#F4E3E1;border:1px solid #DCB4AF;border-radius:4px;padding:8px 10px;line-height:1.55";

function OllamaHelp({ code, model }) {
  const origin = typeof location !== "undefined" ? location.origin : "https://your-site";
  if (code === "ollama-down") {
    return (
      <div style={css(errBox)}>
        Couldn't reach Ollama at localhost:11434. Install it from ollama.com, then run:
        <pre style={css(pre)}>{`ollama pull ${model}\nollama serve`}</pre>
      </div>
    );
  }
  return (
    <div style={css(errBox)}>
      Couldn't reach Ollama from this page. Either it isn't running, or — most likely — Ollama only accepts requests from
      local pages and needs to be told to allow <b>{origin}</b>. Quit Ollama, then start it with:
      <div style={css("margin-top:6px;font-weight:600;color:#6E2A22")}>macOS / Linux</div>
      <pre style={css(pre)}>{`OLLAMA_ORIGINS="${origin}" ollama serve`}</pre>
      <div style={css("margin-top:6px;font-weight:600;color:#6E2A22")}>Windows (PowerShell)</div>
      <pre style={css(pre)}>{`$env:OLLAMA_ORIGINS="${origin}"; ollama serve`}</pre>
      <div style={css("margin-top:6px")}>If your browser asks whether this site may access devices on your local network, allow it. Make sure the model is pulled: <code>ollama pull {model}</code>.</div>
    </div>
  );
}

function Option({ active, onClick, title, sub, children }) {
  return (
    <div onClick={onClick} role="radio" aria-checked={active} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      style={css(`border:1px solid ${active ? "#0F6E63" : "#D0D5D3"};background:${active ? "#F2F7F5" : "#fff"};border-radius:6px;padding:11px 13px;cursor:pointer;display:flex;flex-direction:column;gap:6px`)}>
      <div style={css("display:flex;align-items:baseline;gap:8px")}>
        <span style={css(`width:12px;height:12px;border-radius:50%;flex:none;border:2px solid ${active ? "#0F6E63" : "#9AA6A2"};background:${active ? "#0F6E63" : "transparent"};box-shadow:inset 0 0 0 2px #fff`)} />
        <span style={css("font-size:13px;font-weight:600;color:#1C2422")}>{title}</span>
        <span style={css("font-size:11px;color:#5A6663")}>{sub}</span>
      </div>
      {active && children}
    </div>
  );
}

// Engine picker. The Cloudflare agent is the default wherever it is deployed;
// instant mode needs nothing and works offline; local models are optional.
// In every mode decisions stay deterministic — see src/ai/pipeline.js.
export default function EngineDialog() {
  const { engine: eng, engineOpen, setEngineOpen, loadModel, switchToInstant } = useApp();
  const [choice, setChoice] = useState(eng.backend);
  const [modelId, setModelId] = useState(DEFAULT_MODEL);
  const [ollamaModel, setOllamaModel] = useState(DEFAULT_OLLAMA_MODEL);
  const [gpu, setGpu] = useState(null);

  useEffect(() => {
    if (!engineOpen) return;
    setChoice(eng.loading?.backend || eng.backend);
    engine.constructor.webgpuSupport().then(setGpu);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineOpen]);

  useEffect(() => {
    if (!engineOpen) return;
    const onKey = (e) => e.key === "Escape" && setEngineOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engineOpen, setEngineOpen]);

  if (!engineOpen) return null;
  const loading = eng.loading;
  const picked = MODELS.find((m) => m.id === modelId);
  const webllmBlocked = !gpu?.ok || (picked?.f16 && !gpu?.f16);
  const goDisabled = !!loading || (choice === "webllm" && webllmBlocked) || (choice === "instant" && eng.instant) || (choice === "cloud" && eng.cloud);

  function go() {
    if (choice === "instant") { switchToInstant(); setEngineOpen(false); return; }
    if (choice === "cloud") { loadModel("cloud"); return; }
    loadModel(choice, choice === "ollama" ? ollamaModel.trim() || DEFAULT_OLLAMA_MODEL : modelId);
  }

  return (
    <div onClick={() => setEngineOpen(false)} style={css("position:fixed;inset:0;z-index:100;background:rgba(28,36,34,.6);display:grid;place-items:center;padding:20px")}>
      <div role="dialog" aria-modal="true" aria-label="Choose engine" onClick={(e) => e.stopPropagation()} style={css("width:600px;max-width:100%;max-height:calc(100vh - 40px);overflow-y:auto;background:#F7F8F7;border:1px solid #C6CCC9;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.35)")}>
        <div style={css("background:#1C2422;color:#E8ECEA;padding:14px 18px;border-bottom:2px solid #0F6E63;display:flex;align-items:baseline;gap:10px")}>
          <span style={css("font-weight:700;font-size:15px")}>How should LabAgent answer?</span>
          <span style={css(`${mono};font-size:10.5px;color:#8FA39D`)}>decisions stay deterministic in every mode</span>
          <span style={css("flex:1")} />
          <button onClick={() => setEngineOpen(false)} aria-label="Close" style={css("background:none;border:none;color:#AFC0BB;font-size:18px;cursor:pointer;line-height:1")}>×</button>
        </div>

        <div style={css("padding:16px 18px;display:flex;flex-direction:column;gap:10px")}>
          <Option active={choice === "cloud"} onClick={() => setChoice("cloud")} title="LabAgent agent on Cloudflare" sub={`default where deployed · ${CLOUD_MODEL.label}`}>
            <div style={css("font-size:11.5px;color:#3A4744;line-height:1.6")}>
              The LabAgent agent runs the same pipeline on Cloudflare with a pinned model (temperature 0, fixed seed). The model only words
              SOP answers, drafts unvalidated ad-hoc queries and explains OOS evidence — never the investigation record. The agent keeps the audit
              trail server-side and monitors itself daily. <b>Your questions leave this device</b>: fine for this synthetic demo; for real GxP data it
              must run in your organisation's Cloudflare account behind Access, with data localisation and a supplier assessment.
            </div>
          </Option>

          <Option active={choice === "instant"} onClick={() => setChoice("instant")} title="Instant mode" sub="offline · nothing to download · any browser">
            <div style={css("font-size:11.5px;color:#3A4744;line-height:1.6")}>
              No language model. Document answers are <b>verbatim quotes</b> from the validated SOPs with their citations; data questions map onto
              fixed read-only query templates; the OOS workflow uses its fixed step texts. Deterministic — the same question always gets the same answer,
              and it can't hallucinate because it never generates text.
            </div>
          </Option>

          <Option active={choice === "webllm"} onClick={() => setChoice("webllm")} title="AI model in this browser" sub="WebGPU · one-time download">
            <div style={css("display:flex;flex-direction:column;gap:7px")}>
              <div style={css("font-size:11.5px;color:#3A4744;line-height:1.6")}>
                A small open model runs on your GPU inside this tab and writes answers in its own words — still only from the retrieved sources, and every citation is
                checked in code before you see it. The weights download once from Hugging Face and are cached by your browser.
              </div>
              {gpu && !gpu.ok && <div style={css(errBox)}>{gpu.reason} WebGPU works in current desktop Chrome and Edge, Safari 26+, and Firefox 141+ on Windows. Instant mode and Ollama work everywhere.</div>}
              {MODELS.map((m) => {
                const off = gpu?.ok && m.f16 && !gpu.f16;
                return (
                  <label key={m.id} style={css(`display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border:1px solid ${modelId === m.id ? "#0F6E63" : "#D9DDDB"};border-radius:5px;background:#fff;cursor:${off ? "not-allowed" : "pointer"};opacity:${off ? 0.55 : 1}`)}>
                    <input type="radio" name="model" disabled={off} checked={modelId === m.id} onChange={() => setModelId(m.id)} style={{ marginTop: "2px" }} />
                    <span style={css("display:flex;flex-direction:column;gap:2px")}>
                      <span style={css("font-size:12.5px;font-weight:600")}>{m.label} <span style={css(`${mono};font-size:10px;color:#71807B;font-weight:400`)}>{m.size}</span></span>
                      <span style={css("font-size:11px;color:#5A6663")}>{off ? "This GPU lacks 16-bit float support." : m.note}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Option>

          <Option active={choice === "ollama"} onClick={() => setChoice("ollama")} title="Ollama on this computer" sub="bigger models · separate install">
            <div style={css("display:flex;flex-direction:column;gap:7px;font-size:11.5px;color:#3A4744;line-height:1.6")}>
              Uses an Ollama server running on this machine (localhost:11434). Install it from ollama.com and pull a model.
              <input value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} placeholder="model name, e.g. llama3.2" aria-label="Ollama model name"
                style={css(`width:100%;font-size:12px;padding:8px 10px;border:1px solid #B9C0BD;border-radius:4px;${mono}`)} />
            </div>
          </Option>

          {loading && (
            <div style={css("display:flex;flex-direction:column;gap:7px;padding:10px 12px;background:#fff;border:1px solid #D9DDDB;border-radius:5px")}>
              <div style={css(`font-size:11.5px;color:#3A4744;${mono}`)}>{loading.text || "Loading…"}</div>
              <div style={css("height:10px;background:#E6E9E7;border-radius:5px;overflow:hidden;position:relative")}>
                <div style={{ ...css("position:absolute;top:0;bottom:0;left:0;background:#0F6E63;border-radius:5px;transition:width .3s"), width: (loading.pct ?? 4) + "%" }} />
              </div>
              <div style={css("font-size:11px;color:#71807B")}>You can close this and keep working — instant mode answers until the model is ready, then it takes over.</div>
            </div>
          )}
          {!loading && eng.error === "cloud-unreachable" && choice === "cloud" && <div style={css(errBox)}>The agent isn't reachable from this page — for example on the GitHub Pages mirror, which serves the app without its Cloudflare backend. Instant mode works here.</div>}
          {!loading && eng.error && eng.error !== "cloud-unreachable" && eng.errorFor === choice && (eng.error.startsWith("ollama-") ? <OllamaHelp code={eng.error} model={ollamaModel || DEFAULT_OLLAMA_MODEL} /> : <div style={css(errBox)}>{eng.error}</div>)}

          <div style={css("display:flex;gap:8px;align-items:center")}>
            <button onClick={go} disabled={goDisabled}
              style={css(`flex:1;padding:11px;background:${goDisabled ? "#B9C0BD" : "#0F6E63"};color:#fff;border:none;border-radius:5px;font-size:13px;font-weight:600;cursor:${goDisabled ? "not-allowed" : "pointer"}`)}>
              {choice === "cloud" ? (eng.cloud ? "The agent is active" : "Connect to the agent") : choice === "instant" ? (eng.instant ? "Instant mode is active" : "Switch to instant mode") : choice === "webllm" ? `Download & start ${picked?.label || "model"}` : "Connect to Ollama"}
            </button>
            <button onClick={() => setEngineOpen(false)} style={css("padding:11px 16px;background:#fff;color:#3A4744;border:1px solid #C6CCC9;border-radius:5px;font-size:12.5px;cursor:pointer")}>Close</button>
          </div>
          <div style={css("font-size:10.5px;color:#71807B;line-height:1.5")}>
            Active now: <b>{eng.label}</b>. All documents, samples and records in LabAgent are synthetic. It proposes; a qualified human signs; nothing writes to a real LIMS.
          </div>
        </div>
      </div>
    </div>
  );
}
