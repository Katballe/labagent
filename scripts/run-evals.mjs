// Headless eval run — the same suite the Evals tab runs, in instant mode.
// Writes public/eval-results.json (shown on the site) and exits 1 if any
// category is below its target, so a regression fails the build and the deploy.
//
//   node scripts/run-evals.mjs            run + write results
//   node scripts/run-evals.mjs --verbose  also print every case

import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import { seedDatabase, execSelect } from "../src/ai/sqlcore.js";
import { runSuite } from "../src/evals/runner.js";
import { engine } from "../src/ai/engine.js";
import { PROMPT_VERSION } from "../src/ai/prompts.js";

const verbose = process.argv.includes("--verbose");
const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = seedDatabase(SQL);

const t0 = Date.now();
const result = await runSuite({
  where: "node",
  exec: async (sql) => {
    const { cols, rows } = execSelect(db, sql);
    return { cols, rows, total: rows.length, truncated: false };
  },
  rawExec: (sql) => db.run(sql),
});
const ms = Date.now() - t0;

let commit = process.env.GITHUB_SHA || "";
if (!commit) {
  try { commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { commit = "local"; }
}

const failures = result.cases.filter((c) => !c.pass);
const out = {
  generatedAt: new Date().toISOString(),
  commit: commit.slice(0, 7),
  engine: engine.label(),
  prompt: PROMPT_VERSION,
  runtimeMs: ms,
  passed: result.passed,
  total: result.cases.length,
  totalPassed: result.cases.length - failures.length,
  categories: result.categories.map(({ key, label, tier, note, target, env, n, passed, rate, pass }) => ({ key, label, tier, note, target, env, n, passed, rate, pass })),
  cases: result.cases,
};
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/eval-results.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nLabAgent evals · ${out.engine} · ${out.total} cases · ${ms} ms\n`);
for (const c of result.categories) {
  console.log(`${c.pass ? "PASS" : "FAIL"}  ${pad(c.label, 36)} ${pad(`${c.passed}/${c.n}`, 7)} target ${Math.round(c.target * 100)}%`);
}
const show = verbose ? result.cases : failures;
if (show.length) {
  console.log(verbose ? "\nAll cases:" : "\nFailing cases:");
  for (const c of show) console.log(`  ${c.pass ? "✓" : "✗"} [${c.cat}] ${c.name} — ${c.detail}`);
}
console.log(`\n${result.passed ? "All categories meet their targets." : "Some categories are below target."} → public/eval-results.json`);
process.exit(result.passed ? 0 : 1);
