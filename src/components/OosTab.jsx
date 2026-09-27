import React, { useState, useRef, useEffect } from "react";
import { css } from "../lib/css.js";
import { useApp } from "../state/store.jsx";
import { OOS_CASE, OOS_STEPS, OOS_DRAFT } from "../data/dataset.js";
import { stepSummary, triageAnswer } from "../ai/labagent.js";

const TRIAGE_SUGGESTED = [
  "Why is this classified as probable lab error?",
  "What exactly happened with INS-114's calibration?",
  "What happens after I approve?",
  "Is there a precedent for this?",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SOURCE_LABEL = { fixed: "fixed step text", model: "written by model", fallback: "fixed text (model output withheld)" };

let tSeq = 0;
const tid = () => `t${++tSeq}`;

export default function OosTab() {
  const { addAudit, reviewer, engine: eng } = useApp();
  const [phase, setPhase] = useState("idle"); // idle|running|gate|approved|rejected
  const [steps, setSteps] = useState([]);
  const [running, setRunning] = useState(null); // {n, verb, title, live}
  const [sign, setSign] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [comment, setComment] = useState("");
  const [tMsgs, setTMsgs] = useState([]);
  const [tInput, setTInput] = useState("");
  const [tThinking, setTThinking] = useState(false);
  const scRef = useRef(null);

  useEffect(() => {
    const el = scRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [steps, running, phase]);

  async function start() {
    await addAudit("T3", "Phase 1 triage started for S-8841 / MV-0412 — fixed 8-step sequence per SOP-QA-0102", OOS_CASE.trigger);
    setPhase("running");
    setSteps([]);
    setSign(reviewer); setReviewed(false); setComment(""); setTMsgs([]); setTInput("");

    const done = [];
    for (const step of OOS_STEPS) {
      setRunning({ n: step.n, verb: step.verb, title: step.title, live: "" });
      // eslint-disable-next-line no-await-in-loop
      const [summary] = await Promise.all([
        stepSummary({ step, onToken: (d) => setRunning((r) => (r ? { ...r, live: (r.live || "") + d } : r)) }),
        eng.instant ? sleep(260) : null, // instant mode is immediate; pace it so each step can be read
      ]);
      const finished = { ...step, summaryText: summary.text, source: summary.source, sourceNote: summary.note };
      done.push(finished);
      setSteps(done.slice());
      setRunning(null);
    }
    await addAudit("T3", "Workflow complete — draft INV-2026-084 presented at the approval gate. No LIMS write.", done.map((s) => `Step ${s.n} [${s.source}]: ${s.summaryText}`).join("\n"));
    setPhase("gate");
  }

  function reset() {
    setPhase("idle"); setSteps([]); setRunning(null);
    setSign(""); setReviewed(false); setComment(""); setTMsgs([]); setTInput(""); setTThinking(false);
  }

  async function askTriage(text) {
    const q = (text ?? tInput).trim();
    if (!q || tThinking) return;
    setTMsgs((m) => [...m, { id: tid(), who: "you", text: q }]);
    setTInput("");
    const aid = tid();
    setTMsgs((m) => [...m, { id: aid, who: "agent", text: "", streaming: true }]);
    setTThinking(true);
    try {
      const res = await triageAnswer({
        question: q, steps,
        onToken: (d) => setTMsgs((m) => m.map((x) => (x.id === aid ? { ...x, text: x.text + d } : x))),
      });
      await addAudit("T3", `Triage assistant: "${q.slice(0, 50)}" — ${res.withheld ? "model answer withheld (citation check)" : res.refused ? "declined (outside gathered evidence)" : "answered from gathered evidence"}`, `Q: ${q}\n\nA: ${res.text}${res.withheld ? `\n\nWITHHELD: ${res.withheld}` : ""}`);
      setTMsgs((m) => m.map((x) => (x.id === aid ? { ...x, streaming: false, text: res.text, refusal: res.refused, withheld: res.withheld } : x)));
    } catch (e) {
      setTMsgs((m) => m.map((x) => (x.id === aid ? { ...x, streaming: false, text: "Engine error: " + e.message, refusal: true } : x)));
    } finally {
      setTThinking(false);
    }
  }

  async function approve() {
    if (approveDisabled) return;
    const signedAt = new Date().toISOString();
    await addAudit("T3", `INV-2026-084 APPROVED — e-signature (demo) by ${sign.trim()} · meaning: approval of Phase 1 record · released to QA queue (export only)`,
      `SIGNATURE\nname: ${sign.trim()}\nmeaning: I approve this Phase 1 investigation record\nsigned: ${signedAt}\nreviewed all steps and cited evidence: yes\ncomment: ${comment.trim() || "—"}`);
    setPhase("approved");
  }
  async function reject() {
    if (rejectDisabled) return;
    await addAudit("T3", `INV-2026-084 draft REJECTED by ${reviewer} — discarded, no record created`, `REJECTION\nreason: ${comment.trim()}`);
    setPhase("rejected");
  }

  const gate = phase === "gate", approved = phase === "approved", rejected = phase === "rejected", isRunning = phase === "running";
  const triageVisible = gate || approved || rejected || steps.length > 2;
  const gateBadge = approved ? "APPROVED & SIGNED" : rejected ? "REJECTED" : gate ? "AWAITING REVIEW" : isRunning ? "GENERATING" : "NO DRAFT";
  const badgeColors = approved ? ["#DCEFE2", "#1E6E43"] : rejected ? ["#F4E3E1", "#A33025"] : gate ? ["#F8F0DE", "#6E5410"] : ["#E6E9E7", "#71807B"];
  const approveDisabled = sign.trim().length < 3 || !reviewed;
  const rejectDisabled = comment.trim().length < 5;

  return (
    <div style={css("flex:1;display:flex;min-width:0")}>
      <div style={css("flex:1;display:flex;flex-direction:column;min-width:0;background:#F7F8F7")}>
        <div style={css("flex:none;display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #D9DDDB;background:#EFF1F0")}>
          <span style={css("font-weight:600;font-size:13px")}>OOS Investigation Triage — Phase 1</span>
          <span style={css("font-size:11px;color:#5A6663")}>Fixed 8-step sequence per SOP-QA-0102. {eng.instant ? "Instant mode shows each step's fixed finding." : "The model only phrases each step's finding; it never chooses the steps."}</span>
        </div>

        <div ref={scRef} style={css("flex:1;overflow-y:auto;min-height:0;padding:16px 18px;display:flex;flex-direction:column;gap:12px")}>
          <div style={css("border:1px solid #DCB4AF;background:#FBF3F2;border-radius:5px;padding:12px 14px;display:flex;align-items:center;gap:14px")}>
            <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.06em;padding:3px 8px;background:#A33025;color:#fff;border-radius:3px;flex:none")}>OOS TRIGGER</span>
            <div style={css("flex:1;font-size:12.5px;line-height:1.55")}>{OOS_CASE.trigger}</div>
            {phase === "idle" && <button onClick={start} style={css("flex:none;padding:9px 18px;background:#A33025;color:#fff;border:none;border-radius:4px;font-size:12.5px;font-weight:600;cursor:pointer")}>Start Phase 1 triage</button>}
            {(approved || rejected) && <button onClick={reset} style={css("flex:none;padding:8px 14px;background:#F7F8F7;color:#3A4744;border:1px solid #C6CCC9;border-radius:4px;font-size:11.5px;cursor:pointer")}>Reset demo</button>}
          </div>

          {steps.map((st) => (
            <div key={st.n} style={css("display:flex;gap:12px")}>
              <div style={css("flex:none;width:30px;display:flex;flex-direction:column;align-items:center;gap:4px")}>
                <span style={{ ...css("width:26px;height:26px;border-radius:50%;color:#fff;display:grid;place-items:center;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600"), background: st.status === "flag" ? "#A33025" : "#1C2422", border: `1px solid ${st.status === "flag" ? "#A33025" : "#1C2422"}` }}>{st.n}</span>
                <span style={css("flex:1;width:1px;background:#C6CCC9;min-height:10px")} />
              </div>
              <div style={{ ...css("flex:1;border-radius:5px;padding:11px 14px;display:flex;flex-direction:column;gap:7px"), border: `1px solid ${st.status === "flag" ? "#DCB4AF" : "#D9DDDB"}`, background: st.status === "flag" ? "#FBF3F2" : "#FFFFFF" }}>
                <div style={css("display:flex;align-items:center;gap:8px")}>
                  <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.06em;color:#0A4F47;background:#E4EEEC;border:1px solid #B9D2CD;padding:2px 7px;border-radius:3px")}>{st.verb}</span>
                  <span style={css("font-size:12.5px;font-weight:600")}>{st.title}</span>
                  <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9px;color:#9AA6A2")}>{st.tier}</span>
                  <span style={css("flex:1")} />
                  {st.flag && <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:600;padding:2px 8px;background:#A33025;color:#fff;border-radius:3px")}>⚑ {st.flag}</span>}
                  {st.proposal && <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:600;padding:2px 8px;background:#6E5410;color:#fff;border-radius:3px")}>PROPOSAL: {st.proposal}</span>}
                </div>
                <div style={css("font-size:12px;line-height:1.6;color:#1C2422")}>{st.summaryText}</div>
                <div style={css("font-family:'IBM Plex Mono',monospace;font-size:9px;color:#9AA6A2")}>{SOURCE_LABEL[st.source] || st.source}{st.sourceNote ? ` — ${st.sourceNote}` : ""}</div>
                {st.evidence?.map((ev, i) => (
                  <div key={i} style={css("display:flex;gap:8px;align-items:baseline;font-size:10.5px;border-left:2px solid #B9D2CD;padding-left:8px")}>
                    <span style={css("font-family:'IBM Plex Mono',monospace;color:#0A4F47;font-weight:600;flex:none")}>{ev.ref}</span>
                    <span style={css("color:#5A6663;line-height:1.5")}>{ev.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {running && (
            <div style={css("display:flex;gap:12px")}>
              <span style={css("flex:none;width:26px;height:26px;margin-left:2px;border-radius:50%;border:2px dashed #0F6E63;display:grid;place-items:center;font-family:'IBM Plex Mono',monospace;font-size:10px;color:#0F6E63;animation:la-pulse 1.2s infinite")}>{running.n}</span>
              <div style={css("flex:1;display:flex;flex-direction:column;gap:4px")}>
                <span style={css("font-family:'IBM Plex Mono',monospace;font-size:11px;color:#0F6E63")}>{running.verb} — {running.title}…</span>
                {running.live && <span style={css("font-size:12px;line-height:1.6;color:#3A4744")}>{running.live}<span style={css("animation:la-pulse 1.2s infinite")}>▍</span></span>}
              </div>
            </div>
          )}

          {triageVisible && (
            <div style={css("border:1px solid #B9D2CD;background:#F2F7F5;border-radius:6px;display:flex;flex-direction:column;overflow:hidden")}>
              <div style={css("display:flex;align-items:center;gap:8px;padding:9px 13px;background:#E4EEEC;border-bottom:1px solid #B9D2CD")}>
                <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.06em;color:#0A4F47")}>TRIAGE ASSISTANT</span>
                <span style={css("font-size:10.5px;color:#5A6663")}>{eng.instant ? "quotes this workflow's gathered evidence — or declines" : "answers only from this workflow's gathered evidence — logged like everything else"}</span>
              </div>
              {tMsgs.map((m) => (
                <div key={m.id} style={{ ...css("display:flex;flex-direction:column;gap:5px;padding:10px 13px;border-bottom:1px solid #E6E9E7"), background: m.who === "agent" ? "#FFFFFF" : "#EFF1F0" }}>
                  <div style={css("display:flex;align-items:center;gap:8px")}>
                    <span style={{ ...css("font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:600;letter-spacing:.06em"), color: m.who === "agent" ? "#0A4F47" : "#71807B" }}>{m.who === "agent" ? "TRIAGE ASSISTANT" : "YOU"}</span>
                    {m.refusal && <span style={css("font-family:'IBM Plex Mono',monospace;font-size:8.5px;font-weight:600;padding:1px 6px;border-radius:2px;background:#F4E3E1;color:#A33025;border:1px solid #DCB4AF")}>{m.withheld ? "WITHHELD" : "SCOPE-LIMITED"}</span>}
                  </div>
                  <div style={css("font-size:12px;line-height:1.6;color:#1C2422;white-space:pre-wrap")}>{m.text}{m.streaming && <span style={css("animation:la-pulse 1.2s infinite")}>▍</span>}</div>
                  {m.withheld && <details style={css("font-size:11px;color:#5A6663")}><summary style={css("cursor:pointer")}>Show the withheld model output (not relied upon)</summary><div style={css("margin-top:5px;white-space:pre-wrap")}>{m.withheld}</div></details>}
                </div>
              ))}
              <div style={css("padding:9px 13px;display:flex;flex-direction:column;gap:7px;background:#F2F7F5")}>
                <div style={css("display:flex;flex-wrap:wrap;gap:5px")}>
                  {TRIAGE_SUGGESTED.map((q, i) => (
                    <button key={i} onClick={() => askTriage(q)} style={css("font-size:10.5px;padding:4px 9px;background:#fff;border:1px solid #B9D2CD;border-radius:12px;cursor:pointer;color:#3A4744")}>{q}</button>
                  ))}
                </div>
                <div style={css("display:flex;gap:7px")}>
                  <input value={tInput} onChange={(e) => setTInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && askTriage()} placeholder="Ask about the evidence, the classification, or what happens next…" style={css("flex:1;font-size:12px;padding:8px 10px;border:1px solid #B9C0BD;border-radius:4px;background:#fff;font-family:'IBM Plex Sans',sans-serif")} />
                  <button onClick={() => askTriage()} style={css("flex:none;padding:8px 16px;background:#0F6E63;color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer")}>Ask</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Draft / approval panel */}
      <div style={css("width:472px;flex:none;border-left:1px solid #C6CCC9;background:#EFF1F0;display:flex;flex-direction:column;min-height:0")}>
        <div style={css("flex:none;padding:10px 14px;border-bottom:1px solid #D9DDDB;display:flex;align-items:center;gap:8px")}>
          <span style={css("font-weight:600;font-size:12px")}>Investigation record</span>
          <span style={css("flex:1")} />
          <span style={{ ...css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;padding:2px 8px;border-radius:3px"), background: badgeColors[0], color: badgeColors[1] }}>{gateBadge}</span>
        </div>
        <div style={css("flex:1;overflow-y:auto;min-height:0;padding:14px;display:flex;flex-direction:column;gap:10px")}>
          {!(gate || approved || rejected) && (
            <div style={css("font-size:11.5px;color:#71807B;line-height:1.7")}>The Phase 1 draft appears here after step 8 completes. It is a <b>proposal</b> — every claim cited to its source record, the classification shown with its reasoning, and nothing written anywhere until a qualified person signs.</div>
          )}
          {(gate || approved || rejected) && (
            <div style={css("display:flex;flex-direction:column;gap:10px")}>
              <div style={css("display:flex;align-items:baseline;gap:10px")}>
                <span style={css("font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600")}>{OOS_DRAFT.id}</span>
                <span style={css("font-size:10.5px;color:#5A6663")}>Phase 1 laboratory investigation</span>
              </div>
              <div style={css("border:1px solid #E0CD9E;background:#F8F0DE;border-radius:4px;padding:9px 11px;display:flex;flex-direction:column;gap:3px")}>
                <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;color:#6E5410;letter-spacing:.05em")}>PROPOSED CLASSIFICATION — NOT A VERDICT</span>
                <span style={css("font-size:13px;font-weight:600")}>{OOS_DRAFT.classification}</span>
                <span style={css("font-size:10.5px;color:#6E5410")}>{OOS_DRAFT.confidence}</span>
              </div>
              {OOS_DRAFT.sections.map((sec, i) => (
                <div key={i} style={css("background:#F7F8F7;border:1px solid #D9DDDB;border-radius:4px;padding:9px 11px;display:flex;flex-direction:column;gap:4px")}>
                  <span style={css("font-size:11px;font-weight:600")}>{sec.h}</span>
                  <span style={css("font-size:11px;line-height:1.6;color:#3A4744")}>{sec.t}</span>
                  <span style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#0A4F47")}>↳ {sec.cite}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {gate && (
          <div style={css("flex:none;border-top:2px solid #A33025;background:#FBF3F2;padding:12px 14px;display:flex;flex-direction:column;gap:8px")}>
            <div style={css("font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.06em;color:#A33025")}>HUMAN APPROVAL GATE — REQUIRED, NOT SKIPPABLE</div>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reviewer comment — optional to approve, required to reject" style={css("resize:none;height:52px;font-size:11.5px;padding:8px 10px;border:1px solid #C6CCC9;border-radius:4px;font-family:'IBM Plex Sans',sans-serif;background:#fff")} />
            <label style={css("display:flex;gap:7px;align-items:flex-start;font-size:11px;color:#3A4744;line-height:1.45;cursor:pointer")}>
              <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} style={{ marginTop: "2px" }} />
              I have reviewed every step, its cited evidence and the proposed classification.
            </label>
            <div style={css("display:flex;gap:8px;align-items:center")}>
              <input value={sign} onChange={(e) => setSign(e.target.value)} placeholder="Full name" aria-label="Signature — full name" style={css("flex:1;min-width:0;font-size:12px;padding:9px 10px;border:1px solid #C6CCC9;border-radius:4px;background:#fff;font-family:'IBM Plex Mono',monospace")} />
              <button onClick={approve} disabled={approveDisabled} title={approveDisabled ? "Enter your name and confirm the review" : "Sign: I approve this record"} style={{ ...css("flex:none;padding:9px 14px;color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:600"), background: approveDisabled ? "#B9C0BD" : "#1E6E43", cursor: approveDisabled ? "not-allowed" : "pointer" }}>Approve &amp; sign</button>
              <button onClick={reject} disabled={rejectDisabled} title={rejectDisabled ? "Give a reason for rejecting in the comment" : "Reject and discard the draft"} style={{ ...css("flex:none;padding:9px 12px;background:#F7F8F7;border:1px solid #DCB4AF;border-radius:4px;font-size:12px;font-weight:600"), color: rejectDisabled ? "#C9A7A3" : "#A33025", cursor: rejectDisabled ? "not-allowed" : "pointer" }}>Reject</button>
            </div>
            <div style={css("font-size:10px;color:#71807B;line-height:1.5")}>
              Signature meaning: <i>I approve this Phase 1 investigation record.</i> Name, meaning and time go on the audit trail. Approval releases the record to the QA queue as an export — the AI has no write path to the LIMS in any state.
              <br />Demo only: a 21 CFR Part 11 e-signature would also re-authenticate you (e.g. password) against a controlled user account. This demo has no accounts.
            </div>
          </div>
        )}
        {(approved || rejected) && (
          <div style={{ ...css("flex:none;padding:12px 14px;font-size:11.5px;line-height:1.6;color:#1C2422"), borderTop: `2px solid ${approved ? "#1E6E43" : "#A33025"}`, background: approved ? "#F0F7F2" : "#FBF3F2" }}>
            {approved
              ? `✓ Signed by ${sign.trim()} (demo e-signature). INV-2026-084 released to the QA queue as a signed export. The AI wrote nothing to the LIMS — it retrieved, reasoned, cited and proposed; you decided.`
              : "✕ Draft rejected and discarded. No record was created anywhere. The rejection itself is on the audit trail — reviewability cuts both ways."}
          </div>
        )}
      </div>
    </div>
  );
}
