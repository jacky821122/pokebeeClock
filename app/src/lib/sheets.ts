import { google } from "googleapis";
import type { Employee, Punch } from "@/types";
import type { PairRecord } from "@/lib/analyzer";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

const TAB_EMPLOYEES = "employees";
const TAB_PUNCHES = "raw_punches";
const TAB_AMENDMENTS = "amendments";

// employees:   name | pin | role | active
// raw_punches: employee | client_ts | server_ts | source | kind
// amendments:  submitted_at | employee | date | in_time | out_time | reason
// analyzed_YYYY-MM: employee | date | shift | in_raw | in_norm | out_raw | out_norm | normal_hours | overtime_hours | note
//
// `kind` is "in" | "out" (added 2026-04-19). Legacy rows without kind are
// handled by punchesToEvents via alternating fallback.

function getAuth() {
  const sa = process.env.GOOGLE_SA_JSON;
  if (!sa) throw new Error("GOOGLE_SA_JSON not set");
  return new google.auth.GoogleAuth({ credentials: JSON.parse(sa), scopes: SCOPES });
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function sid() {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error("SHEET_ID not set");
  return id;
}

// ── employees ────────────────────────────────────────────────────────────────

export async function getActiveEmployees(): Promise<Employee[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_EMPLOYEES}!A:D`,
  });
  const rows = res.data.values ?? [];
  return rows
    .slice(1)
    .filter((r) => r[3]?.toString().toUpperCase() === "TRUE")
    .map((r) => ({
      name: r[0] ?? "",
      role: (r[2] ?? "hourly") as Employee["role"],
      active: true,
    }));
}

export async function getEmployeeRole(name: string): Promise<"full_time" | "hourly"> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_EMPLOYEES}!A:D`,
  });
  const rows = res.data.values ?? [];
  const row = rows.slice(1).find((r) => r[0] === name);
  return (row?.[2] ?? "hourly") as "full_time" | "hourly";
}

export async function findEmployeeByPin(pin: string): Promise<string | null> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_EMPLOYEES}!A:D`,
  });
  const rows = res.data.values ?? [];
  const row = rows.slice(1).find(
    (r) => String(r[1] ?? "") === pin && r[3]?.toString().toUpperCase() === "TRUE",
  );
  return row ? String(row[0]) : null;
}

export async function verifyPin(name: string, pin: string): Promise<boolean> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_EMPLOYEES}!A:D`,
  });
  const rows = res.data.values ?? [];
  const row = rows.slice(1).find((r) => r[0] === name);
  if (!row) return false;
  return String(row[1] ?? "") === pin;
}

// ── employee admin ───────────────────────────────────────────────────────────

export interface EmployeeAdmin {
  name: string;
  pin: string;
  role: "full_time" | "hourly";
  active: boolean;
}

export async function listAllEmployees(): Promise<EmployeeAdmin[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_EMPLOYEES}!A:D`,
  });
  const rows = res.data.values ?? [];
  return rows.slice(1)
    .filter((r) => r[0])
    .map((r) => ({
      name: r[0] ?? "",
      pin: String(r[1] ?? ""),
      role: (r[2] ?? "hourly") as "full_time" | "hourly",
      active: r[3]?.toString().toUpperCase() === "TRUE",
    }));
}

export async function addEmployee(name: string, pin: string, role: "full_time" | "hourly"): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sid(),
    range: `${TAB_EMPLOYEES}!A:D`,
    valueInputOption: "RAW",
    requestBody: { values: [[name, pin, role, "TRUE"]] },
  });
}

/**
 * Update one or more fields of an existing employee (located by name).
 * Omit a field from `patch` to leave it unchanged.
 */
export async function updateEmployee(
  name: string,
  patch: { pin?: string; role?: "full_time" | "hourly"; active?: boolean },
): Promise<void> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_EMPLOYEES}!A:D`,
  });
  const rows = res.data.values ?? [];
  const idx = rows.slice(1).findIndex((r) => r[0] === name);
  if (idx === -1) throw new Error(`Employee not found: ${name}`);
  const rowNum = idx + 2;
  const current = rows[idx + 1];

  const nextPin = patch.pin ?? String(current[1] ?? "");
  const nextRole = patch.role ?? (current[2] ?? "hourly");
  const nextActive = patch.active === undefined
    ? (current[3] ?? "TRUE")
    : patch.active ? "TRUE" : "FALSE";

  await sheets.spreadsheets.values.update({
    spreadsheetId: sid(),
    range: `${TAB_EMPLOYEES}!A${rowNum}:D${rowNum}`,
    valueInputOption: "RAW",
    requestBody: { values: [[name, nextPin, nextRole, nextActive]] },
  });
}

