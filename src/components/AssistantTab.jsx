import React, { useState, useRef, useEffect, useMemo } from "react";
import { css } from "../lib/css.js";
import { useApp } from "../state/store.jsx";
import { CORPUS, SUGGESTED } from "../data/dataset.js";
import { answerQuestion } from "../ai/labagent.js";

const INTRO =
  "LabAgent is ready. Ask about the SOPs: every answer cites the controlled passage it comes from, and when the corpus doesn't hold the answer the outcome is “undecided” rather than a guess. " +
  "With the Cloudflare agent (or a local model) the wording is AI-written and marked as such — check it against the verbatim source on the right and record your verdict. " +
  "In instant mode the answer is the verbatim source itself. Either way this is a look-up aid: the controlled SOP governs.";

const REFUSAL_BADGE = {
  "unknown-subject": "REFUSED — NOT IN CORPUS",
  "low-confidence": "REFUSED — BELOW THRESHOLD",
  "no-passage": "REFUSED — NO PASSAGE ANSWERS IT",
  "model-insufficient": "DECLINED BY MODEL",
  "citation-check": "WITHHELD — FAILED CITATION CHECK",
};
const mono = "font-family:'IBM Plex Mono',monospace";

// Entity list powering the id autocomplete (S-88…, INS-…, MV-…).
const EXTRA = [
  ["B-2291", "Batch — Phase III clinical, 2 OOS results"],
  ["B-2290", "Batch — Phase III clinical, no OOS"],
  ["S-8841", "Sample — assay OOS 78.1 %LC on INS-114"],
  ["S-8839", "Sample — assay OOS 93.6 %LC on INS-114"],
  ["S-8840", "Sample — assay PASS 97.4 %LC"],
  ["MV-0412", "Method — Assay & Dissolution (HPLC)"],
  ["MV-0388", "Method — Related Substances (HPLC)"],
  ["MV-0407", "Method — Water Content (Karl Fischer)"],
  ["INS-114", "HPLC — calibration expired 2026-07-05"],
  ["INS-113", "HPLC — in calibration"],
  ["INS-112", "HPLC — in calibration"],
  ["A-207", "Analyst — qualified MV-0412"],
];

function useEntities() {
  return useMemo(() => {
    const list = EXTRA.map(([id, label]) => ({ id, label }));
    CORPUS.filter((c) => c.status !== "SUPERSEDED").forEach((c) => list.push({ id: c.id, label: c.title }));
    return list;
  }, []);
}

let msgSeq = 0;
const rid = () => `m${++msgSeq}`;

