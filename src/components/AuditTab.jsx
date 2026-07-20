import React from "react";
import { css } from "../lib/css.js";
import { useApp } from "../state/store.jsx";

const GRID = "grid-template-columns:96px 150px 110px 64px 1fr 150px 84px 104px";

function kindColors(k) {
  return {
    T1: ["#E4EEEC", "#0A4F47"], T2: ["#E3EAF2", "#2B4A73"], T3: ["#F1E7F2", "#6B3A70"],
  }[k] || ["#E6E9E7", "#5A6663"];
}

export default function AuditTab() {
  const { audit } = useApp();
  return (
    <div style={css("flex:1;display:flex;flex-direction:column;min-width:0;background:#F7F8F7")}>
      <div style={css("flex:none;display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #D9DDDB;background:#EFF1F0")}>
        <span style={css("font-weight:600;font-size:13px")}>Audit trail</span>
        <span style={css("font-size:11px;color:#5A6663")}>Append-only. Every interaction, stamped with model + prompt version and a real SHA-256 content hash. ALCOA+.</span>
        <div style={css("flex:1")} />
        <span style={css("font-family:'IBM Plex Mono',monospace;font-size:10px;padding:3px 8px;background:#E4EEEC;border:1px solid #B9D2CD;border-radius:3px;color:#0A4F47")}>{audit.length} ENTRIES · IMMUTABLE</span>
      </div>
      <div style={css("flex:1;overflow-y:auto;min-height:0")}>
        <div style={{ ...css("display:grid;background:#E6E9E7;border-bottom:1px solid #C6CCC9;position:sticky;top:0"), gridTemplateColumns: "96px 150px 110px 64px 1fr 150px 84px 104px" }}>
          {["ENTRY", "TIMESTAMP", "ACTOR", "TIER", "ACTION", "MODEL", "PROMPT", "SHA-256"].map((h) => (
            <div key={h} style={css("padding:7px 10px;font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;color:#3A4744")}>{h}</div>
          ))}
        </div>
        {audit.map((a) => {
          const [bg, fg] = kindColors(a.kind);
          return (
            <div key={a.id} style={{ ...css("display:grid;border-bottom:1px solid #E6E9E7;background:#fff"), gridTemplateColumns: "96px 150px 110px 64px 1fr 150px 84px 104px" }}>
              <div style={css("padding:8px 10px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:600;color:#1C2422")}>{a.id}</div>
              <div style={css("padding:8px 10px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:#5A6663")}>{a.ts}</div>
              <div style={css("padding:8px 10px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:#3A4744")}>{a.actor}</div>
              <div style={css("padding:8px 10px")}><span style={{ ...css("font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:600;padding:2px 6px;border-radius:2px"), background: bg, color: fg }}>{a.kind}</span></div>
              <div style={css("padding:8px 10px;font-size:11.5px;color:#1C2422;line-height:1.5")}>{a.action}</div>
              <div style={css("padding:8px 10px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:#5A6663;overflow:hidden;text-overflow:ellipsis")}>{a.model}</div>
              <div style={css("padding:8px 10px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:#5A6663")}>{a.prompt}</div>
              <div style={css("padding:8px 10px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:#9AA6A2")}>{a.hash}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
