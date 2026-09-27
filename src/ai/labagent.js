// Browser-side entry points for the three tiers. They pick where the pipeline
// runs: on the Cloudflare agent (the default when it is reachable), or here in
// the browser — deterministic (instant mode) or with a local model (WebLLM /
// Ollama). Results have the same shape either way; cloud results also carry
// the id of the audit entry the agent wrote.

import * as P from "./pipeline.js";
import { engine } from "./engine.js";
import { runSelect } from "./db.js";
import { cloud } from "./cloud.js";

export const onCloud = () => engine.backend === "cloud";

// The local model, if one is active; null means deterministic instant mode.
function localLlm() {
  if (engine.backend === "instant" || engine.backend === "cloud") return null;
  return { label: engine.label(), chat: (o) => engine.chat(o) };
}

export async function answerQuestion({ question, threshold, reviewer, onToken }) {
  if (onCloud()) {
    const res = await cloud.ask({ question, threshold, reviewer });
    onToken?.(res.text);
    return res;
  }
  return P.answerQuestion({ question, threshold, llm: localLlm(), onToken });
}

export async function runDataQuery({ question, reviewer }) {
  if (onCloud()) return cloud.query({ question, reviewer });
  return P.runDataQuery({ question, llm: localLlm(), exec: runSelect });
}

export const stepFinding = P.stepFinding;

export async function triageAnswer({ question, steps, reviewer, onToken }) {
  if (onCloud()) {
    const res = await cloud.triage({ question, reviewer });
    onToken?.(res.text);
    return res;
  }
  return P.triageAnswer({ question, steps, llm: localLlm(), onToken });
}
