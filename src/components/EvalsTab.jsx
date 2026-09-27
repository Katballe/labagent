import React, { useEffect, useState } from "react";
import { css } from "../lib/css.js";
import { useApp } from "../state/store.jsx";
import { runSuite } from "../evals/runner.js";
import { runSelect } from "../ai/db.js";

const mono = "font-family:'IBM Plex Mono',monospace";
const pctTxt = (r) => `${Math.round(r * 100)}%`;
const COLS = "250px 56px 64px 1fr 76px 64px";

function Scorecard({ categories, cases }) {
  const [open, setOpen] = useState(null);
  return (
    <div style={css("display:flex;flex-direction:column;border:1px solid #C6CCC9;border-radius:5px;overflow:hidden")}>
      <div style={{ ...css("display:grid;background:#E6E9E7;border-bottom:1px solid #C6CCC9"), gridTemplateColumns: COLS }}>
        {["CATEGORY", "CASES", "TARGET", "", "PASSED", "STATUS"].map((h, i) => (
          <div key={i} style={css(`padding:8px 10px;${mono};font-size:10px;font-weight:600;color:#3A4744`)}>{h}</div>
        ))}
      </div>
      {categories.map((c) => {
        const mine = cases.filter((x) => x.cat === c.key);
        const isOpen = open === c.key;
        return (
          <div key={c.key} style={css("border-bottom:1px solid #E6E9E7")}>
            <div onClick={() => setOpen(isOpen ? null : c.key)} style={{ ...css("display:grid;align-items:center;cursor:pointer"), gridTemplateColumns: COLS, background: c.pass ? "#FFFFFF" : "#FBF3F2" }}>
              <div style={css("padding:9px 10px;display:flex;flex-direction:column;gap:2px")}>
                <span style={css("font-size:12px;font-weight:600")}>{isOpen ? "▾" : "▸"} {c.label} <span style={css(`${mono};font-size:9px;color:#9AA6A2;font-weight:400`)}>{c.tier}{c.env === "node" ? " · build only" : c.env === "browser" ? " · browser only" : ""}</span></span>
                <span style={css("font-size:10px;color:#71807B")}>{c.note}</span>
              </div>
              <div style={css(`padding:9px 6px;${mono};font-size:11px;color:#5A6663`)}>{c.n}</div>
              <div style={css(`padding:9px 6px;${mono};font-size:11px;color:#5A6663`)}>{c.target === 1 ? "100%" : `≥${pctTxt(c.target)}`}</div>
              <div style={css("padding:9px 10px")}>
                <div style={css("height:12px;background:#E6E9E7;border-radius:2px;position:relative;overflow:hidden")}>
                  <div style={{ ...css("position:absolute;top:0;bottom:0;left:0;border-radius:2px"), width: pctTxt(c.rate), background: c.pass ? "#0F6E63" : "#A33025" }} />
                  <div title="target" style={{ ...css("position:absolute;top:0;bottom:0;width:2px;background:#1C2422;opacity:.5"), left: `calc(${pctTxt(c.target)} - 2px)` }} />
                </div>
              </div>
              <div style={css(`padding:9px 6px;${mono};font-size:13px;font-weight:600;color:#0A4F47`)}>{c.passed}/{c.n}</div>
              <div style={css("padding:9px 6px")}>
                <span style={{ ...css(`${mono};font-size:9.5px;font-weight:600;padding:2px 8px;border-radius:3px`), background: c.pass ? "#DCEFE2" : "#F4E3E1", color: c.pass ? "#1E6E43" : "#A33025" }}>{c.pass ? "PASS" : "FAIL"}</span>
              </div>
            </div>
            {isOpen && (
              <div style={css("background:#F7F8F7;padding:6px 12px 10px 24px;display:flex;flex-direction:column;gap:3px")}>
                {mine.map((x, i) => (
                  <div key={i} style={css("display:flex;gap:8px;align-items:baseline;font-size:11px;line-height:1.5")}>
                    <span style={{ ...css(`${mono};font-size:10px;font-weight:600;flex:none;width:14px`), color: x.pass ? "#1E6E43" : "#A33025" }}>{x.pass ? "✓" : "✗"}</span>
                    <span style={css("color:#1C2422;flex:1")}>{x.name}</span>
                    <span style={css(`${mono};font-size:10px;color:#71807B;text-align:right;max-width:46%`)}>{x.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function EvalsTab() {
  const { addAudit, engine: eng } = useApp();
  const [published, setPublished] = useState(undefined); // undefined = loading, null = unavailable
  const [live, setLive] = useState(null);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    fetch("./eval-results.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setPublished)
      .catch(() => setPublished(null));
  }, []);

  async function runLive() {
    setLive(null);
    setProgress({ done: 0, total: 1 });
    const t0 = performance.now();
    const res = await runSuite({
      where: "browser",
      exec: (sql) => runSelect(sql),
      runaway: (sql) => runSelect(sql),
      onProgress: (done, total) => setProgress({ done, total }),
    });
    const ms = Math.round(performance.now() - t0);
    const passedCases = res.cases.filter((c) => c.pass).length;
    setLive({ ...res, ms, engine: eng.label, passedCases });
    setProgress(null);
    await addAudit("EVAL", `Eval suite run in browser · ${eng.label} · ${passedCases}/${res.cases.length} cases passed · ${res.passed ? "all targets met" : "BELOW TARGET"}`,
      res.categories.map((c) => `${c.label}: ${c.passed}/${c.n}`).join("\n"));
  }

  const running = !!progress;
  const pub = published;

  return (
    <div style={css("flex:1;overflow-y:auto;min-width:0;background:#F7F8F7")}>
      <div style={css("display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #D9DDDB;background:#EFF1F0;position:sticky;top:0;z-index:5")}>
        <span style={css("font-weight:600;font-size:13px")}>Eval scorecard</span>
        <span style={css("font-size:11px;color:#5A6663")}>Real cases, run against the real pipeline — on every build, and here in your browser on demand.</span>
        <div style={css("flex:1")} />
        {pub && (
          <span style={{ ...css(`${mono};font-size:10px;font-weight:600;padding:3px 10px;border-radius:3px;border:1px solid`), ...(pub.passed ? { background: "#DCEFE2", color: "#1E6E43", borderColor: "#A8D4B6" } : { background: "#F4E3E1", color: "#A33025", borderColor: "#DCB4AF" }) }}>
            BUILD SUITE: {pub.passed ? "PASS" : "FAIL"} · {pub.totalPassed}/{pub.total}
          </span>
        )}
      </div>

      <div style={css("padding:18px;display:flex;flex-direction:column;gap:18px;max-width:1100px")}>
        <div style={css("border:1px solid #B9D2CD;background:#F2F7F5;border-radius:6px;padding:14px 16px;display:flex;flex-direction:column;gap:12px")}>
          <div style={css("display:flex;align-items:center;gap:12px")}>
            <div style={css("display:flex;flex-direction:column;gap:3px")}>
              <span style={css("font-weight:600;font-size:12.5px")}>Run the suite in this browser</span>
              <span style={css("font-size:11px;color:#5A6663;line-height:1.5")}>
                Same cases, through the engine you're using now (<b>{eng.label}</b>){eng.instant ? " — takes a few seconds, including a deliberate runaway query that must be stopped." : " — model answers are slower and vary by model; expect a few minutes."}
              </span>
            </div>
            <div style={css("flex:1")} />
            <button onClick={runLive} disabled={running} style={css(`padding:8px 16px;background:${running ? "#B9C0BD" : "#0F6E63"};color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:${running ? "not-allowed" : "pointer"};white-space:nowrap`)}>
              {running ? `Running… ${progress.done}/${progress.total}` : live ? "Run again" : "Run evals now"}
            </button>
          </div>
          {live && (
            <>
              <div style={css(`${mono};font-size:11px;font-weight:600;color:${live.passed ? "#0A4F47" : "#A33025"}`)}>
                {live.passedCases}/{live.cases.length} cases passed · {live.passed ? "every category meets its target" : "some categories are below target"} · {live.engine} · {(live.ms / 1000).toFixed(1)} s
              </div>
              <Scorecard categories={live.categories} cases={live.cases} />
            </>
          )}
        </div>

        <div style={css("display:flex;flex-direction:column;gap:8px")}>
          <div style={css("display:flex;align-items:baseline;gap:10px")}>
            <span style={css("font-weight:600;font-size:12.5px")}>Published with this build</span>
            {pub && <span style={css(`${mono};font-size:10px;color:#71807B`)}>commit {pub.commit} · {pub.engine} · {new Date(pub.generatedAt).toLocaleString()} · {pub.runtimeMs} ms</span>}
          </div>
          {pub === undefined && <div style={css("font-size:11.5px;color:#71807B")}>Loading…</div>}
          {pub === null && <div style={css("font-size:11.5px;color:#71807B")}>No published results found. They are generated by <code>npm run evals</code>, which runs before every build.</div>}
          {pub && (
            <>
              <div style={css("font-size:11px;color:#5A6663;line-height:1.6;max-width:820px")}>
                The build runs this suite headless and <b>fails — so nothing deploys — if any category drops below its target</b>. The engine-level read-only check runs only in the build (it has to bypass the guard);
                the runaway-query test runs only in the browser. Click a category to see every case.
              </div>
              <Scorecard categories={pub.categories} cases={pub.cases} />
              {pub.cases.some((c) => !c.pass) && (
                <div style={css("font-size:11.5px;color:#A33025")}>{pub.cases.filter((c) => !c.pass).length} failing case(s) are listed under their categories above — published, not hidden.</div>
              )}
            </>
          )}
        </div>

        <div style={css("font-size:11px;color:#71807B;line-height:1.6;max-width:820px;border-top:1px solid #E6E9E7;padding-top:12px")}>
          Honest limits: the retriever was tuned against these cases, so they are regression tests rather than a blind benchmark; and instant-mode scores say nothing about
          how a language model phrases answers — run the suite with a model loaded to measure that. The corpus and database are small and synthetic.
        </div>
      </div>
    </div>
  );
}
