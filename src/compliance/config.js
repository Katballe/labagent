// Configuration under change control (EU GMP Annex 22 §10.1–10.2, draft).
// Everything that determines what LabAgent answers is pinned here or in the
// data files, and hashed into one configuration fingerprint. The fingerprint is
// recorded with every audit entry and compared with the validated one, so an
// unauthorised or untested change is visible.

import { PROMPT_VERSION, T1_SYSTEM, T2_SYSTEM, T3_TRIAGE_SYSTEM } from "../ai/prompts.js";
import { KNOWLEDGE } from "../data/knowledge.js";
import { CORPUS, OOS_STEPS, OOS_DRAFT } from "../data/dataset.js";
import { SCHEMA, ROWS, NOW } from "../data/seed.js";
import { sha256 } from "../lib/hash.js";

export const APP_VERSION = "2.0.0";

// Language-model generation settings, identical for every backend. Temperature
// 0 and a fixed seed make output as repeatable as the runtime allows; the
// agent's daily self-check measures whether it actually is.
export const GENERATION = Object.freeze({ temperature: 0, seed: 20260927, maxTokens: { t1: 500, t2: 300, t3: 350 } });

// The Cloudflare agent's model. Pinned: a different model is a change that
// needs impact assessment and re-testing (see docs/operations/model-lifecycle.md).
export const CLOUD_MODEL = Object.freeze({
  id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  label: "Llama 3.3 70B (Workers AI)",
});

// Retrieval refusal threshold (Annex 22 §9.2): below it, the outcome is UNDECIDED.
export const DEFAULT_THRESHOLD = 0.6;

export function configDescriptor() {
  return {
    app: APP_VERSION,
    prompt: PROMPT_VERSION,
    prompts: [T1_SYSTEM, T2_SYSTEM, T3_TRIAGE_SYSTEM],
    generation: GENERATION,
    cloudModel: CLOUD_MODEL.id,
    threshold: DEFAULT_THRESHOLD,
    corpus: { docs: CORPUS, chunks: KNOWLEDGE },
    workflow: { steps: OOS_STEPS, draft: OOS_DRAFT },
    database: { schema: SCHEMA, rows: ROWS, now: NOW },
  };
}

let cached = null;
/** SHA-256 over the canonical configuration. Same value in the browser, the agent and the build. */
export function configFingerprint() {
  return (cached ??= sha256(JSON.stringify(configDescriptor())));
}
