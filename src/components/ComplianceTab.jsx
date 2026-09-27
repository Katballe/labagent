import React, { useEffect, useMemo, useState } from "react";
import { css } from "../lib/css.js";
import { useApp } from "../state/store.jsx";
import { cloud } from "../ai/cloud.js";
import { configFingerprint, CLOUD_MODEL, GENERATION, APP_VERSION } from "../compliance/config.js";
import { PROMPT_VERSION } from "../ai/prompts.js";
import { REGULATION, FUNCTIONS, ANNEX22, DOCS_BASE } from "../compliance/intendedUse.js";

const VALIDATION = Object.values(import.meta.glob("../../validation/latest.json", { eager: true, import: "default" }))[0] || null;
const mono = "font-family:'IBM Plex Mono',monospace";
const STATUS = { met: ["#DCEFE2", "#1E6E43", "MET"], partial: ["#F8F0DE", "#6E5410", "PARTIAL"], open: ["#F4E3E1", "#A33025", "OPEN"] };

function Section({ title, sub, children }) {
  return (
    <div style={css("display:flex;flex-direction:column;gap:8px")}>
      <div style={css("display:flex;align-items:baseline;gap:10px;flex-wrap:wrap")}>
        <span style={css("font-weight:600;font-size:12.5px")}>{title}</span>
        {sub && <span style={css("font-size:11px;color:#5A6663")}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function Fp({ label, value, match }) {
  return (
    <div style={css("display:flex;align-items:center;gap:8px;font-size:11px")}>
      <span style={css("width:170px;color:#5A6663;flex:none")}>{label}</span>
      <span style={css(`${mono};font-size:10.5px;color:#1C2422`)}>{value ? `${value.slice(0, 16)}…` : "—"}</span>
      {match != null && (
        <span style={{ ...css(`${mono};font-size:9px;font-weight:600;padding:1px 6px;border-radius:2px`), background: match ? "#DCEFE2" : "#F4E3E1", color: match ? "#1E6E43" : "#A33025" }}>{match ? "MATCHES" : "DIFFERS"}</span>
      )}
    </div>
  );
}

function sumDays(days) {
  const total = {};
  for (const d of Object.values(days || {})) for (const [k, n] of Object.entries(d)) total[k] = (total[k] || 0) + n;
  return total;
}

export default function ComplianceTab() {
  const { engine: eng, audit, ledger } = useApp();
  const [fp, setFp] = useState(null);
  const [mon, setMon] = useState(null);
  const [monErr, setMonErr] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => { configFingerprint().then(setFp); }, []);
  const loadMonitor = () => cloud.monitor().then((m) => { setMon(m); setMonErr(null); }).catch((e) => setMonErr(e.message));
  useEffect(() => { if (eng.cloud) loadMonitor(); }, [eng.cloud]);

  async function runCheck() {
    setChecking(true);
    try {
      const res = await fetch("api/selfcheck", { method: "POST" }).then((r) => r.json());
      if (res.error) setMonErr(res.error);
      await loadMonitor();
    } finally {
      setChecking(false);
    }
  }

  // Session statistics from whichever ledger is active (useful without the agent too).
  const session = useMemo(() => {
    const s = { t1: 0, answered: 0, undecided: 0, reviews: 0, confirmed: 0, incorrect: 0 };
    for (const e of audit) {
      if (e.kind === "T1") { s.t1++; /UNDECIDED|refused|withheld/i.test(e.action) ? s.undecided++ : s.answered++; }
      if (e.kind === "REVIEW") { s.reviews++; /CONFIRMED/.test(e.action) ? s.confirmed++ : s.incorrect++; }
    }
    return s;
  }, [audit]);

  const agentFp = eng.cloudInfo?.config || null;
  const validatedFp = VALIDATION?.system?.configFingerprint || null;
  const totals = sumDays(mon?.days);
  const lastCheck = mon?.checks?.[0];

  return (
    <div style={css("flex:1;overflow-y:auto;min-width:0;background:#F7F8F7")}>
      <div style={css("display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid #D9DDDB;background:#EFF1F0;position:sticky;top:0;z-index:5")}>
        <span style={css("font-weight:600;font-size:13px")}>Compliance</span>
        <span style={css("font-size:11px;color:#5A6663")}>Designed against {REGULATION.name} — intended use, configuration control, monitoring.</span>
        <div style={css("flex:1")} />
        <a href={`${DOCS_BASE}README.md`} target="_blank" rel="noreferrer" style={css(`${mono};font-size:10px;color:#0A4F47`)}>validation documents ↗</a>
      </div>

      <div style={css("padding:18px;display:flex;flex-direction:column;gap:20px;max-width:1120px")}>
        <div style={css("border:1px solid #E0CD9E;background:#F8F0DE;border-radius:5px;padding:10px 13px;font-size:11.5px;line-height:1.6;color:#4E3C0B")}>
          <b>Regulatory status.</b> {REGULATION.status} {REGULATION.note}{" "}
          <a href={REGULATION.source} target="_blank" rel="noreferrer" style={css("color:#6E5410")}>Draft text ↗</a>
          <br /><b>System status.</b> Demonstration system with synthetic data. Validation documents exist but are <b>not approved</b>; open items are listed in the validation report.
        </div>

        <Section title="Intended use and criticality" sub="Annex 22 §1, §3 — only deterministic logic decides; AI assists only in non-critical, human-reviewed tasks">
          <div style={css("border:1px solid #C6CCC9;border-radius:5px;overflow:hidden")}>
            {FUNCTIONS.map((f) => (
              <div key={f.id} style={css("display:grid;grid-template-columns:150px 170px 1fr 1fr 1fr;border-bottom:1px solid #E6E9E7;background:#fff")}>
                <div style={css("padding:9px 10px;display:flex;flex-direction:column;gap:2px")}>
                  <span style={css("font-size:12px;font-weight:600")}>{f.name}</span>
                  <span style={css(`${mono};font-size:9.5px;color:#9AA6A2`)}>{f.id} · {f.tier}</span>
                </div>
                <div style={css("padding:9px 10px")}>
                  <span style={{ ...css(`${mono};font-size:9.5px;font-weight:600;padding:2px 7px;border-radius:3px;display:inline-block;line-height:1.4`), background: f.critical ? "#F4E3E1" : "#E4EEEC", color: f.critical ? "#A33025" : "#0A4F47" }}>{f.criticality}</span>
                </div>
                {[["Decides", f.decides], ["AI role", f.ai], ["Human", f.human]].map(([h, t]) => (
                  <div key={h} style={css("padding:9px 10px;font-size:11px;line-height:1.5;color:#3A4744")}>
                    <div style={css(`${mono};font-size:9px;color:#9AA6A2;margin-bottom:2px`)}>{h.toUpperCase()}</div>{t}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Configuration control" sub="Annex 22 §10.1–10.2 — every audit entry carries the fingerprint; a mismatch with the validated run means an untested change">
          <div style={css("border:1px solid #C6CCC9;border-radius:5px;padding:10px 13px;background:#fff;display:flex;flex-direction:column;gap:5px")}>
            <Fp label="This app (browser)" value={fp} match={validatedFp ? fp === validatedFp : null} />
            <Fp label="Cloudflare agent" value={agentFp} match={agentFp && validatedFp ? agentFp === validatedFp : null} />
            <Fp label={`Validated run ${VALIDATION?.runId || "(none yet)"}`} value={validatedFp} />
            <div style={css(`${mono};font-size:10px;color:#71807B;line-height:1.7;margin-top:4px`)}>
              app v{APP_VERSION} · prompt {PROMPT_VERSION} · agent model {CLOUD_MODEL.id} · temperature {GENERATION.temperature} · seed {GENERATION.seed}
              {eng.cloudInfo?.worker ? ` · worker version ${eng.cloudInfo.worker.tag || eng.cloudInfo.worker.id?.slice(0, 8)}` : ""}
            </div>
            <div style={css("font-size:10.5px;color:#71807B")}>The fingerprint covers prompts, generation settings, the pinned model, the retrieval threshold, the document corpus, the OOS workflow and the database seed. Code changes are covered by the commit recorded with each validation run.</div>
          </div>
        </Section>

        <Section title="Monitoring" sub="Annex 22 §10.3–10.5 — performance, input drift, human review">
          {eng.cloud ? (
            <div style={css("border:1px solid #C6CCC9;border-radius:5px;padding:10px 13px;background:#fff;display:flex;flex-direction:column;gap:10px")}>
              {monErr && <div style={css("font-size:11px;color:#A33025")}>{monErr}</div>}
              {!mon && !monErr && <div style={css("font-size:11px;color:#71807B")}>Loading the agent's monitor…</div>}
              {mon && (
                <>
                  <div style={css(`${mono};font-size:11px;line-height:1.8;color:#3A4744`)}>
                    last 14 days (all sessions): T1 answered {totals["t1:answered"] || 0} · undecided {totals["t1:undecided"] || 0} · withheld by citation check {totals["t1:reason:citation-check"] || 0}
                    <br />human reviews: confirmed {totals["review:confirmed"] || 0} · incorrect {totals["review:incorrect"] || 0}
                    {(totals["review:confirmed"] || 0) + (totals["review:incorrect"] || 0) > 0 && ` · override rate ${Math.round(100 * (totals["review:incorrect"] || 0) / ((totals["review:confirmed"] || 0) + (totals["review:incorrect"] || 0)))} %`}
                    <br />AI calls {totals["llm-calls"] || 0} (daily cap {mon.dailyCap}) · model {mon.llm ? mon.model.id : "not available — deterministic"}
                  </div>
                  <div style={css("font-size:11px;color:#3A4744")}>
                    <span style={css("color:#5A6663")}>Input drift — words asked about that the corpus doesn't contain (7 days): </span>
                    {mon.unknownTerms?.length ? mon.unknownTerms.map((t) => `${t.term} (${t.n})`).join(", ") : "none"}
                  </div>
                  <div style={css("display:flex;align-items:center;gap:10px;flex-wrap:wrap")}>
                    <span style={css("font-size:11px;color:#5A6663")}>Self-check:</span>
                    {lastCheck ? (
                      <span style={css(`${mono};font-size:10.5px;color:${lastCheck.suite?.passed ? "#1E6E43" : "#A33025"}`)}>
                        {new Date(lastCheck.at).toLocaleString()} · suite {lastCheck.suite?.passed ? "PASS" : "FAIL"} ({lastCheck.suite?.total} cases)
                        {lastCheck.determinism?.skipped ? ` · determinism: ${lastCheck.determinism.skipped}` : lastCheck.determinism?.error ? ` · determinism: error` : ` · determinism: ${lastCheck.determinism?.identical ? "identical output" : "OUTPUT DIFFERED"}, ${lastCheck.determinism?.cited ? "cited" : "NOT cited"}`}
                      </span>
                    ) : <span style={css("font-size:11px;color:#71807B")}>not run yet (daily at 03:15 UTC)</span>}
                    <button onClick={runCheck} disabled={checking} style={css("font-size:11px;padding:4px 10px;border:1px solid #C6CCC9;background:#fff;border-radius:4px;cursor:pointer")}>{checking ? "Running…" : "Run now"}</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={css("border:1px solid #C6CCC9;border-radius:5px;padding:10px 13px;background:#fff;font-size:11px;color:#3A4744;line-height:1.7")}>
              The Cloudflare agent isn't active here, so there is no server-side monitoring. This session ({ledger} ledger): {session.t1} SOP questions ·
              {" "}{session.answered} answered · {session.undecided} undecided · {session.reviews} human reviews ({session.confirmed} confirmed, {session.incorrect} incorrect).
            </div>
          )}
        </Section>

        <Section title="Annex 22 clause status" sub="Honest status for this demonstration system — detail and evidence in the assessment">
          <div style={css("border:1px solid #C6CCC9;border-radius:5px;overflow:hidden")}>
            {ANNEX22.map((a) => {
              const [bg, fg, label] = STATUS[a.status];
              return (
                <div key={a.clause} style={css("display:grid;grid-template-columns:230px 78px 1fr;border-bottom:1px solid #E6E9E7;background:#fff;align-items:center")}>
                  <div style={css("padding:7px 10px;font-size:11.5px;font-weight:600")}>{a.clause}</div>
                  <div style={css("padding:7px 6px")}><span style={{ ...css(`${mono};font-size:9px;font-weight:600;padding:2px 7px;border-radius:3px`), background: bg, color: fg }}>{label}</span></div>
                  <div style={css("padding:7px 10px;font-size:11px;color:#3A4744;line-height:1.5")}>{a.how}</div>
                </div>
              );
            })}
          </div>
          <a href={`${DOCS_BASE}compliance/annex-22-assessment.md`} target="_blank" rel="noreferrer" style={css("font-size:11px;color:#0A4F47")}>Full Annex 22 assessment with evidence ↗</a>
        </Section>
      </div>
    </div>
  );
}
