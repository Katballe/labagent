import React, {
  createContext, useContext, useState, useEffect, useCallback, useSyncExternalStore,
} from "react";
import { engine } from "../ai/engine.js";
import { PROMPT_VERSION } from "../ai/prompts.js";
import { shortHash } from "../lib/hash.js";
import { AUDIT_SEED, AUDIT_START } from "../data/dataset.js";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

// Subscribe React to the engine singleton.
export function useEngine() {
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.snapshot(),
    () => engine.snapshot()
  );
}

function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function AppProvider({ children }) {
  const [tab, setTab] = useState("assistant");
  const [threshold, setThreshold] = useState(0.6);
  const [audit, setAudit] = useState(() => AUDIT_SEED.slice());
  const [auditN, setAuditN] = useState(AUDIT_START);
  const eng = useEngine();

  // Append an entry to the tamper-evident audit trail with a real content hash.
  const addAudit = useCallback(
    async (kind, action, hashContent) => {
      const n = auditN + 1;
      setAuditN(n);
      const modelShort = eng.backend === "ollama" ? `ollama:${eng.modelId}` : eng.modelId.replace(/-MLC$/, "");
      const hash = await shortHash(hashContent || `${kind}|${action}|${n}`);
      const entry = {
        id: "AUD-0" + n,
        ts: now(),
        actor: "m.katballe",
        kind,
        action,
        model: kind === "T3" && action.includes("armed") ? "—" : modelShort,
        prompt: PROMPT_VERSION,
        hash,
      };
      setAudit((a) => [entry, ...a]);
      return entry.id;
    },
    [auditN, eng.backend, eng.modelId]
  );

  const value = {
    tab, setTab,
    threshold, setThreshold,
    audit, addAudit,
    engine: eng,
    loadModel: (backend, modelId) => engine.load(backend, modelId),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export { now };
