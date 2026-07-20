// Seed for the read-only synthetic LIMS database (executed against sql.js).
// The Tier 2 assistant translates a question into SQL, which is validated to be
// SELECT-only and then run for real against this in-memory SQLite database.
// "now" for relative-date queries is pinned to the case date for reproducibility.
export const NOW = "2026-07-12";

export const SCHEMA = `
CREATE TABLE analysts (
  analyst_id TEXT PRIMARY KEY,
  name TEXT
);
CREATE TABLE instruments (
  instrument_id TEXT PRIMARY KEY,
  description TEXT,
  type TEXT,
  category TEXT,
  cal_due TEXT,
  cal_status TEXT,
  last_cal_by TEXT
);
CREATE TABLE calibrations (
  cal_id TEXT PRIMARY KEY,
  instrument_id TEXT,
  cal_performed TEXT,
  interval_days INTEGER,
  cal_due TEXT
);
CREATE TABLE samples (
  sample_id TEXT PRIMARY KEY,
  batch_id TEXT,
  stage TEXT,
  received TEXT
);
CREATE TABLE results (
  result_id TEXT PRIMARY KEY,
  sample_id TEXT,
  method_id TEXT,
  instrument_id TEXT,
  analyst_id TEXT,
  value REAL,
  unit TEXT,
  spec_low REAL,
  spec_high REAL,
  spec_text TEXT,
  oos_flag INTEGER,
  run_ts TEXT
);
CREATE TABLE qualifications (
  analyst_id TEXT,
  method_id TEXT,
  granted TEXT,
  requal_due TEXT,
  status TEXT
);
`;

export const ROWS = {
  analysts: [
    ["A-114", "L. Brandt"],
    ["A-186", "S. Okafor"],
    ["A-207", "J. Lindqvist"],
  ],
  instruments: [
    ["INS-112", "HPLC — Release lab 1", "HPLC", "B", "2026-08-14", "IN CAL", "T-031"],
    ["INS-113", "HPLC — Release lab 1", "HPLC", "B", "2026-09-02", "IN CAL", "T-031"],
    ["INS-114", "HPLC — Release lab 2", "HPLC", "B", "2026-07-05", "EXPIRED", "T-018"],
    ["INS-201", "Karl Fischer titrator", "KF", "B", "2026-07-29", "IN CAL", "T-031"],
    ["INS-088", "Analytical balance W-2/3", "BALANCE", "B", "2026-08-06", "IN CAL", "T-031"],
  ],
  calibrations: [
    ["CAL-2411", "INS-114", "2026-04-05", 91, "2026-07-05"],
    ["CAL-2402", "INS-112", "2026-05-16", 90, "2026-08-14"],
    ["CAL-2408", "INS-113", "2026-06-04", 90, "2026-09-02"],
    ["CAL-2415", "INS-201", "2026-04-29", 91, "2026-07-29"],
  ],
  samples: [
    ["S-8802", "B-2290", "Phase III clinical", "2026-06-10"],
    ["S-8811", "B-2290", "Phase III clinical", "2026-06-13"],
    ["S-8815", "B-2290", "Phase III clinical", "2026-06-18"],
    ["S-8836", "B-2290", "Phase III clinical", "2026-07-05"],
    ["S-8839", "B-2291", "Phase III clinical", "2026-07-05"],
    ["S-8840", "B-2291", "Phase III clinical", "2026-07-06"],
    ["S-8841", "B-2291", "Phase III clinical", "2026-07-07"],
  ],
  // value/spec numeric where sensible; spec_text carries the human-readable spec.
  results: [
    ["R-29874", "S-8802", "MV-0388", "INS-113", "A-114", 0.22, "%", 0, 0.5, "NMT 0.50", 0, "2026-06-11 09:40"],
    ["R-29902", "S-8811", "MV-0407", "INS-201", "A-186", 0.31, "%", 0, 0.5, "NMT 0.50", 0, "2026-06-14 13:05"],
    ["R-29981", "S-8815", "MV-0388", "INS-113", "A-114", 0.61, "%", 0, 0.5, "NMT 0.50", 1, "2026-06-19 09:12"],
    ["R-30041", "S-8836", "MV-0412", "INS-114", "A-114", 99.2, "%LC", 95.0, 105.0, "95.0–105.0", 0, "2026-07-06 08:05"],
    ["R-30102", "S-8839", "MV-0412", "INS-114", "A-207", 93.6, "%LC", 95.0, 105.0, "95.0–105.0", 1, "2026-07-06 10:47"],
    ["R-30110", "S-8840", "MV-0412", "INS-114", "A-207", 97.4, "%LC", 95.0, 105.0, "95.0–105.0", 0, "2026-07-07 11:31"],
    ["R-30117", "S-8841", "MV-0412", "INS-114", "A-207", 78.1, "%LC", 95.0, 105.0, "95.0–105.0", 1, "2026-07-08 14:22"],
  ],
  qualifications: [
    ["A-114", "MV-0412", "2024-05-02", "2026-05-02", "LAPSED"],
    ["A-186", "MV-0412", "2025-08-11", "2026-08-11", "CURRENT"],
    ["A-207", "MV-0412", "2025-11-18", "2026-11-18", "CURRENT"],
    ["A-114", "MV-0388", "2024-03-10", "2026-03-10", "LAPSED"],
    ["A-186", "MV-0407", "2025-02-20", "2027-02-20", "CURRENT"],
  ],
};

// A compact human-readable schema description handed to the model so it can
// write correct SQL against these exact tables and columns.
export const SCHEMA_DOC = `Tables (SQLite, read-only):
  analysts(analyst_id, name)
  instruments(instrument_id, description, type, category, cal_due, cal_status, last_cal_by)
  calibrations(cal_id, instrument_id, cal_performed, interval_days, cal_due)
  samples(sample_id, batch_id, stage, received)
  results(result_id, sample_id, method_id, instrument_id, analyst_id, value, unit, spec_low, spec_high, spec_text, oos_flag, run_ts)
  qualifications(analyst_id, method_id, granted, requal_due, status)
Notes:
- oos_flag = 1 means out-of-specification.
- run_ts / dates are TEXT in 'YYYY-MM-DD HH:MM' or 'YYYY-MM-DD'. Use date('${NOW}') as "today" for relative ranges, e.g. run_ts >= date('${NOW}','-30 day').
- cal_status is one of 'IN CAL' or 'EXPIRED'.
- Category B instruments are calibrated quarterly.`;
