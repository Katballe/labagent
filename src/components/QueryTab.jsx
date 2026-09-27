import React, { useState } from "react";
import { css } from "../lib/css.js";
import { useApp } from "../state/store.jsx";
import { QUERIES } from "../data/dataset.js";
import { runDataQuery, onCloud } from "../ai/labagent.js";
import { cloud } from "../ai/cloud.js";
import { runSelect, validateSelect, QUERY_TIMEOUT_MS, ROW_LIMIT, NOW } from "../ai/db.js";

const mono = "font-family:'IBM Plex Mono',monospace";
const STRONG = ["OOS", "EXPIRED", "PASS", "IN CAL", "CURRENT", "LAPSED", "OVERDUE", "DUE SOON"];

function cellColor(v) {
  const s = String(v);
  if (s === "OOS" || s === "EXPIRED" || s === "LAPSED" || s === "OVERDUE") return "#A33025";
  if (s === "PASS" || s === "IN CAL" || s === "CURRENT") return "#1E6E43";
  if (s === "DUE SOON") return "#6E5410";
  return "#1C2422";
}

// Raw SQL the visitor can try against the guard — including ones it must stop.
const SQL_TRIES = [
  { label: "a normal read", sql: "SELECT instrument_id, cal_due, cal_status FROM instruments ORDER BY cal_due" },
  { label: "try to delete", sql: "DELETE FROM results WHERE oos_flag = 1" },
  { label: "sneak a second statement", sql: "SELECT * FROM results; DROP TABLE results" },
  { label: "turn off read-only", sql: "PRAGMA query_only = OFF" },
  { label: "runaway query", sql: "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n) SELECT COUNT(*) FROM n" },
];

