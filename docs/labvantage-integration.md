# LabAgent and LabVantage LIMS — applicability and implementation

| | |
|---|---|
| Document | INT-001, version 1.0 (analysis, not a validated design) |
| Date | 27 September 2026 |
| Basis | Public LabVantage documentation and announcements (sources at the end); LabAgent v2.0 |

## 1. Short answer

LabAgent maps directly onto LabVantage work. Each of its three functions has a LabVantage home:
answering SOP and method questions at the bench, read-only look-ups over LIMS data, and assembling a
Phase 1 OOS investigation when LabVantage flags an out-of-specification result.

It fits best **beside** LabVantage as a separately validated system that reads from LabVantage and
never writes to it:

- It reads through LabVantage's REST web services with a read-only service account.
- It is reached over a private tunnel.
- It uses the same single sign-on as LabVantage.
- It hands every decision back to a person, who records it in LabVantage or the QMS with LabVantage's
  own e-signature.

LabVantage now has its own AI platform, **CORTEX** (launched 5 March 2026). A LabVantage customer
should compare the two. LabAgent's deterministic-first, Annex 22-shaped design gives a concrete
yardstick for that comparison, and it covers any use case CORTEX doesn't.

## 2. What LabVantage offers for integration (verified)

| Capability | What the public documentation says |
|---|---|
| REST web services | Client requests via REST-style web services. The API documentation is served by the LabVantage instance at `/rest/api` and **shows only the resources enabled in the RESTPolicy**. REST must be enabled in the **SecurityPolicy** (REST Services section) and the **RESTPolicy**. Returned columns for SDC resources are defined in the RESTPolicy. HTTPS is recommended as the basic level of security. |
| Authentication | Only `GET /rest` and `POST /rest/connections` work without a **ConnectionId**; everything else needs one (passed as a request parameter only if the security policy allows it). LabVantage also documents **token authentication for external applications**. |
| SOAP web services | Axis and JAX web services are documented alongside REST. |
| Middleware | LabVantage Enterprise Connector (integration product). Third-party connectors (e.g. Tulip) use the REST API with GET/PUT/POST/DELETE and note that "custom API action creation might be required" for complex cases. |
| AI | **LabVantage CORTEX**, announced 5 March 2026: AI, analytics and automation integrated with the LIMS. Named capabilities include worksheet assistance, sample management, stability study monitoring and protocol creation, process simplification, and automated compliance monitoring "aligned with FDA, EMA, and ISO standards". It is described as cloud-native and multi-tenant, as agentic AI, and as an orchestration layer with specialised agents (sample management, quality control, compliance, stability, instrument monitoring). |

