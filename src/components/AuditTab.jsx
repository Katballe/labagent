import React, { useEffect, useState } from "react";
import { css } from "../lib/css.js";
import { useApp } from "../state/store.jsx";
import { verifyChain } from "../lib/audit.js";
import { short } from "../lib/hash.js";

const mono = "font-family:'IBM Plex Mono',monospace";
const COLS = "108px 186px 110px 56px 1fr 140px 96px 92px";

function kindColors(k) {
  return {
    T1: ["#E4EEEC", "#0A4F47"], T2: ["#E3EAF2", "#2B4A73"], T3: ["#F1E7F2", "#6B3A70"], EVAL: ["#F8F0DE", "#6E5410"],
  }[k] || ["#E6E9E7", "#5A6663"];
}

function Banner({ tone, children }) {
  const [bg, bd, fg] = tone === "ok" ? ["#F0F7F2", "#A8D4B6", "#1E6E43"] : tone === "bad" ? ["#FBF3F2", "#DCB4AF", "#A33025"] : ["#F8F0DE", "#E0CD9E", "#6E5410"];
  return <div style={{ ...css("font-size:11.5px;line-height:1.55;padding:9px 12px;border-radius:5px;border:1px solid"), background: bg, borderColor: bd, color: fg }}>{children}</div>;
}

