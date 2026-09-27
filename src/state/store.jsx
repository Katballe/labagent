import React, {
  createContext, useContext, useState, useCallback, useEffect, useRef, useSyncExternalStore,
} from "react";
import { engine } from "../ai/engine.js";
import { cloud } from "../ai/cloud.js";
import { PROMPT_VERSION } from "../ai/prompts.js";
import { configFingerprint, DEFAULT_THRESHOLD } from "../compliance/config.js";
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

// Two audit ledgers, one shape:
//   • cloud — kept by the Cloudflare agent (authoritative when the agent is the
//     engine). The agent writes entries for everything it answers; the browser
//     only adds client events (workflow steps, approvals, reviews) through it.
//   • local — kept in this browser (instant mode and local models).
export function AppProvider({ children }) {
  const [tab, setTab] = useState("assistant");
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [engineOpen, setEngineOpen] = useState(false);
  const [reviewer, setReviewerState] = useState(readReviewer);
  const reviewerRef = useRef(reviewer);
  const [localAudit, setLocalAudit] = useState(loadAudit); // oldest first
  const [cloudAudit, setCloudAudit] = useState({ entries: [], verification: null, error: null, loaded: false });
  const [persisted, setPersisted] = useState(true);
  const auditRef = useRef(localAudit);
  const queue = useRef(Promise.resolve());
  const eng = useEngine();
  const onCloud = eng.backend === "cloud";

  // The agent is the default engine wherever it is deployed.
  useEffect(() => { engine.connectCloud({ quiet: true }); }, []);

  const setReviewer = useCallback((name) => {
    const clean = String(name || "").trim().slice(0, 40) || DEFAULT_REVIEWER;
    reviewerRef.current = clean;
    setReviewerState(clean);
    try { localStorage.setItem(REVIEWER_KEY, clean); } catch { /* per-session only */ }
  }, []);

  const refreshAudit = useCallback(async () => {
    if (engine.backend !== "cloud") return;
    try {
      const data = await cloud.audit();
      setCloudAudit({ entries: data.entries || [], verification: data.verification || null, error: null, loaded: true });
    } catch (e) {
      setCloudAudit((s) => ({ ...s, error: e.message, loaded: true }));
    }
  }, []);
  useEffect(() => { if (onCloud) refreshAudit(); }, [onCloud, refreshAudit]);

  // Append a client event. Local appends are serialised, so two events in quick
  // succession can never read the same "previous" entry; the agent serialises its own.
  const addAudit = useCallback((kind, action, content = "", { model } = {}) => {
    if (engine.backend === "cloud") {
      return cloud.event({ kind, action, content, reviewer: reviewerRef.current })
        .then((r) => { refreshAudit(); return r.auditId; });
    }
    const append = async () => {
      const prev = auditRef.current[auditRef.current.length - 1];
      const entry = await makeEntry(prev, {
        actor: `${reviewerRef.current} (unverified)`,
        kind,
        action,
        model: model ?? engine.label(),
        prompt: PROMPT_VERSION,
        content: JSON.stringify({ detail: content, config: await configFingerprint() }),
      });
      auditRef.current = [...auditRef.current, entry];
      setLocalAudit(auditRef.current);
      setPersisted(saveAudit(auditRef.current));
      return entry.id;
    };
    const p = queue.current.then(append, append);
    queue.current = p.catch(() => {});
    return p;
  }, [refreshAudit]);

  /** The id of the entry for a pipeline result: the agent already wrote one; locally, write it now. */
  const logResult = useCallback(async (res, kind, action, content) => {
    if (res?.auditId) { refreshAudit(); return res.auditId; }
    return addAudit(kind, action, content);
  }, [addAudit, refreshAudit]);

  /** Human-in-the-loop verdict on an answer (EU GMP Annex 22 §10.5, draft). */
  const recordReview = useCallback(async (ref, verdict, kindLabel) => {
    if (engine.backend === "cloud") {
      const r = await cloud.review({ ref, verdict, reviewer: reviewerRef.current });
      if (r.error) throw new Error(r.error);
      refreshAudit();
      return r.auditId;
    }
    return addAudit("REVIEW", `Human review of ${ref}${kindLabel ? ` (${kindLabel})` : ""}: ${verdict.toUpperCase()}`, JSON.stringify({ ref, verdict }), { model: "—" });
  }, [addAudit, refreshAudit]);

  const resetAudit = useCallback(() => {
    queue.current = queue.current.then(() => {
      clearAudit();
      auditRef.current = [];
      setLocalAudit([]);
    });
    return queue.current;
  }, []);

  const value = {
    tab, setTab,
    threshold, setThreshold,
    reviewer, setReviewer,
    ledger: onCloud ? "cloud" : "local",
    audit: onCloud ? cloudAudit.entries : localAudit,
    cloudAudit, refreshAudit,
    addAudit, logResult, recordReview, resetAudit, auditPersisted: persisted,
    engine: eng,
    engineOpen, setEngineOpen,
    loadModel: (backend, modelId) => engine.load(backend, modelId),
    switchToInstant: () => engine.switchToInstant(),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