export default function AssistantTab() {
  const { threshold, setThreshold, logResult, recordReview, engine: eng, reviewer } = useApp();
  const entities = useEntities();
  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const [messages, setMessages] = useState([
    { id: rid(), role: "assistant", text: INTRO, cites: [] },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const suggestions = useMemo(() => {
    const m = input.match(/(\S+)$/);
    if (!m || m[1].length < 2) return [];
    const t = m[1].toLowerCase();
    const pre = [], sub = [];
    for (const e of entities) {
      const id = e.id.toLowerCase();
      if (id.startsWith(t)) pre.push(e);
      else if (id.includes(t) || e.label.toLowerCase().includes(t)) sub.push(e);
    }
    return [...pre, ...sub].slice(0, 6);
  }, [input, entities]);

  const lastCites = [...messages].reverse().find((m) => m.role === "assistant" && !m.streaming)?.cites || [];

  async function ask(text) {
    if (!text.trim() || thinking) return;
    const q = text.trim();
    setInput("");
    setMessages((m) => [...m, { id: rid(), role: "user", text: q, who: reviewer }]);
    const aid = rid();
    setMessages((m) => [...m, { id: aid, role: "assistant", text: "", streaming: true, cites: [] }]);
    setThinking(true);
    try {
      const res = await answerQuestion({
        question: q,
        threshold,
        reviewer,
        onToken: (d) => setMessages((m) => m.map((x) => (x.id === aid ? { ...x, text: x.text + d } : x))),
      });
      const audId = await logResult(
        res,
        "T1",
        res.refused
          ? `QA: "${q.slice(0, 56)}" — UNDECIDED (${res.reason})`
          : `QA: "${q.slice(0, 56)}" — answered, ${res.cites.length} citation(s): ${res.cites.map((c) => c.doc).join(", ")}${res.conflict ? " · conflict surfaced" : ""}`,
        JSON.stringify({
          question: q, decision: res.decision, reason: res.reason || null, answer: res.text, withheld: res.withheld || null,
          confidence: +res.confidence.toFixed(3), threshold, retrieved: res.retrieved,
          cited: res.cites.map(({ doc, sec, score, matched }) => ({ doc, sec, score: +score.toFixed(3), matched })), model: res.model || null,
        })
      );
      setMessages((m) =>
        m.map((x) =>
          x.id === aid
            ? {
                ...x, streaming: false, text: res.text, refusal: res.refused, reason: res.reason, withheld: res.withheld, conflict: res.conflict,
                cites: res.cites, generative: res.mode === "generative" && !res.refused, audId, note: res.note,
                meta: `${res.decision || (res.refused ? "UNDECIDED" : "ANSWERED")} · retrieval confidence ${res.confidence.toFixed(2)} (threshold ${threshold.toFixed(2)}) · ${res.engine || eng.label} · ${audId}`,
              }
            : x
        )
      );
    } catch (e) {
      setMessages((m) => m.map((x) => (x.id === aid ? { ...x, streaming: false, text: "Engine error: " + e.message, refusal: true } : x)));
    } finally {
      setThinking(false);
    }
  }

  async function review(msg, verdict) {
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, reviewing: true } : x)));
    try {
      const rev = await recordReview(msg.audId, verdict, "T1 answer");
      setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, reviewing: false, verdict, reviewId: rev } : x)));
    } catch (e) {
      setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, reviewing: false, reviewError: e.message } : x)));
    }
  }

  function onKey(e) {
    if (e.key === "Tab" && suggestions.length) {
      e.preventDefault();
      setInput(input.replace(/\S+$/, suggestions[0].id) + " ");
      return;
    }
    if (e.key === "Enter") ask(input);
  }

  const corpus = CORPUS.map((c) => ({
    ...c,
    stBg: c.status === "SUPERSEDED" ? "#F4E3E1" : c.status === "EXECUTED" ? "#E6E9E7" : "#DCEFE2",
    stFg: c.status === "SUPERSEDED" ? "#A33025" : c.status === "EXECUTED" ? "#5A6663" : "#1E6E43",
  }));

  return (
    <div style={css("flex:1;display:flex;min-width:0")}>
      <div style={css("flex:1;display:flex;flex-direction:column;min-width:0;background:#F7F8F7")}>
        <div style={css("flex:none;display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #D9DDDB;background:#EFF1F0")}>
          <span style={css("font-weight:600;font-size:13px")}>Document QA</span>
          <span style={css("font-size:11px;color:#5A6663")}>{eng.instant ? "Instant mode: verbatim quotes with citations — or a refusal." : `${eng.label} answers from retrieved sources; citations are checked in code.`}</span>
          <div style={css("flex:1")} />
          <span style={css("font-family:'IBM Plex Mono',monospace;font-size:10px;color:#5A6663;display:flex;align-items:center;gap:6px")}>
            refusal threshold
            <input type="range" min="0.3" max="0.9" step="0.05" value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value))} style={{ width: "90px" }} />
            <span style={css("color:#1C2422;font-weight:600")}>{threshold.toFixed(2)}</span>
          </span>
        </div>

        <div ref={chatRef} style={css("flex:1;overflow-y:auto;min-height:0")}>
          {messages.map((m) => {
            const user = m.role === "user";
            return (
              <div key={m.id} style={css(`display:flex;flex-direction:column;gap:7px;padding:14px 18px;background:${user ? "#EFF1F0" : "#FFFFFF"};border-bottom:1px solid #E6E9E7`)}>
                <div style={css("display:flex;align-items:center;gap:8px")}>
                  <span style={css(`font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.06em;color:${user ? "#71807B" : "#0A4F47"}`)}>{user ? `YOU · ${(m.who || reviewer).toUpperCase()}` : "LABAGENT"}</span>
                  {m.refusal && <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:600;padding:2px 7px;border-radius:3px;background:#F4E3E1;color:#A33025;border:1px solid #DCB4AF")}>{REFUSAL_BADGE[m.reason] || "REFUSED"}</span>}
                </div>
                {m.conflict && <div style={css("font-size:11.5px;line-height:1.55;padding:8px 10px;background:#F8F0DE;border:1px solid #E0CD9E;border-radius:4px;color:#6E5410")}>⚠ {m.conflict}</div>}
                <div style={css("font-size:13px;line-height:1.6;max-width:720px;white-space:pre-wrap")}>{m.text}{m.streaming && <span style={css("animation:la-pulse 1.2s infinite")}>▍</span>}</div>
                {m.withheld && (
                  <details style={css("font-size:11.5px;color:#5A6663;max-width:720px")}>
                    <summary style={css("cursor:pointer")}>Show the withheld model output (not relied upon)</summary>
                    <div style={css("margin-top:6px;padding:8px 10px;border-left:2px solid #DCB4AF;white-space:pre-wrap;color:#6E5A58")}>{m.withheld}</div>
                  </details>
                )}
                {!!m.cites?.length && (
                  <div style={css("display:flex;flex-wrap:wrap;gap:6px")}>
                    {m.cites.map((c, i) => (
                      <span key={i} style={css("font-family:'IBM Plex Mono',monospace;font-size:10px;padding:3px 8px;background:#E4EEEC;border:1px solid #B9D2CD;border-radius:3px;color:#0A4F47;white-space:nowrap")}>{c.doc} {c.sec} · {c.score.toFixed(2)}</span>
                    ))}
                  </div>
                )}
                {m.generative && (
                  <div style={css("font-size:10.5px;color:#6E5410;background:#F8F0DE;border:1px solid #E0CD9E;border-radius:3px;padding:4px 8px;max-width:720px")}>
                    AI-generated wording (non-critical, human in the loop). Check it against the verbatim source passages on the right; the controlled SOP governs.
                  </div>
                )}
                {m.note && <div style={css("font-size:10.5px;color:#5A6663;max-width:720px")}>{m.note}</div>}
                {m.meta && <div style={css(`${mono};font-size:9.5px;color:#9AA6A2`)}>{m.meta}</div>}
                {!m.refusal && m.audId && !m.streaming && (
                  <div style={css("display:flex;align-items:center;gap:6px;font-size:10.5px;color:#5A6663")}>
                    {m.verdict ? (
                      <span style={css(`${mono};font-size:9.5px;color:${m.verdict === "confirmed" ? "#1E6E43" : "#A33025"}`)}>
                        your review: {m.verdict === "confirmed" ? "✓ matches the source" : "✗ incorrect"} · {m.reviewId}
                      </span>
                    ) : (
                      <>
                        <span>Your review:</span>
                        <button disabled={m.reviewing} onClick={() => review(m, "confirmed")} style={css("font-size:10.5px;padding:2px 8px;border:1px solid #A8D4B6;background:#F0F7F2;color:#1E6E43;border-radius:3px;cursor:pointer")}>✓ Matches the source</button>
                        <button disabled={m.reviewing} onClick={() => review(m, "incorrect")} style={css("font-size:10.5px;padding:2px 8px;border:1px solid #DCB4AF;background:#FBF3F2;color:#A33025;border-radius:3px;cursor:pointer")}>✗ Incorrect</button>
                        {m.reviewError && <span style={css("color:#A33025")}>{m.reviewError}</span>}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {thinking && !messages[messages.length - 1]?.streaming && (
            <div style={css("display:flex;align-items:center;gap:10px;padding:16px 18px")}>
              <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.06em;color:#0F6E63")}>LABAGENT</span>
              <span style={css("font-size:11.5px;color:#5A6663;animation:la-pulse 1.2s infinite")}>retrieving from corpus…</span>
            </div>
          )}
        </div>

        <div style={css("flex:none;border-top:1px solid #D9DDDB;background:#EFF1F0;padding:10px 18px 14px;display:flex;flex-direction:column;gap:9px")}>
          <div style={css("display:flex;flex-wrap:wrap;gap:6px")}>
            {SUGGESTED.slice(0, 5).map((s, i) => (
              <button key={i} onClick={() => ask(s)} style={css("font-size:11px;padding:5px 10px;background:#F7F8F7;border:1px solid #C6CCC9;border-radius:14px;cursor:pointer;color:#3A4744")}>{s}</button>
            ))}
          </div>
          <div style={css("display:flex;gap:8px;position:relative")}>
            {suggestions.length > 0 && (
              <div style={css("position:absolute;bottom:100%;margin-bottom:6px;left:0;width:520px;max-width:100%;background:#fff;border:1px solid #B9C0BD;border-radius:5px;box-shadow:0 8px 24px rgba(28,36,34,.18);overflow:hidden;z-index:20;display:flex;flex-direction:column")}>
                {suggestions.map((sg, i) => (
                  <button key={i} onClick={() => { setInput(input.replace(/\S+$/, sg.id) + " "); inputRef.current?.focus(); }} style={css("display:flex;align-items:center;gap:10px;width:100%;padding:7px 11px;background:#fff;border:none;border-bottom:1px solid #EFF1F0;cursor:pointer;text-align:left")}>
                    <span style={css("font-family:'IBM Plex Mono',monospace;font-size:11.5px;font-weight:600;color:#1C2422;flex:none;white-space:nowrap")}>{sg.id}</span>
                    <span style={css("font-size:11px;color:#71807B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{sg.label}</span>
                  </button>
                ))}
                <div style={css("padding:5px 11px;background:#EFF1F0;font-family:'IBM Plex Mono',monospace;font-size:9px;color:#71807B")}>TAB completes first match · click to insert</div>
              </div>
            )}
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder="Ask about SOPs, methods, calibration, OOS handling… (try typing S-88, INS or MV-)" style={css("flex:1;font-size:13px;padding:10px 12px;border:1px solid #B9C0BD;border-radius:4px;background:#fff;font-family:'IBM Plex Sans',sans-serif")} />
            <button onClick={() => ask(input)} disabled={thinking} style={css(`flex:none;padding:10px 20px;background:${thinking ? "#B9C0BD" : "#0F6E63"};color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:${thinking ? "not-allowed" : "pointer"}`)}>Ask</button>
          </div>
          <div style={css("font-size:10.5px;color:#71807B")}>Every question, answer and review is appended to the hash-chained audit trail{eng.cloud ? " kept by the Cloudflare agent" : ""}, with the engine, prompt version and configuration fingerprint. Questions about things the corpus never mentions, or below the retrieval threshold, end “undecided”.</div>
        </div>
      </div>

      <div style={css("width:336px;flex:none;border-left:1px solid #C6CCC9;background:#EFF1F0;display:flex;flex-direction:column;min-height:0")}>
        <div style={css("flex:none;padding:10px 14px;border-bottom:1px solid #D9DDDB;font-weight:600;font-size:12px")}>Cited evidence</div>
        <div style={css("flex:1;overflow-y:auto;padding:10px 14px;display:flex;flex-direction:column;gap:8px")}>
          {lastCites.length === 0 && <div style={css("font-size:11.5px;color:#71807B;line-height:1.6;padding:6px 2px")}>The source passages behind the latest answer appear here in full, with their relevance scores — always visible, never a tooltip.</div>}
          {lastCites.map((c, i) => (
            <div key={i} style={css("background:#F7F8F7;border:1px solid #D9DDDB;border-radius:4px;padding:9px 11px;display:flex;flex-direction:column;gap:5px")}>
              <div style={css("display:flex;align-items:center;gap:6px")}>
                <span style={css("font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:600;color:#0A4F47")}>{c.doc}</span>
                {c.status === "SUPERSEDED" && <span title="Mentioned for comparison only — the effective version governs" style={css("font-family:'IBM Plex Mono',monospace;font-size:8.5px;font-weight:600;padding:1px 5px;border-radius:2px;background:#F4E3E1;color:#A33025")}>SUPERSEDED — NOT RELIED ON</span>}
                <span style={css("flex:1")} />
                <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#71807B")}>rel {c.score.toFixed(2)}</span>
              </div>
              <div style={css("font-size:10.5px;color:#5A6663")}>{c.sec}</div>
              <div style={css("font-size:11px;line-height:1.55;color:#3A4744;border-left:2px solid #B9D2CD;padding-left:8px")}>{c.excerpt}</div>
              {!!c.matched?.length && (
                <div style={css("display:flex;flex-wrap:wrap;gap:4px;align-items:center")} title="Why this passage: the words of your question it matched (Annex 22 §8)">
                  <span style={css(`${mono};font-size:9px;color:#9AA6A2`)}>matched</span>
                  {c.matched.map((w) => <span key={w} style={css(`${mono};font-size:9px;padding:1px 5px;background:#E4EEEC;color:#0A4F47;border-radius:2px`)}>{w}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={css("flex:none;border-top:1px solid #D9DDDB;padding:10px 14px;display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto")}>
          <div style={css("font-weight:600;font-size:11px;color:#5A6663")}>CORPUS · {CORPUS.length} DOCUMENTS</div>
          {corpus.map((d) => (
            <div key={d.id} style={css("display:flex;align-items:center;gap:7px;font-size:10.5px")}>
              <span style={css("font-family:'IBM Plex Mono',monospace;color:#3A4744;flex:none;white-space:nowrap")}>{d.id}</span>
              <span style={css("color:#71807B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1")}>{d.title}</span>
              <span style={{ ...css("font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:600;padding:1px 5px;border-radius:2px;flex:none"), background: d.stBg, color: d.stFg }}>{d.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
