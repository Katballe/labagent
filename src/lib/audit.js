// Hash-chained audit trail. Each entry stores the SHA-256 of its content and of
// the previous entry, and its own hash covers all of that — so editing, removing
// or reordering any entry breaks every link after it, which verifyChain() finds.
//
// This is tamper-EVIDENT, not tamper-proof: the log lives in this browser's
// localStorage, so anyone with the browser can clear it. A real GxP system keeps
// the chain on a server the user can't write to; the mechanism is the same.

import { sha256 } from "./hash.js";

export const GENESIS = "0".repeat(64);
export const STORAGE_KEY = "labagent.audit.v2";
export const MAX_CONTENT = 4000;

const FIELDS = ["seq", "id", "ts", "actor", "kind", "action", "model", "prompt", "contentHash", "prevHash"];
const canonical = (e) => JSON.stringify(FIELDS.map((k) => [k, e[k] ?? null]));

export function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const tz = `${off >= 0 ? "+" : "-"}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${tz}`;
}

/** Build the next entry after `prev` (or the first one when prev is undefined). */
export async function makeEntry(prev, { actor, kind, action, model, prompt, content = "", ts = timestamp() }) {
  const seq = prev ? prev.seq + 1 : 1;
  const stored = String(content).slice(0, MAX_CONTENT);
  const body = {
    seq,
    id: "AUD-" + String(seq).padStart(5, "0"),
    ts, actor, kind, action, model, prompt,
    content: stored,
    contentHash: await sha256(stored),
    prevHash: prev ? prev.hash : GENESIS,
  };
  return { ...body, hash: await sha256(canonical(body)) };
}

/** Recompute every hash and link. Entries are oldest first. */
export async function verifyChain(entries) {
  let prevHash = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const at = e?.id || `#${i + 1}`;
    if (e.seq !== i + 1) return { ok: false, checked: i, brokenAt: at, reason: `sequence gap — expected entry ${i + 1}, found ${e.seq} (an entry was removed or reordered)` };
    if (e.prevHash !== prevHash) return { ok: false, checked: i, brokenAt: at, reason: "its link to the previous entry doesn't match (an earlier entry was changed, removed or reordered)" };
    if ((await sha256(e.content ?? "")) !== e.contentHash) return { ok: false, checked: i, brokenAt: at, reason: "its recorded content no longer matches its content hash" };
    if ((await sha256(canonical(e))) !== e.hash) return { ok: false, checked: i, brokenAt: at, reason: "its fields were edited after it was written" };
    prevHash = e.hash;
  }
  return { ok: true, checked: entries.length };
}

export function loadAudit() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Returns false if the browser refused to store it (private mode, quota). */
export function saveAudit(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

export function clearAudit() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing stored */ }
}
