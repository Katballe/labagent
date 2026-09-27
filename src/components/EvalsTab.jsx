import React, { useEffect, useState } from "react";
import { css } from "../lib/css.js";
import { useApp } from "../state/store.jsx";
import { runSuite } from "../evals/runner.js";
import { runSelect } from "../ai/db.js";
import { engine } from "../ai/engine.js";

// The latest acceptance-test run against the frozen held-out set (scripts/validate.mjs).
const VALIDATION = Object.values(import.meta.glob("../../validation/latest.json", { eager: true, import: "default" }))[0] || null;

function AcceptanceRun({ run }) {
  const m = run.metrics;
  const cm = m.t1.confusion;
  const cell = "padding:6px 10px;border:1px solid #D9DDDB;font-family:'IBM Plex Mono',monospace;font-size:11px;text-align:center";
  return (
    <div style={css("display:flex;flex-direction:column;gap:10px;border:1px solid #C6CCC9;border-radius:5px;padding:12px 14px;background:#fff")}>
      <div style={css("display:flex;align-items:baseline;gap:10px;flex-wrap:wrap")}>
        <span style={css("font-weight:600;font-size:12.5px")}>{run.runId}</span>
        <span style={css(`font-family:'IBM Plex Mono',monospace;font-size:10px;color:#71807B`)}>test set {run.testSet.id} ({run.testSet.sha256.slice(0, 12)}…) · commit {run.commit} · {new Date(run.executedAt).toLocaleString()} · {run.system.engine}</span>
        <span style={{ ...css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;padding:2px 8px;border-radius:3px"), background: run.passed ? "#DCEFE2" : "#F4E3E1", color: run.passed ? "#1E6E43" : "#A33025" }}>{run.passed ? "ACCEPTANCE CRITERIA MET" : "ACCEPTANCE CRITERIA NOT MET"}</span>
        <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;padding:2px 8px;border-radius:3px;background:#F8F0DE;color:#6E5410")}>APPROVAL PENDING</span>
      </div>
      <div style={css("display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start")}>
        <table style={css("border-collapse:collapse")}>
          <thead><tr><th style={css(cell)}></th><th style={css(cell)}>answered</th><th style={css(cell)}>undecided</th></tr></thead>
          <tbody>
            <tr><th style={css(cell)}>answerable</th><td style={css(cell + ";color:#1E6E43")}>TP {cm.TP}</td><td style={css(cell)}>FN {cm.FN}</td></tr>
            <tr><th style={css(cell)}>not answerable</th><td style={css(cell + ";color:#A33025")}>FP {cm.FP}</td><td style={css(cell + ";color:#1E6E43")}>TN {cm.TN}</td></tr>
          </tbody>
        </table>
        <div style={css("font-family:'IBM Plex Mono',monospace;font-size:11px;line-height:1.8;color:#3A4744")}>
          T1 sensitivity {m.t1.sensitivity.value} <span style={css("color:#9AA6A2")}>(95% CI {m.t1.sensitivity.ci95.low}–{m.t1.sensitivity.ci95.high})</span><br />
          T1 specificity {m.t1.specificity.value} <span style={css("color:#9AA6A2")}>(95% CI {m.t1.specificity.ci95.low}–{m.t1.specificity.ci95.high})</span><br />
          T1 citation accuracy {m.t1.citationAccuracy.value} · precision {m.t1.precision} · F1 {m.t1.f1}<br />
          T2 exact match {m.t2.exactMatch} (n={m.t2.n}) · T3 accuracy {m.t3.accuracy} (n={m.t3.n})
        </div>
      </div>
      <div style={css("display:flex;flex-direction:column;gap:3px")}>
        {run.acceptance.map((a) => (
          <div key={a.id} style={css("display:flex;gap:8px;font-size:11px;align-items:baseline")}>
            <span style={{ ...css("font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;width:40px;flex:none"), color: a.pass ? "#1E6E43" : "#A33025" }}>{a.pass ? "PASS" : "FAIL"}</span>
            <span style={css("font-family:'IBM Plex Mono',monospace;font-size:10px;color:#5A6663;width:36px;flex:none")}>{a.id}</span>
            <span style={css("color:#1C2422")}>{a.criterion}</span>
            <span style={css("font-family:'IBM Plex Mono',monospace;font-size:10px;color:#71807B")}>— {a.value}</span>
          </div>
        ))}
      </div>
      {!!run.failures.length && (
        <details>
          <summary style={css("cursor:pointer;font-size:11px;color:#A33025")}>{run.failures.length} failing case(s) — recorded as deviations, not tuned away</summary>
          <div style={css("display:flex;flex-direction:column;gap:3px;margin-top:6px")}>
            {run.failures.map((x, i) => (
              <div key={i} style={css("font-size:11px;color:#3A4744")}><span style={css("font-family:'IBM Plex Mono',monospace;font-size:10px;color:#71807B")}>[{x.cat}{x.group ? ` · ${x.group}` : ""}]</span> {x.name} <span style={css("color:#71807B")}>— {x.detail}</span></div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

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
    // A local model is measured directly; with the cloud agent the browser runs
    // the deterministic pipeline (the agent runs its own self-check daily).
    const localModel = !eng.instant && !eng.cloud;
    const label = localModel ? eng.label : "deterministic pipeline in this browser";
    const res = await runSuite({
      where: "browser",
      exec: (sql) => runSelect(sql),
      runaway: (sql) => runSelect(sql),
      llm: localModel ? { label: eng.label, chat: (o) => engine.chat(o) } : null,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    const ms = Math.round(performance.now() - t0);
    const passedCases = res.cases.filter((c) => c.pass).length;
    setLive({ ...res, ms, engine: label, passedCases });
    setProgress(null);
    await addAudit("EVAL", `Eval suite run in browser · ${label} · ${passedCases}/${res.cases.length} cases passed · ${res.passed ? "all targets met" : "BELOW TARGET"}`,
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
                {eng.cloud
                  ? <>Runs the deterministic pipeline here in your browser — the agent runs the same suite on itself daily (see Compliance). Takes a few seconds, including a deliberate runaway query that must be stopped.</>
                  : <>Same cases, through the engine you're using now (<b>{eng.label}</b>){eng.instant ? " — takes a few seconds, including a deliberate runaway query that must be stopped." : " — model answers are slower and vary by model; expect a few minutes."}</>}
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
            <span style={css("font-weight:600;font-size:12.5px")}>Acceptance test — frozen held-out set</span>
            <span style={css("font-size:11px;color:#5A6663")}>EU GMP Annex 22 §4–7 (draft): criteria fixed before the run, test data never used for tuning. Plan TP-001 · report in docs/validation.</span>
          </div>
          {VALIDATION ? <AcceptanceRun run={VALIDATION} /> : <div style={css("font-size:11.5px;color:#71807B")}>No acceptance run recorded yet (npm run validate).</div>}
        </div>

        <div style={css("display:flex;flex-direction:column;gap:8px")}>
          <div style={css("display:flex;align-items:baseline;gap:10px")}>
            <span style={css("font-weight:600;font-size:12.5px")}>Development suite — published with this build</span>
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
          Honest limits: the development suite is what the retriever was tuned against, so it is a regression test; the held-out set is the acceptance test, but it is
          small and was written by an AI assistant, so it needs SME verification and a second, independently written set before any release decision (see the
          validation report). Deterministic scores say nothing about how a language model words answers — that is measured by the agent's self-check and by human review records.
        </div>
      </div>
    </div>
  );
}
