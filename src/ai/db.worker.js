// Runs the read-only SQLite database off the main thread, so a slow or runaway
// query can never freeze the page — the main thread just terminates this worker.

import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { seedDatabase, execSelect } from "./sqlcore.js";

let dbPromise = null;
const getDb = () => (dbPromise ??= initSqlJs({ locateFile: () => wasmUrl }).then(seedDatabase));

self.onmessage = async (e) => {
  const { id, sql } = e.data;
  try {
    const db = await getDb();
    self.postMessage({ id, ...execSelect(db, sql) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
