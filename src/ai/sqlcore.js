// Database core shared by the browser worker and the headless evals.
// Two independent read-only guarantees:
//   1. validateSelect() — only a single SELECT/WITH statement gets through;
//      a small lexer blanks out strings/comments first, so their contents can
//      neither trip the checks nor hide a statement from them.
//   2. PRAGMA query_only — the SQLite engine itself refuses every write, so even
//      a query that slipped past (1) could not change anything.

import { SCHEMA, ROWS } from "../data/seed.js";

/** Split SQL into what will run (comments removed) and a skeleton with literals blanked. */
function scan(sql) {
  let exec = "", skel = "";
  for (let i = 0; i < sql.length; ) {
    const c = sql[i], n = sql[i + 1];
    if (c === "-" && n === "-") { const j = sql.indexOf("\n", i); i = j < 0 ? sql.length : j; exec += " "; skel += " "; continue; }
    if (c === "/" && n === "*") { const j = sql.indexOf("*/", i + 2); i = j < 0 ? sql.length : j + 2; exec += " "; skel += " "; continue; }
    if (c === "'" || c === '"' || c === "`" || c === "[") {
      const close = c === "[" ? "]" : c;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === close) { if (close !== "]" && sql[j + 1] === close) { j += 2; continue; } break; }
        j++;
      }
      exec += sql.slice(i, j + 1); skel += c + close; i = j + 1;
      continue;
    }
    exec += c; skel += c; i++;
  }
  return { exec: exec.trim(), skel: skel.trim() };
}

const WRITE_WORDS = /\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|reindex|truncate|begin|commit|rollback|savepoint|release)\b|\breplace\s+into\b|\bor\s+replace\b/i;

// Validate a statement is a single, read-only SELECT. Returns {ok, sql} or {ok:false, reason}.
// The Cloudflare agent also passes { allowRecursive: false }: it can't kill a
// runaway query the way the browser can (by terminating its worker), so
// recursion — never needed for LIMS look-ups — is refused up front there.
export function validateSelect(sql, { allowRecursive = true } = {}) {
  const { exec, skel } = scan(String(sql ?? ""));
  const body = skel.replace(/;\s*$/, "");
  if (!body) return { ok: false, reason: "empty statement" };
  if (body.includes(";")) return { ok: false, reason: "multiple statements are not allowed" };
  if (!/^(select|with)\b/i.test(body)) return { ok: false, reason: "only SELECT queries are permitted" };
  if (WRITE_WORDS.test(body)) return { ok: false, reason: "write/DDL keywords are forbidden" };
  if (!allowRecursive && /\brecursive\b/i.test(body)) return { ok: false, reason: "recursive queries are not allowed" };
  return { ok: true, sql: exec.replace(/;\s*$/, "") };
}

function quote(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/** Build the synthetic LIMS database, then lock it read-only at the engine level. */
export function seedDatabase(SQL) {
  const db = new SQL.Database();
  db.run(SCHEMA);
  for (const [table, rows] of Object.entries(ROWS)) {
    for (const row of rows) db.run(`INSERT INTO ${table} VALUES (${row.map(quote).join(", ")});`);
  }
  db.run("PRAGMA query_only = ON;");
  return db;
}

/** Validate, then execute. Returns { cols, rows }; throws on rejection or SQL error. */
export function execSelect(db, sql, opts) {
  const v = validateSelect(sql, opts);
  if (!v.ok) throw new Error("Rejected: " + v.reason);
  const res = db.exec(v.sql);
  if (!res.length) return { cols: [], rows: [] };
  return { cols: res[0].columns, rows: res[0].values };
}