**Not verified** (needs the customer's LabVantage documentation on VantageCare, or the vendor): exact
SDC/table names in a given configuration, available REST resources per version, event/webhook
mechanisms, whether CORTEX exposes APIs or agent-extension points, and CORTEX's validation package.

## 3. Where each LabAgent function fits

| LabAgent | LabVantage context | Data it needs from LabVantage | Criticality (Annex 22 draft) |
|---|---|---|---|
| **T1 SOP & method questions** | At the bench, from a worksheet or test: "what's the acceptance criterion for this method?" | Method/test identifiers for context; the SOP text itself usually lives in the DMS (Veeva, MasterControl, OpenText…), not in the LIMS | Non-critical look-up aid (the controlled SOP governs); a model may word answers with HITL |
| **T2 read-only look-ups** | "Which instruments are overdue?", "OOS results for batch X", "who is certified on method Y?" | Samples, tests/results with specification status, instruments and calibration schedule, analyst training/certification | Validated templates may inform GMP work; AI-drafted queries informational only |
| **T3 OOS Phase 1 triage** | LabVantage marks a result out of specification → Phase 1 laboratory investigation | The result and its specification, instrument calibration status at run time, analyst certification at run time, related OOS results (instrument, batch, method), precedent investigations | **Critical** — deterministic only; the human signs in LabVantage/QMS |

## 4. Target architecture

```mermaid
flowchart LR
  subgraph Site["Site network / LabVantage hosting"]
    LV[LabVantage LIMS<br/>REST API · RESTPolicy GET-only<br/>read-only service account]
    DMS[DMS<br/>effective SOP versions]
    CFD[cloudflared<br/>Cloudflare Tunnel]
    EV[LabVantage event / workflow<br/>on OOS result]
  end
  subgraph CF["Organisation's Cloudflare account"]
    ACC{{Cloudflare Access<br/>same IdP as LabVantage}}
    AG[LabAgent agent<br/>pipeline · audit ledger · monitor]
    SRC[LabVantage source adapter<br/>exec() over REST, read-only]
    IDX[(SOP index<br/>effective versions + hashes)]
    AI[[Model: Workers AI<br/>or on-prem via Ollama]]
  end
  User((Analyst / reviewer)) --> ACC --> AG
  LV -- "deep link with sample / test id" --> User
  AG --> SRC --> CFD --> LV
  DMS -- "nightly sync of effective versions" --> IDX --> AG
  EV -- "OOS event (via middleware)" --> AG
  AG -. "non-critical only" .-> AI
  User -- "approves / files record with LabVantage e-signature" --> LV
```

- **Read path.** A `LabVantageSource` adapter implements the pipeline's `exec()` interface over
  LabVantage REST GET calls (or over read-only reporting views, if the site prefers a replica).
  Three layers keep it read-only: the service account's LabVantage role, a RESTPolicy that enables GET
  only for the needed resources, and LabAgent's own guard.
- **Network.** LabVantage is usually not on the public internet. A Cloudflare Tunnel from the site gives
  the agent a private route. Tunnel access is protected by an Access service token, so there are no
  inbound firewall openings.
- **Identity.** Cloudflare Access uses the same identity provider as LabVantage's SSO. The agent then
  records verified user identities (closes risk R-13), which can be correlated with LabVantage user IDs.
- **Events.** When LabVantage flags an OOS result, a LabVantage event or workflow calls the agent through
  the site's integration layer (Enterprise Connector or another middleware). The agent assembles the
  Phase 1 evidence ahead of time and notifies the reviewer. The Agents SDK can queue or schedule this
  work per investigation.
- **Write path.** None from the AI. The reviewer approves in LabAgent, then files the investigation in
  LabVantage's or the QMS's investigation workflow using that system's own e-signature. If the site
  wants a pre-filled draft there, the draft is created by a controlled, validated interface in a
  non-GMP draft state and must be signed in LabVantage. It is never finalised by the agent.
- **Model placement.** Workers AI is simplest. If data may not leave the site or region, the same
  pipeline runs with an on-premises model (Ollama), or with no model at all. The decisions don't
  depend on it.

## 5. What changes in LabAgent

| Area | Today (demo) | With LabVantage |
|---|---|---|
| Database | sql.js with a synthetic seed | `LabVantageSource`: REST GET (or read-only views); per-query timeout; results tagged with LabVantage keys and read time |
| Query templates | SQL over the demo schema | Parameterised REST queries / view queries per template; each template validated against a LabVantage test instance |
| SOP corpus | 18 synthetic documents in code | Nightly sync of **effective** versions from the DMS, with document id, version and content hash in the configuration fingerprint; superseded versions kept only for conflict detection |
| OOS workflow | One fixed synthetic case | Same 8 steps; each step's evidence fetched live; findings rendered from deterministic templates filled with the fetched facts (still no generative text in the record); classification by the SOP decision tree |
| Identity | Name typed by the user, "(unverified)" | Access JWT from the site IdP; mapping to LabVantage user ids |
| Audit | Agent ledger | Agent ledger entries reference LabVantage record keys; LabVantage's audit trail stays the system of record for LIMS data |
| Agent instances | One per browser session | One per user or per investigation, keyed by verified identity |

## 6. Data mapping (conceptual — confirm against the site configuration)

| LabAgent table | LabVantage concept | Notes |
|---|---|---|
| `samples` | Sample records (SDC-based) with batch/lot and stage | Batch/lot may be a separate entity depending on configuration |
| `results` | Test results / data items with specification limits and evaluation status | Spec version at time of test matters for OOS |
| `instruments`, `calibrations` | Instrument records with calibration/maintenance schedules | Needed: calibration status **at run time**, not today |
| `analysts`, `qualifications` | Users with training/certification per method | Needed: certification status at run time |
| Corpus | DMS documents | Not usually held in the LIMS |
| Investigations | LabVantage investigation/deviation functionality or the QMS | Where the approved record is filed |

## 7. Implementation plan

| Phase | Scope | Validation deliverables |
|---|---|---|
| 0 — Governance | Intended use for the site, criticality, data classification and residency decision (Workers AI vs on-premises model), supplier assessments (Cloudflare, model, LabVantage interface), decision on CORTEX overlap | IU, URS, RA updated for the site |
| 1 — Read-only look-ups (T2) | Service account + RESTPolicy on a LabVantage **test** instance; `LabVantageSource`; templates rewritten; Access + Tunnel | Interface specification; OQ of each template against known data; guard and permission tests (write attempts must fail at every layer) |
| 2 — SOP answers (T1) | DMS sync of effective versions; retrieval index; optional model | Held-out set **written by site SMEs** from real questions (HT-002); TP-001 criteria re-approved |
| 3 — OOS triage (T3) | OOS event → evidence assembly; deterministic findings; approval → filing in LabVantage/QMS by the reviewer | End-to-end tests on historical OOS cases (known outcomes); explainability review |
| 4 — Production | Deployment in the organisation's Cloudflare account; IQ/OQ; monitoring; training | Validation report; periodic review schedule |

## 8. Compliance points specific to a LabVantage deployment

- **Interface validation.** The LabVantage–LabAgent interface is a GMP interface (Annex 11): specify it,
  test it, and put the RESTPolicy, SecurityPolicy and service-account roles under change control.
- **LabVantage upgrades are change triggers.** Changes to REST resources, returned columns or policy
  semantics need impact assessment and re-test of the templates.
- **Point-in-time correctness.** OOS evidence must reflect status at run time: calibration,
  certification and specification version. Templates must query history, not current state.
- **Two audit trails, one story.** LabVantage keeps the audit trail for LIMS data; LabAgent keeps it for
  AI assistance. Each LabAgent entry references LabVantage keys so an inspector can follow both.
- **CORTEX.** If CORTEX is used for overlapping tasks, it needs the same assessment. Useful questions
  for the vendor, taken from Annex 22 (draft):
  - Which agents use generative models, and are any used in critical decisions?
  - How are model versions pinned and changes notified?
  - What held-out testing, metrics and acceptance criteria support each agent?
  - How are confidence thresholds and "undecided" outcomes handled?
  - What human-review records exist?
  - Where is data processed?
- **Regulatory timing.** Annex 22 is still a draft, and EMA is reconsidering generative AI with
  guardrails (workshop, June–July 2026). A design that keeps decisions deterministic stays compliant
  whichever way the final text goes.

## 9. Questions to settle with the LabVantage system owner

1. LabVantage version and hosting (on-premises, private cloud, LabVantage SaaS)?
2. Which REST resources can be enabled read-only, and which authentication (ConnectionId vs token for
   external applications) is allowed?
3. How are OOS results flagged, and can an event or workflow call an external endpoint (directly or via
   middleware)?
4. Where do investigations live — LabVantage or a separate QMS?
5. Which DMS holds the SOPs, and does it expose effective versions via API?
6. Is CORTEX licensed, and for which use cases?

## Sources

The VantageCare documentation pages appeared in search results with the quoted content, but returned
"not found" when fetched directly on 27 September 2026 (they may need a VantageCare login); the
statements attributed to them come from the search excerpts.

- LabVantage REST Web Services — [vantagecare.labvantage.com/labvantagedoc/…/rest/rest.htm](https://vantagecare.labvantage.com/labvantagedoc/Content/docs/rest/rest.htm)
- REST Policy — [vantagecare.labvantage.com/labvantagedoc/…/policies/RESTPolicy.htm](https://vantagecare.labvantage.com/labvantagedoc/Content/docs/policies/RESTPolicy.htm)
- Token Authentication for External Applications — [vantagecare.labvantage.com/labvantagedoc/…/auth_token_externalapps.htm](https://vantagecare.labvantage.com/labvantagedoc/Content/docs/security/auth_token_externalapps.htm)
- Axis and JAX Web Services — [vantagecare.labvantage.com/labvantagedoc/…/webservices.htm](https://vantagecare.labvantage.com/labvantagedoc/Content/docs/webservices.htm)
- LabVantage Enterprise Connector — [labvantage.com (PDF)](https://www.labvantage.com/wp-content/uploads/2014/12/LEC1101JY24CYL.pdf)
- Tulip: LabVantage Connector — [support.tulip.co/docs/labvantage-connector-and-unit-test](https://support.tulip.co/docs/labvantage-connector-and-unit-test)
- LabVantage CORTEX press release (5 March 2026) — [labvantage.com](https://www.labvantage.com/press-release/labvantage-solutions-introduces-labvantage-cortex-advancing-its-lims-platform-for-ai-driven-laboratory-operations/)
- Lab Manager: LabVantage launches Cortex — [labmanager.com](https://www.labmanager.com/labvantage-launches-cortex-to-bring-ai-driven-automation-to-lims-35015)
- Labmate Online: LabVantage's Agentic AI — [labmate-online.com](https://www.labmate-online.com/news/lims/143/labvantage-solutions-inc/unveiling-labvantages-agentic-ai-for-laboratory-informatics-a-cutting-edge-platform-for-the-life-sciences-industry/66619)
- LabVantage Australia: Agentic AI in LIMS — [labvantage.com.au](https://labvantage.com.au/agentic-ai-lims-laboratory-management/)
- EMA workshop on Annex 22 (30 June–1 July 2026) — [ema.europa.eu](https://www.ema.europa.eu/en/events/good-manufacturing-practice-multistakeholder-workshop-expert-contributions-artificial-intelligence-guidance-development-annex-22)
