// Read-only synthetic LIMS database (sql.js / SQLite) — client side.
// Queries are validated here (fast, friendly rejection) and executed in a Web
// Worker whose database is also locked read-only at the engine level. A query
// that runs longer than QUERY_TIMEOUT_MS is stopped by terminating the worker;
// the next query starts a fresh one.

import { validateSelect } from "./sqlcore.js";
export { NOW } from "../data/seed.js";
export { validateSelect };

export const QUERY_TIMEOUT_MS = 3000;
export const ROW_LIMIT = 500;

let worker = null;
let seq = 0;
const pending = new Map();

function failAll(message) {
  for (const [, p] of pending) { clearTimeout(p.timer); p.reject(new Error(message)); }
  pending.clear();
}

function spawn() {
  worker = new Worker(new URL("./db.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    clearTimeout(p.timer);
    if (e.data.error) p.reject(new Error(e.data.error));
    else p.resolve(e.data);
  };
  worker.onerror = (e) => {
    failAll("database worker failed: " + (e.message || "unknown error"));
    worker?.terminate();
    worker = null;
  };
}

/** Start the worker (and load + seed the database) ahead of the first query. */
export function warmDb() {
  if (!worker) spawn();
}

/** Runs a validated SELECT. Resolves { cols, rows, truncated, total }; rejects on rejection, SQL error or timeout. */
export function runSelect(sql, { timeoutMs = QUERY_TIMEOUT_MS } = {}) {
  const v = validateSelect(sql);
  if (!v.ok) return Promise.reject(new Error("Rejected: " + v.reason));
  if (!worker) spawn();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      worker?.terminate(); // the only way to stop a query that won't finish
      worker = null;
      failAll("database restarted");
      const err = new Error(`Query stopped after ${timeoutMs / 1000} s — nothing was written (read-only). The database restarts for the next query.`);
      err.timeout = true;
      reject(err);
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, sql: v.sql });
  }).then(({ cols, rows }) => ({ cols, rows: rows.slice(0, ROW_LIMIT), truncated: rows.length > ROW_LIMIT, total: rows.length }));
}
