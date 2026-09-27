// Workers AI adapter for the pipeline's `llm` interface. The model and its
// generation settings are pinned in src/compliance/config.js; the pipeline
// always passes temperature 0 and the fixed seed.

import { CLOUD_MODEL } from "../src/compliance/config.js";

export function workersAiLlm(env) {
  if (!env.AI || env.LLM_ENABLED === "false") return null;
  return {
    label: CLOUD_MODEL.id,
    async chat({ messages, temperature, seed, maxTokens, onToken }) {
      const out = await env.AI.run(CLOUD_MODEL.id, { messages, temperature, seed, max_tokens: maxTokens });
      const text = typeof out?.response === "string" ? out.response : String(out?.response ?? "");
      onToken?.(text);
      return text;
    },
  };
}
