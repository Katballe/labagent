import React from "react";
import { css } from "./lib/css.js";
import { AppProvider, useApp } from "./state/store.jsx";
import { CORPUS } from "./data/dataset.js";
import ModelGate from "./components/ModelGate.jsx";
import AssistantTab from "./components/AssistantTab.jsx";
import QueryTab from "./components/QueryTab.jsx";
import OosTab from "./components/OosTab.jsx";
import AuditTab from "./components/AuditTab.jsx";
import EvalsTab from "./components/EvalsTab.jsx";

const NAV = [
  { key: "assistant", chip: "T1", label: "Assistant", sub: "Document QA · RAG" },
  { key: "query", chip: "T2", label: "Data query", sub: "Read-only SQL" },
  { key: "oos", chip: "T3", label: "OOS triage", sub: "Phase 1 workflow" },
  { key: "audit", chip: "AT", label: "Audit trail", sub: "Append-only log" },
  { key: "evals", chip: "EV", label: "Evals", sub: "Scorecard" },
];

function TopBar() {
  const { engine: eng } = useApp();
  const modelShort = eng.ready
    ? (eng.backend === "ollama" ? `ollama:${eng.modelId}` : eng.modelId.replace(/-MLC$/, ""))
    : "loading…";
  return (
    <div style={css("height:50px;flex:none;display:flex;align-items:center;gap:14px;padding:0 16px;background:#1C2422;color:#E8ECEA;border-bottom:2px solid #0F6E63")}>
      <div style={css("display:flex;align-items:baseline;gap:8px")}>
        <span style={css("font-weight:700;font-size:15px;letter-spacing:.02em")}>LabAgent</span>
        <span style={css("font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:#8FA39D")}>GxP LIMS ASSISTANT · v1.0 · LOCAL AI</span>
      </div>
      <div style={css("display:flex;align-items:center;gap:6px;font-family:'IBM Plex Mono',monospace;font-size:10px")}>
        <span style={css("padding:3px 8px;background:#0F6E63;color:#E8ECEA;border-radius:3px;font-weight:600")}>READ-ONLY</span>
        <span style={css("padding:3px 8px;background:#2A3532;color:#AFC0BB;border-radius:3px")}>100% ON-DEVICE</span>
      </div>
      <div style={css("flex:1")} />
      <div style={css("display:flex;align-items:center;gap:14px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:#8FA39D")}>
        <span>model <span style={css("color:#D5DEDB")}>{modelShort}</span></span>
        <span>prompt <span style={css("color:#D5DEDB")}>v1.4.2</span></span>
        <span>corpus <span style={css("color:#D5DEDB")}>{CORPUS.length} docs</span></span>
        <span style={css("display:flex;align-items:center;gap:6px;color:#D5DEDB")}>
          <span style={css("width:22px;height:22px;border-radius:50%;background:#0F6E63;color:#fff;display:grid;place-items:center;font-size:9.5px;font-weight:600")}>MK</span>m.katballe
        </span>
      </div>
    </div>
  );
}

function NavRail() {
  const { tab, setTab } = useApp();
  return (
    <div style={css("width:206px;flex:none;background:#EFF1F0;border-right:1px solid #C6CCC9;display:flex;flex-direction:column;padding:10px 8px;gap:2px")}>
      {NAV.map((nv) => {
        const active = tab === nv.key;
        return (
          <button
            key={nv.key}
            onClick={() => setTab(nv.key)}
            style={css(`display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:5px;border:1px solid ${active ? "#B9D2CD" : "transparent"};background:${active ? "#FFFFFF" : "transparent"};cursor:pointer;font-size:12.5px;font-weight:600;color:#1C2422;text-align:left;width:100%`)}
          >
            <span style={css("display:flex;align-items:center;gap:8px;width:100%")}>
              <span style={css(`font-family:'IBM Plex Mono',monospace;font-size:9.5px;width:22px;flex:none;text-align:center;padding:2px 0;border-radius:3px;background:${active ? "#0F6E63" : "#DDE1DF"};color:${active ? "#fff" : "#5A6663"};font-weight:600`)}>{nv.chip}</span>
              <span style={css("flex:1;text-align:left")}>{nv.label}</span>
            </span>
            <span style={css("font-size:10px;color:#71807B;padding-left:30px;text-align:left;display:block")}>{nv.sub}</span>
          </button>
        );
      })}
      <div style={css("flex:1")} />
      <div style={css("padding:10px;border-top:1px solid #C6CCC9;font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#71807B;line-height:1.7")}>
        AI proposes.<br />A qualified human signs.<br />Nothing writes to the LIMS.
      </div>
    </div>
  );
}

function Shell() {
  const { tab } = useApp();
  return (
    <div style={css("height:100vh;min-width:1280px;display:flex;flex-direction:column;overflow:hidden;background:#DDE1DF")}>
      <TopBar />
      <div style={css("flex:1;display:flex;min-height:0")}>
        <NavRail />
        {tab === "assistant" && <AssistantTab />}
        {tab === "query" && <QueryTab />}
        {tab === "oos" && <OosTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "evals" && <EvalsTab />}
      </div>
      <ModelGate />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
