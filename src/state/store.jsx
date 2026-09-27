import React, {
  createContext, useContext, useState, useCallback, useRef, useSyncExternalStore,
} from "react";
import { engine } from "../ai/engine.js";
import { PROMPT_VERSION } from "../ai/prompts.js";
import { makeEntry, loadAudit, saveAudit, clearAudit } from "../lib/audit.js";

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

const REVIEWER_KEY = "labagent.reviewer";
export const DEFAULT_REVIEWER = "demo-user";

function readReviewer() {
  try { return localStorage.getItem(REVIEWER_KEY) || DEFAULT_REVIEWER; } catch { return DEFAULT_REVIEWER; }
}

export function AppProvider({ children }) {
  const [tab, setTab] = useState("assistant");
  const [threshold, setThreshold] = useState(0.6);
  const [engineOpen, setEngineOpen] = useState(false);
  const [reviewer, setReviewerState] = useState(readReviewer);
  const reviewerRef = useRef(reviewer);
  const [audit, setAudit] = useState(loadAudit); // oldest first
  const [persisted, setPersisted] = useState(true);
  const auditRef = useRef(audit);
  const queue = useRef(Promise.resolve());
  const eng = useEngine();

  const setReviewer = useCallback((name) => {
    const clean = String(name || "").trim().slice(0, 40) || DEFAULT_REVIEWER;
    reviewerRef.current = clean;
    setReviewerState(clean);
    try { localStorage.setItem(REVIEWER_KEY, clean); } catch { /* per-session only */ }
  }, []);

  // Append to the hash-chained audit trail. Appends are serialised, so two
  // events in quick succession can never read the same "previous" entry.
  const addAudit = useCallback((kind, action, content = "", { model } = {}) => {
    const append = async () => {
      const prev = auditRef.current[auditRef.current.length - 1];
      const entry = await makeEntry(prev, {
        actor: reviewerRef.current,
        kind,
        action,
        model: model ?? engine.label(),
        prompt: PROMPT_VERSION,
        content,
      });
      auditRef.current = [...auditRef.current, entry];
      setAudit(auditRef.current);
      setPersisted(saveAudit(auditRef.current));
      return entry.id;
    };
    const p = queue.current.then(append, append);
    queue.current = p.catch(() => {});
    return p;
  }, []);

  const resetAudit = useCallback(() => {
    queue.current = queue.current.then(() => {
      clearAudit();
      auditRef.current = [];
      setAudit([]);
    });
    return queue.current;
  }, []);

  const value = {
    tab, setTab,
    threshold, setThreshold,
    reviewer, setReviewer,
    audit, addAudit, resetAudit, auditPersisted: persisted,
    engine: eng,
    engineOpen, setEngineOpen,
    loadModel: (backend, modelId) => engine.load(backend, modelId),
    switchToInstant: () => engine.switchToInstant(),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
