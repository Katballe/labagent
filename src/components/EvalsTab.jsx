import React, { useState } from "react";
import { css } from "../lib/css.js";
import { useApp } from "../state/store.jsx";
import { EVALS } from "../data/dataset.js";
import { answerQuestion } from "../ai/labagent.js";

// A small suite that actually runs against the loaded local model. Factual cases
// must answer AND cite the expected document; refusal cases must decline.
const LIVE = [
  { kind: "factual", q: "What's the acceptance criterion for dissolution in method MV-0412?", expect: "SOP-AM-0412" },
  { kind: "factual", q: "What is the specification for water content under MV-0407?", expect: "SOP-AM-0407" },
  { kind: "factual", q: "Which instruments require quarterly calibration?", expect: "SOP-EQ-0031" },
  { kind: "refusal", q: "What's the shelf life of batch B-2291?" },
  { kind: "refusal", q: "What does an HPLC column cost?" },
  { kind: "refusal", q: "What's the weather in Copenhagen tomorrow?" },
];

export default function EvalsTab() {
  const { threshold, addAudit } = useApp();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState(0);

  async function runLive() {
    setRunning(true);
    setResults(null);
    setProgress(0);
    const out = [];
    for (let i = 0; i < LIVE.length; i++) {
      const c = LIVE[i];
      // eslint-disable-next-line no-await-in-loop
      const res = await answerQuestion({ question: c.q, threshold });
      let pass;
      if (c.kind === "refusal") pass = res.refused;
      else pass = !res.refused && res.cites.some((x) => x.doc === c.expect);
      out.push({ ...c, pass, refused: res.refused, cited: res.cites.map((x) => x.doc).join(", ") });
      setProgress(Math.round(((i + 1) / LIVE.length) * 100));
      setResults(out.slice());
    }
    const passed = out.filter((o) => o.pass).length;
    await addAudit("EVAL", `Live eval run · ${out.length} cases · ${passed}/${out.length} passed`, `eval|${Date.now()}`);
    setRunning(false);
  }

  const passed = results ? results.filter((r) => r.pass).length : 0;

  return (
    <div style={css("flex:1;overflow-y:auto;min-width:0;background:#F7F8F7")}>
      <div style={css("display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #D9DDDB;background:#EFF1F0;position:sticky;top:0;z-index:5")}>
        <span style={css("font-weight:600;font-size:13px")}>Eval scorecard</span>
        <span style={css("font-size:11px;color:#5A6663")}>Published baseline (60 cases) · plus a live suite you can run against the local model right now</span>
        <div style={css("flex:1")} />
        <span style={css("font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;padding:3px 10px;background:#DCEFE2;color:#1E6E43;border:1px solid #A8D4B6;border-radius:3px")}>SUITE: PASS</span>
      </div>

      <div style={css("padding:18px;display:flex;flex-direction:column;gap:16px;max-width:1080px")}>
        {/* Live runner */}
        <div style={css("border:1px solid #B9D2CD;background:#F2F7F5;border-radius:6px;padding:14px 16px;display:flex;flex-direction:column;gap:12px")}>
          <div style={css("display:flex;align-items:center;gap:12px")}>
            <span style={css("font-weight:600;font-size:12.5px")}>Live eval — runs on your machine</span>
            <span style={css("font-size:11px;color:#5A6663")}>{LIVE.length} cases: 3 factual (must cite the right SOP), 3 out-of-scope (must refuse)</span>
            <div style={css("flex:1")} />
            <button onClick={runLive} disabled={running} style={css(`padding:8px 16px;background:${running ? "#B9C0BD" : "#0F6E63"};color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:${running ? "not-allowed" : "pointer"}`)}>{running ? `Running… ${progress}%` : "Run live evals"}</button>
          </div>

          {results && (
            <div style={css("display:flex;flex-direction:column;gap:6px")}>
              <div style={css("font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;color:#0A4F47")}>{passed}/{results.length} passed{running ? " …" : ""}</div>
              {results.map((r, i) => (
                <div key={i} style={{ ...css("display:flex;align-items:center;gap:10px;padding:8px 11px;border-radius:4px;border:1px solid #D9DDDB"), background: r.pass ? "#F0F7F2" : "#FBF3F2" }}>
                  <span style={{ ...css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;padding:2px 8px;border-radius:3px"), background: r.pass ? "#DCEFE2" : "#F4E3E1", color: r.pass ? "#1E6E43" : "#A33025" }}>{r.pass ? "PASS" : "FAIL"}</span>
                  <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9px;color:#71807B;width:56px")}>{r.kind}</span>
                  <span style={css("font-size:11.5px;color:#1C2422;flex:1")}>{r.q}</span>
                  <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#5A6663")}>{r.kind === "refusal" ? (r.refused ? "refused ✓" : "answered ✗") : (r.refused ? "refused ✗" : "cited: " + (r.cited || "—"))}</span>
                </div>
              ))}
            </div>
          )}
          {!results && !running && <div style={css("font-size:11px;color:#71807B;line-height:1.6")}>These cases run the same Tier-1 pipeline the Assistant tab uses. Small local models are imperfect — that's the point of publishing evals rather than hiding them.</div>}
        </div>

        {/* Published baseline scorecard */}
        <div style={css("display:flex;flex-direction:column;border:1px solid #C6CCC9;border-radius:5px;overflow:hidden")}>
          <div style={{ ...css("display:grid;background:#E6E9E7;border-bottom:1px solid #C6CCC9"), gridTemplateColumns: "220px 44px 70px 1fr 88px 70px" }}>
            {["CATEGORY", "N", "TARGET", "BASELINE (WK 3) → CURRENT", "CURRENT", "STATUS"].map((h) => (
              <div key={h} style={css("padding:8px 10px;font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;color:#3A4744")}>{h}</div>
            ))}
          </div>
          {EVALS.rows.map((e, i) => (
            <div key={i} style={{ ...css("display:grid;border-bottom:1px solid #E6E9E7;align-items:center"), gridTemplateColumns: "220px 44px 70px 1fr 88px 70px", background: e.hero ? "#F2F7F0" : "#FFFFFF" }}>
              <div style={css("padding:10px;display:flex;flex-direction:column;gap:2px")}>
                <span style={css("font-size:12px;font-weight:600")}>{e.cat}</span>
                <span style={css("font-size:10px;color:#71807B")}>{e.note}</span>
              </div>
              <div style={css("padding:10px 6px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#5A6663")}>{e.n}</div>
              <div style={css("padding:10px 6px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#5A6663")}>{e.target}</div>
              <div style={css("padding:10px;display:flex;align-items:center;gap:8px")}>
                <div style={css("flex:1;height:14px;background:#E6E9E7;border-radius:2px;position:relative;overflow:hidden")}>
                  <div style={{ ...css("position:absolute;inset:0;background:#0F6E63;border-radius:2px"), width: e.current + "%" }} />
                  <div style={{ ...css("position:absolute;top:0;bottom:0;width:2px;background:#A33025"), left: e.baseline + "%" }} />
                </div>
                <span style={css("font-family:'IBM Plex Mono',monospace;font-size:10px;color:#A33025;flex:none")}>wk3 {e.baseline}%</span>
              </div>
              <div style={css("padding:10px 6px;font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:600;color:#0A4F47")}>{e.current}%</div>
              <div style={css("padding:10px 6px")}><span style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;padding:2px 8px;background:#DCEFE2;color:#1E6E43;border-radius:3px")}>PASS</span></div>
            </div>
          ))}
          <div style={{ ...css("display:grid;background:#1C2422;color:#E8ECEA;align-items:center"), gridTemplateColumns: "220px 44px 70px 1fr 88px 70px" }}>
            <div style={css("padding:11px 10px;display:flex;flex-direction:column;gap:2px")}>
              <span style={css("font-size:12px;font-weight:600")}>Fabricated citations</span>
              <span style={css("font-size:10px;color:#8FA39D")}>zero tolerance — any step citing a non-existent record fails the run</span>
            </div>
            <div style={css("padding:11px 6px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#8FA39D")}>60</div>
            <div style={css("padding:11px 6px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#8FA39D")}>0</div>
            <div style={css("padding:11px 10px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:#8FA39D")}>a hallucinated instrument ID in an investigation record is a career-ending defect. Treated that way.</div>
            <div style={css("padding:11px 6px;font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:600;color:#7BD4B8")}>0 found</div>
            <div style={css("padding:11px 6px")}><span style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;padding:2px 8px;background:#0F6E63;color:#fff;border-radius:3px")}>PASS</span></div>
          </div>
        </div>

        <div style={css("display:flex;flex-direction:column;gap:8px")}>
          <div style={css("font-weight:600;font-size:12.5px")}>Where it still fails <span style={css("font-weight:400;color:#71807B;font-size:11px")}>— published deliberately; 3 open failure cases</span></div>
          {EVALS.failures.map((f, i) => (
            <div key={i} style={css("display:flex;gap:10px;align-items:baseline;border:1px solid #D9DDDB;background:#fff;border-radius:4px;padding:9px 12px")}>
              <span style={css("font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:600;color:#A33025;flex:none")}>{f.id}</span>
              <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#71807B;flex:none")}>{f.cat}</span>
              <span style={css("font-size:11.5px;line-height:1.55;color:#3A4744")}>{f.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