export default function AuditTab() {
  const { audit, addAudit, resetAudit, auditPersisted } = useApp();
  const [status, setStatus] = useState(null); // verifyChain result for the live log
  const [tamper, setTamper] = useState(null); // result of the tamper test
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let live = true;
    verifyChain(audit).then((r) => live && setStatus(r));
    return () => { live = false; };
  }, [audit]);

  async function tamperTest() {
    if (audit.length < 2) {
      setTamper({ note: "Ask a question or run a query first — the tamper test needs at least two entries." });
      return;
    }
    // Edit a COPY of the log (the real one is untouched) and verify it.
    const i = Math.max(0, audit.length - 2);
    const copy = audit.map((e, j) => (j === i ? { ...e, action: e.action + " [edited]" } : e));
    const r = await verifyChain(copy);
    setTamper({ target: audit[i].id, result: r });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), format: "labagent.audit.v2", entries: audit }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `labagent-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function clearLog() {
    if (!audit.length) return;
    if (!window.confirm(`Delete all ${audit.length} audit entries stored in this browser? A new chain starts with a record of the deletion.`)) return;
    const head = audit[audit.length - 1];
    await resetAudit();
    await addAudit("SYS", `Audit log cleared — previous chain of ${audit.length} entries ended at ${head.id} (hash ${short(head.hash)})`, JSON.stringify({ previousHead: head.hash, previousLength: audit.length }), { model: "—" });
    setTamper(null);
  }

  const rows = [...audit].reverse();
  const btn = "padding:5px 11px;font-size:11px;font-weight:600;border-radius:4px;cursor:pointer;border:1px solid #C6CCC9;background:#fff;color:#3A4744";

  return (
    <div style={css("flex:1;display:flex;flex-direction:column;min-width:0;background:#F7F8F7")}>
      <div style={css("flex:none;display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #D9DDDB;background:#EFF1F0")}>
        <span style={css("font-weight:600;font-size:13px")}>Audit trail</span>
        <span style={css("font-size:11px;color:#5A6663")}>Every interaction, with engine, prompt version and SHA-256 hashes, chained so any edit, removal or reordering is detectable.</span>
        <div style={css("flex:1")} />
        <span style={{ ...css(`${mono};font-size:10px;padding:3px 8px;border-radius:3px;border:1px solid`), ...(status?.ok === false ? { background: "#F4E3E1", color: "#A33025", borderColor: "#DCB4AF" } : { background: "#E4EEEC", color: "#0A4F47", borderColor: "#B9D2CD" }) }}>
          {audit.length} ENTRIES · {status == null ? "VERIFYING…" : status.ok ? "CHAIN VERIFIED ✓" : `CHAIN BROKEN AT ${status.brokenAt}`}
        </span>
      </div>

      <div style={css("flex:none;padding:10px 18px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid #E6E9E7")}>
        <div style={css("display:flex;gap:8px;align-items:center;flex-wrap:wrap")}>
          <button onClick={() => verifyChain(audit).then(setStatus)} style={css(btn)}>Verify chain</button>
          <button onClick={tamperTest} style={css(btn)}>Tamper test</button>
          <button onClick={exportJson} disabled={!audit.length} style={css(btn)}>Export JSON</button>
          <button onClick={clearLog} disabled={!audit.length} style={css(btn + ";color:#A33025;border-color:#DCB4AF")}>Clear log</button>
          <span style={css("font-size:10.5px;color:#71807B;margin-left:6px")}>
            Stored only in this browser. Tamper-<i>evident</i>, not tamper-proof: anyone with this browser can delete it — a production system keeps the chain on a server users can't write to.
          </span>
        </div>
        {!auditPersisted && <Banner tone="warn">This browser isn't letting the page store data (private mode or storage blocked), so the log lasts only until you close the tab.</Banner>}
        {status && !status.ok && <Banner tone="bad">Verification failed at {status.brokenAt}: {status.reason}. Entries before it are intact.</Banner>}
        {tamper?.note && <Banner tone="warn">{tamper.note}</Banner>}
        {tamper?.result && (
          <Banner tone={tamper.result.ok ? "bad" : "ok"}>
            Tamper test: appended “[edited]” to {tamper.target}'s action in a <b>copy</b> of the log and re-verified it —{" "}
            {tamper.result.ok ? "the edit was NOT detected." : <>detected at <b>{tamper.result.brokenAt}</b>: {tamper.result.reason}.</>} The real log was not modified.
          </Banner>
        )}
      </div>

      <div style={css("flex:1;overflow-y:auto;min-height:0")}>
        <div style={{ ...css("display:grid;background:#E6E9E7;border-bottom:1px solid #C6CCC9;position:sticky;top:0;z-index:1"), gridTemplateColumns: COLS }}>
          {["ENTRY", "TIMESTAMP", "ACTOR", "TIER", "ACTION", "ENGINE", "PROMPT", "HASH"].map((h) => (
            <div key={h} style={css(`padding:7px 10px;${mono};font-size:10px;font-weight:600;color:#3A4744`)}>{h}</div>
          ))}
        </div>
        {!rows.length && (
          <div style={css("padding:18px;font-size:12px;color:#71807B;line-height:1.7;max-width:640px")}>
            No entries yet. Ask the assistant a question, run a data query or start the OOS workflow — each step is appended here with a hash of its content and of the entry before it.
          </div>
        )}
        {rows.map((a) => {
          const [bg, fg] = kindColors(a.kind);
          const isOpen = open === a.id;
          const broken = status && !status.ok && a.seq >= Number(String(status.brokenAt).replace(/\D/g, ""));
          return (
            <div key={a.id} style={css("border-bottom:1px solid #E6E9E7")}>
              <div onClick={() => setOpen(isOpen ? null : a.id)} style={{ ...css("display:grid;cursor:pointer"), gridTemplateColumns: COLS, background: broken ? "#FBF3F2" : isOpen ? "#F2F7F5" : "#fff" }}>
                <div style={css(`padding:8px 10px;${mono};font-size:10.5px;font-weight:600;color:#1C2422`)}><span style={css("white-space:nowrap")}>{isOpen ? "▾" : "▸"} {a.id}</span></div>
                <div style={css(`padding:8px 10px;${mono};font-size:10.5px;color:#5A6663`)}>{a.ts}</div>
                <div style={css(`padding:8px 10px;${mono};font-size:10.5px;color:#3A4744;overflow:hidden;text-overflow:ellipsis`)}>{a.actor}</div>
                <div style={css("padding:8px 10px")}><span style={{ ...css(`${mono};font-size:9px;font-weight:600;padding:2px 6px;border-radius:2px`), background: bg, color: fg }}>{a.kind}</span></div>
                <div style={css("padding:8px 10px;font-size:11.5px;color:#1C2422;line-height:1.5")}>{a.action}</div>
                <div style={css(`padding:8px 10px;${mono};font-size:10px;color:#5A6663;overflow:hidden;text-overflow:ellipsis`)}>{a.model}</div>
                <div style={css(`padding:8px 10px;${mono};font-size:10px;color:#5A6663`)}>{a.prompt}</div>
                <div style={css(`padding:8px 10px;${mono};font-size:10px;color:#9AA6A2`)}>{short(a.hash)}</div>
              </div>
              {isOpen && (
                <div style={css("padding:10px 14px 12px 98px;background:#F2F7F5;display:flex;flex-direction:column;gap:6px")}>
                  <pre style={css(`margin:0;${mono};font-size:11px;line-height:1.55;white-space:pre-wrap;color:#1C2422;background:#fff;border:1px solid #D9DDDB;border-radius:4px;padding:8px 10px;max-height:240px;overflow:auto`)}>{a.content || "(no content)"}</pre>
                  <div style={css(`${mono};font-size:10px;color:#5A6663;line-height:1.7;word-break:break-all`)}>
                    content sha-256 {a.contentHash}<br />previous entry {a.prevHash}<br />this entry {a.hash}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
