// Read-only synthetic LIMS database, backed by a real in-browser SQLite
// (sql.js / WASM). The Tier 2 assistant writes SQL; we validate it is
// SELECT-only and execute it for real against this database. There is no write
// path — the guard rejects anything that is not a single read query.

import initSqlJs from "sql.js";
// Let Vite resolve and fingerprint the wasm binary itself. This works in dev,
// in the production build, and from a GitHub Pages sub-path.
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { SCHEMA, ROWS, NOW } from "../data/seed.js";

let _db = null;
let _loading = null;

function quote(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

export async function getDb() {
  if (_db) return _db;
  if (_loading) return _loading;
  _loading = (async () => {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    const db = new SQL.Database();
    db.run(SCHEMA);
    for (const [table, rows] of Object.entries(ROWS)) {
      for (const row of rows) {
        const placeholders = row.map(quote).join(", ");
        db.run(`INSERT INTO ${table} VALUES (${placeholders});`);
      }
    }
    _db = db;
    return db;
  })();
  return _loading;
}

// Validate a statement is a single, read-only SELECT. Returns {ok, reason}.
export function validateSelect(sql) {
  const cleaned = sql
    .replace(/--[^\n]*/g, " ") // line comments
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .trim()
    .replace(/;\s*$/, ""); // one trailing semicolon ok

  if (!cleaned) return { ok: false, reason: "empty statement" };
  if (cleaned.includes(";"))
    return { ok: false, reason: "multiple statements are not allowed" };
  if (!/^(select|with)\b/i.test(cleaned))
    return { ok: false, reason: "only SELECT queries are permitted" };
  const banned = /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|replace|vacuum|reindex|truncate)\b/i;
  if (banned.test(cleaned))
    return { ok: false, reason: "write/DDL keywords are forbidden" };

  return { ok: true, sql: cleaned };
}

// Runs a validated SELECT. Returns { cols, rows } or throws.
export async function runSelect(sql) {
  const v = validateSelect(sql);
  if (!v.ok) throw new Error("Rejected: " + v.reason);
  const db = await getDb();
  const res = db.exec(v.sql);
  if (!res.length) return { cols: [], rows: [] };
  const { columns, values } = res[0];
  return { cols: columns, rows: values };
}

export { NOW };
