import React, { useState } from "react";
import { css } from "../lib/css.js";
import { useApp } from "../state/store.jsx";
import { QUERIES } from "../data/dataset.js";
import { runDataQuery } from "../ai/labagent.js";

function cellColor(v) {
  const s = String(v);
  if (s === "OOS" || s === "EXPIRED" || s === "1" || s === "LAPSED") return "#A33025";
  if (s === "PASS" || s === "IN CAL" || s === "CURRENT") return "#1E6E43";
  return "#1C2422";
}

export default function QueryTab() {
  const { addAudit } = useApp();
  const [qInput, setQInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState(null);
  const [audId, setAudId] = useState("");

  async function run(text) {
    const q = (text ?? qInput).trim();
    if (!q || thinking) return;
    setThinking(true);
    setResult(null);
    try {
      const res = await runDataQuery({ question: q });
      const id = await addAudit(
        "T2",
        res.ok
          ? `Query: "${q.slice(0, 56)}" — ${res.rows.length} rows, read-only`
          : `Query: "${q.slice(0, 56)}" — ${res.rejected ? "REJECTED by read-only guard" : "no rows / not translated"}`,
        `${q}|${res.sql}`
      );
      setAudId(id);
      setResult(res);
    } catch (e) {
      setResult({ ok: false, sql: "", cols: [], rows: [], note: "Engine error: " + e.message });
    } finally {
      setThinking(false);
    }
  }

  return (
    <div style={css("flex:1;display:flex;flex-direction:column;min-width:0;background:#F7F8F7")}>
      <div style={css("flex:none;display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #D9DDDB;background:#EFF1F0")}>
        <span style={css("font-weight:600;font-size:13px")}>Structured data query</span>
        <span style={css("font-size:11px;color:#5A6663")}>Natural language → read-only SQL, executed against a real in-browser SQLite. Query logged verbatim.</span>
        <div style={css("flex:1")} />
        <span style={css("font-family:'IBM Plex Mono',monospace;font-size:10px;padding:3px 8px;background:#E4EEEC;border:1px solid #B9D2CD;border-radius:3px;color:#0A4F47")}>SELECT-ONLY · NO WRITES</span>
      </div>

      <div style={css("flex:none;padding:14px 18px;display:flex;flex-direction:column;gap:9px;border-bottom:1px solid #E6E9E7")}>
        <div style={css("display:flex;gap:8px")}>
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="e.g. Show me all out-of-spec results for batch B-2291 in the last 30 days" style={css("flex:1;font-size:13px;padding:10px 12px;border:1px solid #B9C0BD;border-radius:4px;background:#fff;font-family:'IBM Plex Sans',sans-serif")} />
          <button onClick={() => run()} disabled={thinking} style={css(`flex:none;padding:10px 20px;background:${thinking ? "#B9C0BD" : "#0F6E63"};color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:${thinking ? "not-allowed" : "pointer"}`)}>Run</button>
        </div>
        <div style={css("display:flex;flex-wrap:wrap;gap:6px")}>
          {QUERIES.map((x, i) => (
            <button key={i} onClick={() => { setQInput(x.q); run(x.q); }} style={css("font-size:11px;padding:5px 10px;background:#F7F8F7;border:1px solid #C6CCC9;border-radius:14px;cursor:pointer;color:#3A4744")}>{x.q}</button>
          ))}
        </div>
      </div>

      <div style={css("flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:14px")}>
        {thinking && <div style={css("font-size:11.5px;color:#5A6663;animation:la-pulse 1.2s infinite;font-family:'IBM Plex Mono',monospace")}>generating read-only query · validating against schema allow-list…</div>}

        {result && (
          <div style={css("display:flex;flex-direction:column;gap:12px;max-width:1000px")}>
            <div style={css("display:flex;flex-direction:column;gap:6px")}>
              <div style={css("font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;color:#5A6663;letter-spacing:.05em")}>GENERATED SQL — LOGGED VERBATIM · {audId}</div>
              <pre style={css("margin:0;background:#1C2422;color:#C9E4DE;font-family:'IBM Plex Mono',monospace;font-size:11.5px;line-height:1.6;padding:13px 15px;border-radius:5px;overflow-x:auto")}>{result.sql}</pre>
            </div>

            {result.ok && result.cols.length > 0 && (
              <div style={css("border:1px solid #C6CCC9;border-radius:5px;overflow:hidden")}>
                <div style={css("display:flex;background:#E6E9E7;border-bottom:1px solid #C6CCC9")}>
                  {result.cols.map((c, i) => (
                    <div key={i} style={css("flex:1;padding:7px 10px;font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;color:#3A4744;letter-spacing:.04em")}>{String(c).toUpperCase()}</div>
                  ))}
                </div>
                {result.rows.map((r, ri) => (
                  <div key={ri} style={css("display:flex;border-bottom:1px solid #E6E9E7;background:#fff")}>
                    {r.map((v, ci) => (
                      <div key={ci} style={{ ...css("flex:1;padding:7px 10px;font-family:'IBM Plex Mono',monospace;font-size:11px"), color: cellColor(v), fontWeight: ["OOS", "EXPIRED", "PASS", "IN CAL", "CURRENT", "LAPSED"].includes(String(v)) ? 600 : 400 }}>{String(v)}</div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {result.ok && result.cols.length === 0 && (
              <div style={css("font-size:12px;color:#71807B;font-family:'IBM Plex Mono',monospace")}>Query executed — 0 rows returned.</div>
            )}

            <div style={{ ...css("font-family:'IBM Plex Mono',monospace;font-size:10px"), color: result.rejected || result.error ? "#A33025" : "#71807B" }}>{result.note}</div>
          </div>
        )}

        {!result && !thinking && (
          <div style={css("font-size:12px;color:#71807B;line-height:1.7;max-width:600px")}>
            The agent writes a SQL query from your question, shows it verbatim, validates it is SELECT-only against the schema allow-list, and executes it for real against a synthetic SQLite database (samples · results · instruments · calibrations · analysts · qualifications). It cannot INSERT, UPDATE or DELETE — the guard rejects anything that is not a single read query.
          </div>
        )}
      </div>
    </div>
  );
}
