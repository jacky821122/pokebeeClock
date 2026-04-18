/**
 * import_ichef_csv.ts
 *
 * One-off local validation tool — run with `npx tsx scripts/import_ichef_csv.ts`.
 * Never deployed to Vercel.
 *
 * Usage:
 *   npx tsx scripts/import_ichef_csv.ts <csv_path> [--write] [--full-time=name1,name2]
 *
 * - Reads an iCHEF clock-in/out CSV, parses events (same logic as the Python
 *   analyzer), calls analyzeEmployee() for each employee, and prints results.
 * - With --write: also writes to Google Sheets (analyzed_* / summary_* tabs).
 *   Requires GOOGLE_SA_JSON and SHEET_ID env vars (loaded from .env.local).
 * - With --full-time=name1,name2: treat those employees as full-time instead
 *   of fetching from the Google Sheet.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Path aliases: tsx doesn't expand @/* by default, so we import via relative
// paths instead of @/ aliases.
// ---------------------------------------------------------------------------
import { analyzeEmployee, type EmployeeSummary, type PairRecord } from "../src/lib/analyzer/index";
import type { Event } from "../src/lib/analyzer/events";
import { fmtHours } from "../src/lib/analyzer/time_utils";

// ---------------------------------------------------------------------------
// .env.local loader (Node built-in only — no dotenv dependency needed)
// ---------------------------------------------------------------------------
function loadEnvLocal(): void {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

// ---------------------------------------------------------------------------
// CSV parser — mirrors Python parse_csv() exactly
// ---------------------------------------------------------------------------
const TIME_FORMAT_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

function parseTimestamp(s: string): Date {
  const m = TIME_FORMAT_RE.exec(s);
  if (!m) throw new Error(`Cannot parse timestamp: "${s}"`);
  return new Date(
    parseInt(m[1]!),
    parseInt(m[2]!) - 1,
    parseInt(m[3]!),
    parseInt(m[4]!),
    parseInt(m[5]!),
    parseInt(m[6]!),
  );
}

/**
 * Minimal CSV row splitter that handles quoted fields with embedded commas.
 * The iCHEF CSV uses double-quoted fields for some Total hours rows.
 */
function splitCsvRow(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

export function parseCsv(csvPath: string): Map<string, Event[]> {
  // Read with BOM stripping (utf-8-sig equivalent)
  let content = fs.readFileSync(csvPath, "utf-8");
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const employees = new Map<string, Event[]>();
  let currentName: string | null = null;
  let pendingNoIn = false;

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const row = splitCsvRow(line);
    const c0 = (row[0] ?? "").trim();
    const c1 = (row[1] ?? "").trim();

    if (c0 === "" && c1 === "") continue;

    const isKnownKeyword =
      c0 === "clock-in" ||
      c0 === "clock-out" ||
      c0 === "no clock-in record" ||
      c0 === "no clock-out record" ||
      c0.startsWith("Total hours");

    // Name row: c1 empty, c0 not a known keyword
    if (c1 === "" && !isKnownKeyword) {
      currentName = c0;
      if (!employees.has(currentName)) employees.set(currentName, []);
      pendingNoIn = false;
      continue;
    }

    if (currentName === null) continue;

    if (c0.startsWith("Total hours")) {
      currentName = null;
      pendingNoIn = false;
      continue;
    }

    const events = employees.get(currentName)!;

    if (c0 === "clock-in" && c1) {
      events.push({ kind: "clock-in", timestamp: parseTimestamp(c1) });
    } else if (c0 === "clock-out" && c1) {
      if (pendingNoIn) {
        events.push({ kind: "clock-out-no-in", timestamp: parseTimestamp(c1) });
      } else {
        events.push({ kind: "clock-out", timestamp: parseTimestamp(c1) });
      }
      pendingNoIn = false;
    } else if (c0 === "no clock-in record") {
      pendingNoIn = true;
    } else if (c0 === "no clock-out record") {
      events.push({ kind: "no-clock-out" });
    }
  }

  // Filter out employees with no events (mirrors Python: {k: v for k, v in ... if v})
  for (const [name, evts] of employees) {
    if (evts.length === 0) employees.delete(name);
  }

  return employees;
}