export default function QueryTab() {
  const { addAudit, logResult, engine: eng, reviewer } = useApp();
  const [mode, setMode] = useState("ask"); // ask | sql
  const [qInput, setQInput] = useState("");
  const [sqlInput, setSqlInput] = useState(SQL_TRIES[0].sql);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState(null);
  const [audId, setAudId] = useState("");

  async function ask(text) {
    const q = (text ?? qInput).trim();
    if (!q || thinking) return;
    setThinking(true);
    setResult(null);
    try {
      const res = await runDataQuery({ question: q, reviewer });
      const outcome = res.ok ? `${res.rows.length} row(s), read-only${res.validated ? "" : ", UNVALIDATED query"}` : res.refused ? "declined — asks to change data" : res.rejected ? "REJECTED by read-only guard" : res.error ? "error / stopped" : "no query generated";
      setAudId(await logResult(res, "T2", `Query: "${q.slice(0, 56)}" — ${outcome}`,
        JSON.stringify({ question: q, source: res.source, validated: res.validated, template: res.template || null, sql: res.sql, rows: res.ok ? res.rows.length : 0, note: res.note })));
      setResult(res);
    } catch (e) {
      setResult({ ok: false, sql: "", cols: [], rows: [], note: "Engine error: " + e.message, error: true });
    } finally {
      setThinking(false);
    }
  }

  async function runSql(text) {
    const sql = (text ?? sqlInput).trim();
    if (!sql || thinking) return;
    setThinking(true);
    setResult(null);
    if (onCloud()) {
      try {
        const res = await cloud.sql({ sql, reviewer });
        setAudId(await logResult(res));
        setResult(res);
      } catch (e) {
        setResult({ ok: false, sql, cols: [], rows: [], note: "Agent error: " + e.message, error: true });
      }
      setThinking(false);
      return;
    }
    const v = validateSelect(sql);
    let res;
    if (!v.ok) {
      res = { ok: false, sql, how: "typed by you", cols: [], rows: [], note: `Rejected by the read-only guard: ${v.reason}. Nothing executed.`, rejected: true };
    } else {
      try {
        const r = await runSelect(v.sql);
        res = { ok: true, sql: v.sql, how: "typed by you", cols: r.cols, rows: r.rows, note: `${r.total} row${r.total === 1 ? "" : "s"}${r.truncated ? ` (first ${r.rows.length} shown)` : ""} · read-only · executed against synthetic SQLite` };
      } catch (e) {
        res = { ok: false, sql: v.sql, how: "typed by you", cols: [], rows: [], note: e.timeout ? e.message : `SQL error: ${e.message}. Nothing written (read-only).`, error: true };
      }
    }
    const outcome = res.ok ? `${res.rows.length} row(s), read-only` : res.rejected ? "REJECTED by read-only guard" : "error / stopped";
    setAudId(await addAudit("T2", `Raw SQL by operator — ${outcome}`, `SQL:\n${sql}\n\n${res.note}`, { model: "—" }));
    setResult(res);
    setThinking(false);
  }

  const tabBtn = (key, label) => (
    <button onClick={() => { setMode(key); setResult(null); }} style={css(`padding:5px 12px;font-size:11.5px;font-weight:600;border:1px solid ${mode === key ? "#0F6E63" : "#C6CCC9"};background:${mode === key ? "#0F6E63" : "#fff"};color:${mode === key ? "#fff" : "#3A4744"};cursor:pointer;border-radius:${key === "ask" ? "4px 0 0 4px" : "0 4px 4px 0"}`)}>{label}</button>
  );

  return (
    <div style={css("flex:1;display:flex;flex-direction:column;min-width:0;background:#F7F8F7")}>
      <div style={css("flex:none;display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #D9DDDB;background:#EFF1F0")}>
        <span style={css("font-weight:600;font-size:13px")}>Structured data query</span>
        <span style={css("font-size:11px;color:#5A6663")}>Question → read-only SQL, shown verbatim and run for real against an in-browser SQLite database.</span>
        <div style={css("flex:1")} />
        <span title="The synthetic data set is frozen at this date; 'last 30 days', 'this week' and 'due soon' count from it" style={css(`${mono};font-size:10px;padding:3px 8px;background:#F7F8F7;border:1px solid #C6CCC9;border-radius:3px;color:#5A6663`)}>DATA AS OF {NOW}</span>
        <span style={css(`${mono};font-size:10px;padding:3px 8px;background:#E4EEEC;border:1px solid #B9D2CD;border-radius:3px;color:#0A4F47`)}>SELECT-ONLY · NO WRITES · {QUERY_TIMEOUT_MS / 1000} s LIMIT</span>
      </div>

      <div style={css("flex:none;padding:14px 18px;display:flex;flex-direction:column;gap:9px;border-bottom:1px solid #E6E9E7")}>
        <div style={css("display:flex;align-items:center;gap:10px")}>
          <div style={css("display:flex")}>{tabBtn("ask", "Ask in English")}{tabBtn("sql", "Write SQL yourself")}</div>
          <span style={css("font-size:11px;color:#71807B")}>
            {mode === "ask"
              ? (eng.instant || (eng.cloud && !eng.modelId) ? "Your question is matched to a validated query template." : "Validated templates first; if none fits, the AI drafts a query that is labelled unvalidated.")
              : `Try to break it: anything that isn't a single read-only query is refused${eng.cloud ? " (the agent also refuses recursive queries)" : ""}.`}
          </span>
        </div>
        {mode === "ask" ? (
          <>
            <div style={css("display:flex;gap:8px")}>
              <input value={qInput} onChange={(e) => setQInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="e.g. Show me all out-of-spec results for batch B-2291 in the last 30 days" style={css("flex:1;font-size:13px;padding:10px 12px;border:1px solid #B9C0BD;border-radius:4px;background:#fff;font-family:'IBM Plex Sans',sans-serif")} />
              <button onClick={() => ask()} disabled={thinking} style={css(`flex:none;padding:10px 20px;background:${thinking ? "#B9C0BD" : "#0F6E63"};color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:${thinking ? "not-allowed" : "pointer"}`)}>Run</button>
            </div>
            <div style={css("display:flex;flex-wrap:wrap;gap:6px")}>
              {QUERIES.map((x, i) => (
                <button key={i} onClick={() => { setQInput(x.q); ask(x.q); }} style={css("font-size:11px;padding:5px 10px;background:#F7F8F7;border:1px solid #C6CCC9;border-radius:14px;cursor:pointer;color:#3A4744")}>{x.q}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={css("display:flex;gap:8px;align-items:stretch")}>
              <textarea value={sqlInput} onChange={(e) => setSqlInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && runSql()} spellCheck={false} aria-label="SQL query"
                style={css(`flex:1;height:64px;resize:vertical;font-size:12px;padding:9px 11px;border:1px solid #B9C0BD;border-radius:4px;background:#1C2422;color:#C9E4DE;${mono}`)} />
              <button onClick={() => runSql()} disabled={thinking} style={css(`flex:none;padding:10px 20px;background:${thinking ? "#B9C0BD" : "#0F6E63"};color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:${thinking ? "not-allowed" : "pointer"}`)}>Run</button>
            </div>
            <div style={css("display:flex;flex-wrap:wrap;gap:6px;align-items:center")}>
              <span style={css("font-size:10.5px;color:#71807B")}>Try:</span>
              {SQL_TRIES.map((x, i) => (
                <button key={i} onClick={() => { setSqlInput(x.sql); runSql(x.sql); }} style={css("font-size:11px;padding:5px 10px;background:#F7F8F7;border:1px solid #C6CCC9;border-radius:14px;cursor:pointer;color:#3A4744")}>{x.label}</button>
              ))}
              <span style={css("font-size:10.5px;color:#9AA6A2")}>Ctrl+Enter runs</span>
            </div>
          </>
        )}
      </div>

      <div style={css("flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:14px")}>
        {thinking && <div style={css(`font-size:11.5px;color:#5A6663;animation:la-pulse 1.2s infinite;${mono}`)}>{mode === "ask" ? "generating read-only query · validating · executing…" : "validating · executing…"}</div>}

        {result && (
          <div style={css("display:flex;flex-direction:column;gap:12px;max-width:1100px")}>
            <div style={css("display:flex;flex-direction:column;gap:6px")}>
              <div style={css("display:flex;align-items:center;gap:8px")}>
                <span style={css(`${mono};font-size:10px;font-weight:600;color:#5A6663;letter-spacing:.05em`)}>SQL — LOGGED VERBATIM · {audId}{result.how ? ` · ${result.how}` : ""}</span>
                {result.source === "template" && <span title="A fixed query template covered by the test suite" style={css(`${mono};font-size:9px;font-weight:600;padding:2px 7px;border-radius:3px;background:#DCEFE2;color:#1E6E43`)}>VALIDATED TEMPLATE</span>}
                {result.source === "model" && <span title="Written by the AI model: informational only, not validated (Annex 22 — non-critical use)" style={css(`${mono};font-size:9px;font-weight:600;padding:2px 7px;border-radius:3px;background:#F8F0DE;color:#6E5410;border:1px solid #E0CD9E`)}>UNVALIDATED · AI-WRITTEN</span>}
              </div>
              <pre style={css(`margin:0;background:#1C2422;color:#C9E4DE;${mono};font-size:11.5px;line-height:1.6;padding:13px 15px;border-radius:5px;overflow-x:auto`)}>{result.sql}</pre>
            </div>

            {result.ok && result.cols.length > 0 && (
              <div style={css("border:1px solid #C6CCC9;border-radius:5px;overflow-x:auto")}>
                <table style={css("border-collapse:collapse;width:100%;background:#fff")}>
                  <thead>
                    <tr style={css("background:#E6E9E7")}>
                      {result.cols.map((c, i) => (
                        <th key={i} style={css(`text-align:left;padding:7px 10px;${mono};font-size:10px;font-weight:600;color:#3A4744;letter-spacing:.04em;border-bottom:1px solid #C6CCC9;white-space:nowrap`)}>{String(c).toUpperCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, ri) => (
                      <tr key={ri} style={css("border-bottom:1px solid #E6E9E7")}>
                        {r.map((v, ci) => (
                          <td key={ci} style={{ ...css(`padding:7px 10px;${mono};font-size:11px;white-space:nowrap`), color: cellColor(v), fontWeight: STRONG.includes(String(v)) ? 600 : 400 }}>{v === null ? "NULL" : String(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.ok && result.cols.length === 0 && (
              <div style={css(`font-size:12px;color:#71807B;${mono}`)}>Query executed — 0 rows returned.</div>
            )}

            <div style={{ ...css("font-size:11.5px;line-height:1.6;max-width:760px"), color: result.rejected || result.error ? "#A33025" : result.refused ? "#6E5410" : "#5A6663", fontFamily: result.ok ? "'IBM Plex Mono',monospace" : "inherit" }}>{result.note}</div>
          </div>
        )}

        {!result && !thinking && (
          <div style={css("font-size:12px;color:#71807B;line-height:1.7;max-width:640px")}>
            Your question becomes one SQL query, shown verbatim, checked by a guard that only lets a single read-only SELECT through, and executed for real against a synthetic
            SQLite database (samples · results · instruments · calibrations · analysts · qualifications). The query runs in a separate worker with a {QUERY_TIMEOUT_MS / 1000}-second limit,
            and SQLite itself is locked read-only — so even a query that slipped past the guard couldn't change anything. Results show at most {ROW_LIMIT} rows.
          </div>
        )}
      </div>
    </div>
  );
}
