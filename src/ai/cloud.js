// Client for the LabAgent Cloudflare agent (worker/). The agent runs the same
// pipeline server-side with a pinned Workers AI model, keeps the authoritative
// hash-chained audit trail, and monitors itself. Each browser session talks to
// its own agent instance; nothing here is trusted for record keeping — the
// agent writes its own audit entries.
//
// All paths are relative, so the app works under any base path. Where there is
// no agent (the GitHub Pages mirror, `vite dev`, offline) health() fails and
// the app stays in instant mode.

const SESSION_KEY = "labagent.session";

function newId() {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return "s-" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

let session = null;
export function sessionId() {
  if (session) return session;
  try {
    session = localStorage.getItem(SESSION_KEY);
    if (!/^s-[0-9a-f]{24}$/.test(session || "")) { session = newId(); localStorage.setItem(SESSION_KEY, session); }
  } catch {
    session = newId(); // storage blocked: one agent instance per page load
  }
  return session;
}

const agentUrl = (path) => `agents/lab-agent/${sessionId()}/${path}`;

async function call(path, body) {
  const res = await fetch(path, body === undefined
    ? { headers: { accept: "application/json" } }
    : { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const err = new Error(data?.error || `agent responded ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function health({ timeoutMs = 4000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch("api/health", { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.service === "labagent-agent" ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const cloud = {
  ask: ({ question, threshold, reviewer }) => call(agentUrl("ask"), { question, threshold, reviewer }),
  query: ({ question, reviewer }) => call(agentUrl("query"), { question, reviewer }),
  sql: ({ sql, reviewer }) => call(agentUrl("sql"), { sql, reviewer }),
  triage: ({ question, reviewer }) => call(agentUrl("triage"), { question, reviewer }),
  event: ({ kind, action, content, reviewer }) => call(agentUrl("event"), { kind, action, content, reviewer }),
  review: ({ ref, verdict, note, reviewer }) => call(agentUrl("review"), { ref, verdict, note, reviewer }),
  audit: () => call(agentUrl("audit")),
  monitor: () => call("api/monitor"),
};