// ---------------------------------------------------------------------------
// Extract YYYY-MM from filename (mirrors Python extract_month_key)
// ---------------------------------------------------------------------------
function extractMonthKey(csvPath: string): string {
  const name = path.basename(csvPath);
  const m = /(\d{4}-\d{2})-\d{2}~\d{4}-\d{2}-\d{2}/.exec(name);
  if (m) return m[1]!;
  return new Date().toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// Console output
// ---------------------------------------------------------------------------
function padEnd(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function printResults(
  employeeResults: Array<{ summary: EmployeeSummary; records: PairRecord[] }>,
): void {
  for (const { summary, records } of employeeResults) {
    const role = summary.is_full_time ? "full_time" : "hourly";
    console.log(`\n=== ${summary.employee} (${role}) ===`);
    console.log(
      `normal_hours: ${fmtHours(summary.normal_hours)}  overtime_hours: ${fmtHours(summary.overtime_hours)}`,
    );
    console.log(`specials: [${summary.specials.map((s) => JSON.stringify(s)).join(", ")}]`);
    if (summary.overtime_specials.length > 0) {
      console.log(
        `overtime_specials: [${summary.overtime_specials.map((s) => JSON.stringify(s)).join(", ")}]`,
      );
    }
    console.log();

    // Table header
    const H = {
      date: "date",
      shift: "shift",
      in_norm: "in_norm",
      out_norm: "out_norm",
      normal: "normal",
      overtime: "overtime",
      note: "note",
    };
    const COL = {
      date: 10,
      shift: 6,
      in_norm: 8,
      out_norm: 8,
      normal: 6,
      overtime: 8,
      note: 40,
    };

    const header =
      padEnd(H.date, COL.date) +
      "  " +
      padEnd(H.shift, COL.shift) +
      "  " +
      padEnd(H.in_norm, COL.in_norm) +
      "  " +
      padEnd(H.out_norm, COL.out_norm) +
      "  " +
      padEnd(H.normal, COL.normal) +
      "  " +
      padEnd(H.overtime, COL.overtime) +
      "  " +
      H.note;
    const sep =
      "-".repeat(COL.date) +
      "  " +
      "-".repeat(COL.shift) +
      "  " +
      "-".repeat(COL.in_norm) +
      "  " +
      "-".repeat(COL.out_norm) +
      "  " +
      "-".repeat(COL.normal) +
      "  " +
      "-".repeat(COL.overtime) +
      "  " +
      "-".repeat(4);

    console.log(header);
    console.log(sep);

    for (const r of records) {
      if (r.employee !== summary.employee) continue;
      // in_norm / out_norm are "YYYY-MM-DD HH:MM" — show only HH:MM
      const inNormShort = r.in_norm ? r.in_norm.slice(11) : "";
      const outNormShort = r.out_norm ? r.out_norm.slice(11) : "";
      console.log(
        padEnd(r.date, COL.date) +
          "  " +
          padEnd(r.shift, COL.shift) +
          "  " +
          padEnd(inNormShort, COL.in_norm) +
          "  " +
          padEnd(outNormShort, COL.out_norm) +
          "  " +
          padEnd(fmtHours(r.normal_hours), COL.normal) +
          "  " +
          padEnd(fmtHours(r.overtime_hours), COL.overtime) +
          "  " +
          r.note,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Google Sheets helpers (only imported when --write is passed)
// ---------------------------------------------------------------------------
async function fetchFullTimeNames(): Promise<Set<string>> {
  const { getActiveEmployees } = await import("../src/lib/sheets");
  const employees = await getActiveEmployees();
  return new Set(employees.filter((e) => e.role === "full_time").map((e) => e.name));
}

async function writeToSheets(
  yyyyMm: string,
  employeeResults: Array<{ summary: EmployeeSummary; records: PairRecord[] }>,
): Promise<void> {
  const { writeAnalyzedRecords, writeSummaryRow } = await import("../src/lib/sheets");
  for (const { summary, records } of employeeResults) {
    const empRecords = records.filter((r) => r.employee === summary.employee);
    console.log(`Writing ${empRecords.length} records for ${summary.employee}...`);
    await writeAnalyzedRecords(yyyyMm, summary.employee, empRecords);
    await writeSummaryRow(yyyyMm, summary);
    await new Promise((r) => setTimeout(r, 2000)); // avoid Sheets read quota
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(
      "Usage: npx tsx scripts/import_ichef_csv.ts <csv_path> [--write] [--full-time=name1,name2]",
    );
    process.exit(0);
  }

  const csvPath = args[0]!;
  const doWrite = args.includes("--write");
  const fullTimeArg = args.find((a) => a.startsWith("--full-time="));
  const fullTimeFlag: string[] = fullTimeArg ? fullTimeArg.slice("--full-time=".length).split(",").map((s) => s.trim()) : [];

  if (!fs.existsSync(csvPath)) {
    console.error(`Error: file not found: ${csvPath}`);
    process.exit(1);
  }

  // Load .env.local (needed for --write)
  loadEnvLocal();

  // Determine full-time set
  let fullTimeNames: Set<string>;
  if (fullTimeFlag.length > 0) {
    fullTimeNames = new Set(fullTimeFlag);
    console.log(`Using --full-time override: ${[...fullTimeNames].join(", ")}`);
  } else if (doWrite || process.env.GOOGLE_SA_JSON) {
    console.log("Fetching employee roles from Google Sheets...");
    try {
      fullTimeNames = await fetchFullTimeNames();
    } catch (err) {
      console.error("Failed to fetch employee roles:", err);
      console.error("Tip: use --full-time=name1,name2 for offline use");
      process.exit(1);
    }
  } else {
    // No sheet access and no flag — treat all as hourly
    fullTimeNames = new Set<string>();
    console.log("No GOOGLE_SA_JSON or --full-time flag; treating all employees as hourly.");
  }

  // Parse CSV
  console.log(`Parsing ${csvPath}...`);
  const employeeEvents = parseCsv(csvPath);
  const monthKey = extractMonthKey(csvPath);
  console.log(`Month key: ${monthKey}`);
  console.log(`Found ${employeeEvents.size} employee(s) with events.\n`);

  // Analyze
  const allRecords: PairRecord[] = [];
  const employeeResults: Array<{ summary: EmployeeSummary; records: PairRecord[] }> = [];

  for (const [name, events] of employeeEvents) {
    const isFullTime = fullTimeNames.has(name);
    const { summary, records } = analyzeEmployee(name, events, isFullTime);
    // Skip zero-result employees (mirrors Python analyze_csv filter)
    if (summary.normal_hours === 0 && summary.overtime_hours === 0 && summary.specials.length === 0) {
      continue;
    }
    allRecords.push(...records);
    employeeResults.push({ summary, records });
  }

  // Print
  printResults(employeeResults);

  // Summary totals
  const totalNormal = employeeResults.reduce((s, e) => s + e.summary.normal_hours, 0);
  const totalOvertime = employeeResults.reduce((s, e) => s + e.summary.overtime_hours, 0);
  console.log(`\n--- Totals ---`);
  console.log(`Employees: ${employeeResults.length}`);
  console.log(`Total normal hours: ${fmtHours(totalNormal)}`);
  console.log(`Total overtime hours: ${fmtHours(totalOvertime)}`);

  // Write to sheets
  if (doWrite) {
    console.log("\nWriting to Google Sheets...");
    await writeToSheets(monthKey, employeeResults);
    console.log("Done.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
