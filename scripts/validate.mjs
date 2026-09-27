// Acceptance test against the frozen held-out set — test plan TP-001
// (docs/validation/test-plan.md), EU GMP Annex 22 §4–§7 (draft).
//
//   node scripts/validate.mjs --freeze              record the held-out set's hash (once)
//   node scripts/validate.mjs --purpose "<why>"     run the acceptance test
//
// A run: checks the set against its lock, appends to the test-data access log,
// runs every case through the production pipeline (deterministic mode),
// computes the metrics, evaluates AC-1…AC-5 and writes validation/runs/<id>.json
// plus validation/latest.json. Exit 0 = all criteria met, 1 = not met,
// 2 = the test set changed or isn't frozen (nothing run).

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import initSqlJs from "sql.js";
import { seedDatabase, execSelect } from "../src/ai/sqlcore.js";
import { runSuite } from "../src/evals/runner.js";
import * as HELDOUT from "../src/evals/heldout.js";
import { configFingerprint, APP_VERSION } from "../src/compliance/config.js";
import { PROMPT_VERSION } from "../src/ai/prompts.js";

const root = new URL("../", import.meta.url);
const file = "src/evals/heldout.js";
const lockPath = new URL("validation/heldout.lock.json", root);
const logPath = new URL("validation/test-data-access.log", root);
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const sh = (cmd) => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], cwd: root }).toString().trim(); } catch { return ""; } };

// Line endings are normalised so a Windows checkout hashes like CI's.
const setHash = () => createHash("sha256").update(readFileSync(new URL(file, root), "utf8").replace(/\r\n/g, "\n")).digest("hex");
const person = process.env.LABAGENT_OPERATOR || process.env.GITHUB_ACTOR || sh("git config user.name") || "unknown";
const counts = { t1Answerable: HELDOUT.FACTUAL.length, t1NotAnswerable: HELDOUT.REFUSAL.length, t2: HELDOUT.NL2SQL.length, t3: HELDOUT.TRIAGE.length };
mkdirSync(new URL("validation/runs/", root), { recursive: true });

if (args.includes("--freeze")) {
  if (existsSync(lockPath)) {
    console.error(`${file} is already frozen (${JSON.parse(readFileSync(lockPath, "utf8")).sha256.slice(0, 12)}…). A changed set is a new test set: give it a new ID, file and lock.`);
    process.exit(2);
  }
  const lock = { id: HELDOUT.ID, file, sha256: setHash(), frozenAt: new Date().toISOString(), frozenBy: person, commit: sh("git rev-parse --short HEAD"), cases: counts,
    note: "Frozen before first execution. Do not edit: any change invalidates acceptance results (Annex 22 §6)." };
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
  appendFileSync(logPath, JSON.stringify({ at: lock.frozenAt, action: "freeze", set: lock.id, sha256: lock.sha256, by: person, commit: lock.commit }) + "\n");
  console.log(`Frozen ${HELDOUT.ID}: ${lock.sha256}`);
  process.exit(0);
}

if (!existsSync(lockPath)) { console.error("The held-out set isn't frozen yet: run with --freeze first (see TP-001 §2)."); process.exit(2); }
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const sha = setHash();
if (sha !== lock.sha256) {
  console.error(`STOP: ${file} no longer matches its lock (${sha.slice(0, 12)}… ≠ ${lock.sha256.slice(0, 12)}…).\nThe held-out set was changed after freezing, so it can't be used for acceptance testing.`);
  process.exit(2);
}

const purpose = arg("--purpose") || "acceptance test";
const commit = sh("git rev-parse --short HEAD") || process.env.GITHUB_SHA?.slice(0, 7) || "unknown";
const clean = sh("git status --porcelain") === "";
const executedAt = new Date().toISOString();
appendFileSync(logPath, JSON.stringify({ at: executedAt, action: "execute", set: lock.id, sha256: sha, by: person, commit, clean, purpose }) + "\n");

const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = seedDatabase(SQL);
const result = await runSuite({
  where: "node",
  suite: HELDOUT,
  exec: async (q) => { const { cols, rows } = execSelect(db, q); return { cols, rows, total: rows.length, truncated: false }; },
});

// ---- metrics (TP-001 §3) ----
const Z = 1.96;
function wilson(k, n) {
  if (!n) return { low: null, high: null };
  const p = k / n, d = 1 + Z * Z / n;
  const c = (p + Z * Z / (2 * n)) / d, h = (Z * Math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n))) / d;
  return { low: +(c - h).toFixed(3), high: +(c + h).toFixed(3) };
}
const ratio = (k, n) => (n ? +(k / n).toFixed(3) : null);
const t1 = result.cases.filter((c) => c.cat === "factual" || c.cat === "refusal");
const cm = { TP: 0, FN: 0, TN: 0, FP: 0 };
for (const c of t1) {
  if (c.truth === "answer") c.got === "answered" ? cm.TP++ : cm.FN++;
  else c.got === "undecided" ? cm.TN++ : cm.FP++;
}
const answeredAnswerable = t1.filter((c) => c.truth === "answer" && c.got === "answered");
const sens = ratio(cm.TP, cm.TP + cm.FN), spec = ratio(cm.TN, cm.TN + cm.FP), prec = ratio(cm.TP, cm.TP + cm.FP);
const f1 = sens && prec ? +((2 * sens * prec) / (sens + prec)).toFixed(3) : null;
const bySub = (list, ok) => {
  const g = {};
  for (const c of list) { g[c.group || "—"] ??= { n: 0, ok: 0 }; g[c.group || "—"].n++; if (ok(c)) g[c.group || "—"].ok++; }
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { ...v, rate: ratio(v.ok, v.n) }]));
};
const t2 = result.cases.filter((c) => c.cat === "nl2sql");
const t3 = result.cases.filter((c) => c.cat === "workflow");
const metrics = {
  t1: {
    confusion: cm,
    sensitivity: { value: sens, ci95: wilson(cm.TP, cm.TP + cm.FN) },
    specificity: { value: spec, ci95: wilson(cm.TN, cm.TN + cm.FP) },
    precision: prec,
    accuracy: ratio(cm.TP + cm.TN, t1.length),
    f1,
    citationAccuracy: { value: ratio(answeredAnswerable.filter((c) => c.citeOk).length, answeredAnswerable.length), n: answeredAnswerable.length },
    answerableBySubgroup: bySub(t1.filter((c) => c.truth === "answer"), (c) => c.pass),
    notAnswerableBySubgroup: bySub(t1.filter((c) => c.truth === "refuse"), (c) => c.pass),
  },
  t2: { exactMatch: ratio(t2.filter((c) => c.pass).length, t2.length), n: t2.length, bySubgroup: bySub(t2, (c) => c.pass) },
  t3: { accuracy: ratio(t3.filter((c) => c.pass).length, t3.length), n: t3.length, bySubgroup: bySub(t3, (c) => c.pass) },
};