// ── raw_punches ──────────────────────────────────────────────────────────────

export async function appendPunch(punch: Punch): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sid(),
    range: `${TAB_PUNCHES}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[punch.employee, punch.client_ts, punch.server_ts, punch.source, punch.kind]],
    },
  });
}

/**
 * A punch row, after the `kind` column was introduced. `kind` is "" for
 * legacy rows written before 2026-04-19 — callers must handle that.
 */
export interface PunchRow {
  ts: string;
  kind: "in" | "out" | "";
}

export async function getPunchesForMonth(employee: string, yyyyMm: string): Promise<PunchRow[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_PUNCHES}!A:E`,
  });
  const rows = res.data.values ?? [];
  return rows
    .slice(1)
    .filter((r) => r[0] === employee && (r[1] ?? "").startsWith(yyyyMm))
    .map((r) => ({ ts: String(r[1]), kind: (r[4] ?? "") as PunchRow["kind"] }))
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

/**
 * Read all punches for a month, grouped by employee (sorted by client_ts).
 * Used by the report generator to avoid N+1 reads.
 */
export async function getAllPunchesForMonth(yyyyMm: string): Promise<Map<string, PunchRow[]>> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_PUNCHES}!A:E`,
  });
  const rows = res.data.values ?? [];
  const byEmployee = new Map<string, PunchRow[]>();
  for (const r of rows.slice(1)) {
    const name = r[0];
    const ts = r[1];
    if (!name || !ts || !String(ts).startsWith(yyyyMm)) continue;
    if (!byEmployee.has(name)) byEmployee.set(name, []);
    byEmployee.get(name)!.push({ ts: String(ts), kind: (r[4] ?? "") as PunchRow["kind"] });
  }
  for (const arr of byEmployee.values()) arr.sort((a, b) => a.ts.localeCompare(b.ts));
  return byEmployee;
}

/**
 * Last recorded punch for an employee, used by the UI to highlight the
 * suggested direction (in/out). Returns null if no prior punch.
 */
export async function getLastPunchKind(employee: string): Promise<"in" | "out" | null> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_PUNCHES}!A:E`,
  });
  const rows = res.data.values ?? [];
  let latestTs = "";
  let latestKind: "in" | "out" | null = null;
  for (const r of rows.slice(1)) {
    if (r[0] !== employee) continue;
    const ts = String(r[1] ?? "");
    if (ts <= latestTs) continue;
    const kind = r[4];
    if (kind !== "in" && kind !== "out") continue;
    latestTs = ts;
    latestKind = kind;
  }
  return latestKind;
}

// ── amendments ───────────────────────────────────────────────────────────────

export interface AmendmentInput {
  submitted_at: string;
  employee: string;
  date: string;
  in_time: string;
  out_time: string;
  reason: string;
}

export async function appendAmendment(a: AmendmentInput): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sid(),
    range: `${TAB_AMENDMENTS}!A:F`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[a.submitted_at, a.employee, a.date, a.in_time, a.out_time, a.reason]],
    },
  });
}

export interface AmendmentRecord {
  submitted_at: string;
  employee: string;
  date: string;
  in_time: string;
  out_time: string;
  reason: string;
}

