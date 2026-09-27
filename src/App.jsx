import React, { useState } from "react";
import { css } from "./lib/css.js";
import { AppProvider, useApp } from "./state/store.jsx";
import { CORPUS } from "./data/dataset.js";
import { PROMPT_VERSION } from "./ai/prompts.js";
import pkg from "../package.json";
import EngineDialog from "./components/EngineDialog.jsx";
import AssistantTab from "./components/AssistantTab.jsx";
import QueryTab from "./components/QueryTab.jsx";
import OosTab from "./components/OosTab.jsx";
import AuditTab from "./components/AuditTab.jsx";
import EvalsTab from "./components/EvalsTab.jsx";
import ComplianceTab from "./components/ComplianceTab.jsx";

const NAV = [
  { key: "assistant", chip: "T1", label: "Assistant", sub: "Document QA · cite or refuse" },
  { key: "query", chip: "T2", label: "Data query", sub: "Read-only SQL" },
  { key: "oos", chip: "T3", label: "OOS triage", sub: "Phase 1 workflow" },
  { key: "audit", chip: "AT", label: "Audit trail", sub: "Hash-chained log" },
  { key: "evals", chip: "EV", label: "Evals", sub: "Measured, not claimed" },
  { key: "compliance", chip: "CO", label: "Compliance", sub: "Annex 22 · monitoring" },
];

const mono = "font-family:'IBM Plex Mono',monospace";

function ReviewerChip() {
  const { reviewer, setReviewer } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reviewer);
  const initials = reviewer.replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  if (editing) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); setReviewer(draft); setEditing(false); }} style={css("display:flex;align-items:center;gap:6px")}>
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { setReviewer(draft); setEditing(false); }} maxLength={40} aria-label="Your name for the audit trail" style={css(`${mono};font-size:11px;padding:3px 6px;width:130px;border-radius:3px;border:1px solid #0F6E63;background:#2A3532;color:#E8ECEA`)} />
      </form>
    );
  }
  return (
    <button onClick={() => { setDraft(reviewer); setEditing(true); }} title="Your name as it appears on the audit trail and e-signatures — click to change" style={css(`display:flex;align-items:center;gap:6px;color:#D5DEDB;background:none;border:none;cursor:pointer;${mono};font-size:10.5px;padding:0`)}>
      <span style={css("width:22px;height:22px;border-radius:50%;background:#0F6E63;color:#fff;display:grid;place-items:center;font-size:9.5px;font-weight:600")}>{initials}</span>
      {reviewer}
    </button>
  );
}

function EngineChip() {
  const { engine: eng, setEngineOpen } = useApp();
  const loading = eng.loading;
  return (
    <button onClick={() => setEngineOpen(true)} title="Choose how LabAgent answers: the Cloudflare agent, instant mode (offline, no download) or a local AI model" style={css(`display:flex;align-items:center;gap:8px;padding:4px 10px;border-radius:4px;border:1px solid #3C4A46;background:#2A3532;color:#D5DEDB;cursor:pointer;${mono};font-size:10.5px`)}>
      <span style={{ ...css("width:7px;height:7px;border-radius:50%"), background: loading ? "#E0B44C" : eng.cloud ? "#F6A04D" : eng.instant ? "#7BD4B8" : "#6FB3FF" }} />
      <span>engine <span style={css("color:#fff;font-weight:600")}>{eng.label}</span></span>
      {loading && <span style={css("color:#E0B44C")}>· loading {loading.pct != null ? `${loading.pct}%` : "…"}</span>}
      <span style={css("color:#8FA39D")}>▾ change</span>
    </button>
  );
}

function TopBar() {
  const { engine: eng } = useApp();
  return (
    <div style={css("height:50px;flex:none;display:flex;align-items:center;gap:14px;padding:0 16px;background:#1C2422;color:#E8ECEA;border-bottom:2px solid #0F6E63")}>
      <div style={css("display:flex;align-items:baseline;gap:8px")}>
        <span style={css("font-weight:700;font-size:15px;letter-spacing:.02em")}>LabAgent</span>
        <span style={css(`${mono};font-size:10.5px;color:#8FA39D`)}>GxP LIMS ASSISTANT · v{pkg.version} · DEMO</span>
      </div>
      <div style={css(`display:flex;align-items:center;gap:6px;${mono};font-size:10px`)}>
        <span style={css("padding:3px 8px;background:#0F6E63;color:#E8ECEA;border-radius:3px;font-weight:600")}>READ-ONLY</span>
        {eng.cloud
          ? <span title="Questions are answered by the LabAgent agent on Cloudflare (synthetic data only)" style={css("padding:3px 8px;background:#2A3532;color:#F6C08A;border-radius:3px")}>CLOUDFLARE AGENT</span>
          : <span title="Everything runs in this browser tab; nothing you type is sent anywhere" style={css("padding:3px 8px;background:#2A3532;color:#AFC0BB;border-radius:3px")}>100% ON-DEVICE</span>}
      </div>
      <div style={css("flex:1")} />
      <div style={css(`display:flex;align-items:center;gap:14px;${mono};font-size:10.5px;color:#8FA39D`)}>
        <EngineChip />
        <span>prompt <span style={css("color:#D5DEDB")}>{PROMPT_VERSION}</span></span>
        <span>corpus <span style={css("color:#D5DEDB")}>{CORPUS.length} docs</span></span>
        <ReviewerChip />
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
            aria-current={active ? "page" : undefined}
            style={css(`display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:5px;border:1px solid ${active ? "#B9D2CD" : "transparent"};background:${active ? "#FFFFFF" : "transparent"};cursor:pointer;font-size:12.5px;font-weight:600;color:#1C2422;text-align:left;width:100%`)}
          >
            <span style={css("display:flex;align-items:center;gap:8px;width:100%")}>
              <span style={css(`${mono};font-size:9.5px;width:22px;flex:none;text-align:center;padding:2px 0;border-radius:3px;background:${active ? "#0F6E63" : "#DDE1DF"};color:${active ? "#fff" : "#5A6663"};font-weight:600`)}>{nv.chip}</span>
              <span style={css("flex:1;text-align:left")}>{nv.label}</span>
            </span>
            <span style={css("font-size:10px;color:#71807B;padding-left:30px;text-align:left;display:block")}>{nv.sub}</span>
          </button>
        );
      })}
      <div style={css("flex:1")} />
      <div style={css(`padding:10px;border-top:1px solid #C6CCC9;${mono};font-size:9.5px;color:#71807B;line-height:1.7`)}>
        AI proposes.<br />A qualified human signs.<br />Nothing writes to the LIMS.<br />
        <span style={css("color:#9AA6A2")}>All data is synthetic.</span>
      </div>
    </div>
  );
}

function Shell() {
  const { tab } = useApp();
  return (
    <div style={css("height:100vh;min-width:1180px;display:flex;flex-direction:column;overflow:hidden;background:#DDE1DF")}>
      <TopBar />
      <div style={css("flex:1;display:flex;min-height:0")}>
        <NavRail />
        {tab === "assistant" && <AssistantTab />}
        {tab === "query" && <QueryTab />}
        {tab === "oos" && <OosTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "evals" && <EvalsTab />}
        {tab === "compliance" && <ComplianceTab />}
      </div>
      <EngineDialog />
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
