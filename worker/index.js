// LabAgent Worker: serves the built app (./dist) and routes the agent API.
//
//   GET  /api/health                         agent availability, pinned model, config fingerprint
//   GET  /api/monitor                        aggregate monitoring + self-check history (Annex 22 §10.3–10.4)
//   POST /api/selfcheck                      run the self-check now (at most hourly)
//   POST /agents/lab-agent/<session>/<ask|query|sql|triage|event|review>
//   GET  /agents/lab-agent/<session>/audit   the session's hash-chained audit ledger
//
// Everything else is static assets. See docs/validation/functional-spec.md.

import { routeAgentRequest, getAgentByName } from "agents";
import { LabAgent, MONITOR } from "./agent.js";
import { workersAiLlm } from "./llm.js";
import { configFingerprint, CLOUD_MODEL, APP_VERSION } from "../src/compliance/config.js";
import { PROMPT_VERSION } from "../src/ai/prompts.js";

export { LabAgent };

const SESSION_PATH = /^\/agents\/lab-agent\/s-[0-9a-f]{24}\/(ask|query|sql|triage|event|review|audit)$/;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function limited(request, env) {
  if (!env.RATE_LIMIT) return false;
  try {
    const { success } = await env.RATE_LIMIT.limit({ key: request.headers.get("cf-connecting-ip") || "anonymous" });
    return !success;
  } catch {
    return false; // the limiter is a cost guard, not a safety control
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/health") {
      const v = env.CF_VERSION_METADATA;
      return json({
        service: "labagent-agent", ok: true, app: APP_VERSION, prompt: PROMPT_VERSION,
        llm: !!workersAiLlm(env), model: CLOUD_MODEL.id, modelLabel: CLOUD_MODEL.label,
        config: await configFingerprint(),
        worker: v ? { id: v.id, tag: v.tag || null, timestamp: v.timestamp || null } : null,
        identity: env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD ? "cloudflare-access" : "unverified",
      });
    }
    if (pathname === "/api/monitor" && request.method === "GET") {
      return json(await (await getAgentByName(env.LabAgent, MONITOR)).status());
    }
    if (pathname === "/api/selfcheck" && request.method === "POST") {
      if (await limited(request, env)) return json({ error: "Too many requests — try again in a minute." }, 429);
      return json(await (await getAgentByName(env.LabAgent, MONITOR)).selfCheck());
    }
    if (pathname.startsWith("/agents/")) {
      if (!SESSION_PATH.test(pathname)) return json({ error: "not found" }, 404);
      if (request.method === "POST" && (await limited(request, env))) return json({ error: "Too many requests — try again in a minute." }, 429);
      return (await routeAgentRequest(request, env)) ?? json({ error: "not found" }, 404);
    }
    if (pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