export async function getAmendmentsForMonth(yyyyMm: string): Promise<AmendmentRecord[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_AMENDMENTS}!A:F`,
  });
  const rows = res.data.values ?? [];
  return rows
    .slice(1)
    .filter((r) => (r[2] ?? "").startsWith(yyyyMm))
    .map((r) => ({
      submitted_at: r[0] ?? "",
      employee: r[1] ?? "",
      date: r[2] ?? "",
      in_time: r[3] ?? "",
      out_time: r[4] ?? "",
      reason: r[5] ?? "",
    }));
}

export async function getActiveEmployeesSortedByLastPunch(): Promise<string[]> {
  const sheets = getSheets();
  const [empRes, punchRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: sid(), range: `${TAB_EMPLOYEES}!A:D` }),
    sheets.spreadsheets.values.get({ spreadsheetId: sid(), range: `${TAB_PUNCHES}!A:B` }),
  ]);

  const activeNames = (empRes.data.values ?? [])
    .slice(1)
    .filter((r) => r[3]?.toString().toUpperCase() === "TRUE")
    .map((r) => String(r[0] ?? ""))
    .filter(Boolean);

  const lastPunchTs = new Map<string, string>();
  for (const r of (punchRes.data.values ?? []).slice(1)) {
    const name = String(r[0] ?? "");
    const ts = String(r[1] ?? "");
    if (name && ts && (!lastPunchTs.has(name) || ts > lastPunchTs.get(name)!)) {
      lastPunchTs.set(name, ts);
    }
  }

  return activeNames.sort((a, b) => {
    const ta = lastPunchTs.get(a) ?? "";
    const tb = lastPunchTs.get(b) ?? "";
    if (ta === tb) return a.localeCompare(b, "zh-TW");
    return ta > tb ? -1 : 1;
  });
}

// ── analyzed / summary tabs ──────────────────────────────────────────────────

async function ensureTab(sheets: ReturnType<typeof getSheets>, tabName: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sid() });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === tabName);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sid(),
    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
  });
}

async function getTabGid(sheets: ReturnType<typeof getSheets>, tabName: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sid() });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === tabName);
  return sheet?.properties?.sheetId ?? 0;
}

export async function writeAnalyzedRecords(yyyyMm: string, employee: string, records: PairRecord[]): Promise<void> {
  const sheets = getSheets();
  const tab = `analyzed_${yyyyMm}`;
  await ensureTab(sheets, tab);
  const gid = await getTabGid(sheets, tab);

  // Read existing rows to find & delete this employee's rows
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid(), range: `${tab}!A:A` });
  const allRows = res.data.values ?? [];

  // Collect 0-based row indices to delete (skip header at index 0)
  const toDelete: number[] = [];
  for (let i = 1; i < allRows.length; i++) {
    if (allRows[i][0] === employee) toDelete.push(i);
  }

  // Delete in reverse order to preserve indices
  if (toDelete.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sid(),
      requestBody: {
        requests: toDelete.reverse().map((idx) => ({
          deleteDimension: {
            range: { sheetId: gid, dimension: "ROWS", startIndex: idx, endIndex: idx + 1 },
          },
        })),
      },
    });
  }

  // Ensure header exists
  const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: sid(), range: `${tab}!A1:J1` });
  if (!headerRes.data.values?.[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sid(),
      range: `${tab}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["employee", "date", "shift", "in_raw", "in_norm", "out_raw", "out_norm", "normal_hours", "overtime_hours", "note"]],
      },
    });
  }

  if (records.length === 0) return;

  await sheets.spreadsheets.values.append({
    spreadsheetId: sid(),
    range: `${tab}!A:J`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: records.map((r) => [
        r.employee, r.date, r.shift, r.in_raw, r.in_norm, r.out_raw, r.out_norm,
        r.normal_hours, r.overtime_hours, r.note,
      ]),
    },
  });
}

