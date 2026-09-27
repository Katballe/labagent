// The synthetic LIMS database inside the agent: sql.js (SQLite compiled to
// WebAssembly), seeded from src/data/seed.js and locked with PRAGMA query_only —
// the same read-only engine the browser uses. One copy per agent instance.

import initSqlJs from "sql.js";
import wasmModule from "sql.js/dist/sql-wasm-browser.wasm";
import { seedDatabase, execSelect } from "../src/ai/sqlcore.js";

export const ROW_LIMIT = 500;
// Server policy: recursion is refused, because a runaway query can't be
// interrupted here the way the browser kills its worker.
export const GUARD = Object.freeze({ allowRecursive: false });

// sql.js's browser build sees Workers as a web worker and reads self.location
// while it starts, which Workers don't have. Provide a stand-in for exactly
// that synchronous start-up, then remove it again. (The WASM itself is passed
// in below, so the URL is never fetched.)
function withLocation(fn) {
  if (globalThis.location) return fn();
  Object.defineProperty(globalThis, "location", { value: { href: "https://labagent.invalid/" }, configurable: true });
  try { return fn(); } finally { delete globalThis.location; }
}

let dbPromise = null;
function getDb() {
  return (dbPromise ??= withLocation(() => initSqlJs({
    instantiateWasm(imports, done) {
      WebAssembly.instantiate(wasmModule, imports).then((instance) => done(instance));
      return {};
    },
  })).then(seedDatabase).catch((e) => { dbPromise = null; throw e; }));
}

/** exec() for the pipeline: validated, read-only, capped. */
export async function execReadOnly(sql) {
  const db = await getDb();
  const { cols, rows } = execSelect(db, sql, GUARD);
  return { cols, rows: rows.slice(0, ROW_LIMIT), total: rows.length, truncated: rows.length > ROW_LIMIT };
}

/** Bypasses the guard — used only by the self-check to prove SQLite itself refuses writes. */
export async function rawExec(sql) {
  (await getDb()).run(sql);
}