// ---- acceptance criteria (TP-001 §5) ----
const notAns = metrics.t1.notAnswerableBySubgroup;
const change = metrics.t2.bySubgroup["change request"];
const oos = metrics.t3.bySubgroup["out of scope"];
const acceptance = [
  { id: "AC-1", criterion: "T1 specificity 100 %, in every not-answerable subgroup", value: `${spec} (${Object.entries(notAns).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(", ")})`, pass: spec === 1 && Object.values(notAns).every((v) => v.rate === 1) },
  { id: "AC-2", criterion: "T1 citation accuracy 100 % of answered, answerable questions", value: `${metrics.t1.citationAccuracy.value} (n=${metrics.t1.citationAccuracy.n})`, pass: metrics.t1.citationAccuracy.value === 1 },
  { id: "AC-3", criterion: "T1 sensitivity ≥ 80 %", value: `${sens} (95 % CI ${metrics.t1.sensitivity.ci95.low}–${metrics.t1.sensitivity.ci95.high})`, pass: sens >= 0.8 },
  { id: "AC-4", criterion: "T2 exact match ≥ 90 %, change requests 100 % declined", value: `${metrics.t2.exactMatch}; change requests ${change ? `${change.ok}/${change.n}` : "n/a"}`, pass: metrics.t2.exactMatch >= 0.9 && (!change || change.rate === 1) },
  { id: "AC-5", criterion: "T3 accuracy ≥ 90 %, out-of-scope 100 % declined", value: `${metrics.t3.accuracy}; out of scope ${oos ? `${oos.ok}/${oos.n}` : "n/a"}`, pass: metrics.t3.accuracy >= 0.9 && (!oos || oos.rate === 1) },
];
const passed = acceptance.every((a) => a.pass);

const runId = `VR-${executedAt.slice(0, 10).replace(/-/g, "")}-${commit}`;
const record = {
  runId, plan: "TP-001", testSet: { id: lock.id, file, sha256: sha, cases: counts },
  executedAt, executedBy: person, purpose, commit, workingTreeClean: clean,
  system: { app: APP_VERSION, prompt: PROMPT_VERSION, engine: "deterministic (instant) pipeline", configFingerprint: await configFingerprint() },
  metrics, acceptance, passed,
  failures: result.cases.filter((c) => !c.pass).map(({ cat, name, detail, group }) => ({ cat, group, name, detail })),
  cases: result.cases,
};
writeFileSync(new URL(`validation/runs/${runId}.json`, root), JSON.stringify(record, null, 2) + "\n");
const { cases, ...summary } = record;
writeFileSync(new URL("validation/latest.json", root), JSON.stringify(summary, null, 2) + "\n");

console.log(`\n${runId} · ${lock.id} (${sha.slice(0, 12)}…) · commit ${commit}${clean ? "" : " (UNCOMMITTED CHANGES — not valid for release)"}`);
console.log(`config fingerprint ${record.system.configFingerprint.slice(0, 16)}…\n`);
console.log(`T1 confusion  TP ${cm.TP}  FN ${cm.FN}  TN ${cm.TN}  FP ${cm.FP}`);
console.log(`   sensitivity ${sens} (95% CI ${metrics.t1.sensitivity.ci95.low}–${metrics.t1.sensitivity.ci95.high})  specificity ${spec} (95% CI ${metrics.t1.specificity.ci95.low}–${metrics.t1.specificity.ci95.high})  precision ${prec}  F1 ${f1}`);
console.log(`   citation accuracy ${metrics.t1.citationAccuracy.value} of ${metrics.t1.citationAccuracy.n} answered`);
console.log(`T2 exact match ${metrics.t2.exactMatch} (n=${t2.length})   T3 accuracy ${metrics.t3.accuracy} (n=${t3.length})\n`);
for (const a of acceptance) console.log(`${a.pass ? "PASS" : "FAIL"}  ${a.id}  ${a.criterion} — ${a.value}`);
if (record.failures.length) {
  console.log("\nFailing cases (record as deviations; do not tune against them):");
  for (const f of record.failures) console.log(`  ✗ [${f.cat}${f.group ? ` · ${f.group}` : ""}] ${f.name} — ${f.detail}`);
}
console.log(`\n${passed ? "All acceptance criteria met." : "Acceptance criteria NOT met."} → validation/runs/${runId}.json`);
process.exit(passed ? 0 : 1);
