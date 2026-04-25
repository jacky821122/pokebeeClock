import { google } from "googleapis";
import type { Employee, Punch } from "@/types";
import type { PairRecord } from "@/lib/analyzer";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

const TAB_EMPLOYEES = "employees";
const TAB_PUNCHES = "raw_punches";
const TAB_OVERTIME = "overtime_requests";
const TAB_DEVICES = "devices";
const TAB_MESSAGES = "messages";
const TAB_MESSAGE_RESPONSES = "message_responses";

// employees:          name | pin | role | active
// raw_punches:        employee | client_ts | server_ts | source | kind | device
// devices:            label | token | active
// messages:           text | active | weight | created_at
// message_responses:  employee | message_text | response | timestamp
// analyzed_YYYY-MM: employee | date | shift | in_raw | in_norm | out_raw | out_norm | normal_hours | overtime_hours | note
//
// `kind` is "in" | "out" (added 2026-04-19). Legacy rows without kind are
// handled by punchesToEvents via alternating fallback.

function getAuth() {
  const sa = process.env.GOOGLE_SA_JSON;
  if (!sa) throw new Error("GOOGLE_SA_JSON not set");
  return new google.auth.GoogleAuth({ credentials: JSON.parse(sa), scopes: SCOPES });
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { code?: number }).code ?? 0;
      if (![429, 500, 502, 503, 504].includes(status) || attempt === MAX_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt + Math.random() * 200));
    }
  }
  throw lastError;
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

/** Wrap an async call with retry for transient Google API errors (429/5xx). */
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  return withRetry(fn);
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
    range: `${TAB_PUNCHES}!A:F`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[punch.employee, punch.client_ts, punch.server_ts, punch.source, punch.kind, punch.device ?? ""]],
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

/**
 * Rewrite the entire analyzed_YYYY-MM tab in one shot.
 *
 * Used by the batch reanalyze path so we don't hit Sheets read-quota limits
 * (60/min/user) by reading + writing per-employee. Clears existing data and
 * writes header + all records.
 */
export async function rewriteAnalyzedTab(yyyyMm: string, records: PairRecord[]): Promise<void> {
  const sheets = getSheets();
  const tab = `analyzed_${yyyyMm}`;
  await ensureTab(sheets, tab);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: sid(),
    range: `${tab}!A:J`,
  });

  const values: (string | number)[][] = [
    ["employee", "date", "shift", "in_raw", "in_norm", "out_raw", "out_norm", "normal_hours", "overtime_hours", "note"],
  ];
  for (const r of records) {
    values.push([r.employee, r.date, r.shift, r.in_raw, r.in_norm, r.out_raw, r.out_norm, r.normal_hours, r.overtime_hours, r.note]);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: sid(),
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

// ── missing punch detection ──────────────────────────────────────────────────

export interface MissingPunch {
  date: string;
  shift: string;
  missing: "in" | "out";
  existing_time: string; // the raw time of the punch that IS present (e.g. "10:03")
}

/**
 * Read the current month's analyzed_YYYY-MM tab for an employee and return
 * records that have missing punch flags.
 */
export async function getMissingPunches(employee: string, yyyyMm: string): Promise<MissingPunch[]> {
  const sheets = getSheets();
  const tab = `analyzed_${yyyyMm}`;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sid(),
      range: `${tab}!A:J`,
    });
    const rows = res.data.values ?? [];
    const results: MissingPunch[] = [];
    // Only flag missing punches for past dates — today's record is still in progress
    const now = new Date();
    const today = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10); // YYYY-MM-DD (Taipei)
    for (const r of rows.slice(1)) {
      if (r[0] !== employee) continue;
      const note = String(r[9] ?? "");
      const date = String(r[1] ?? "");
      if (date >= today) continue; // skip today and future
      const shift = String(r[2] ?? "");
      const inRaw = String(r[3] ?? "");
      const outRaw = String(r[5] ?? "");
      if (note.includes("缺下班打卡")) {
        // out is missing → in is the existing punch
        results.push({ date, shift, missing: "out", existing_time: inRaw });
      }
      if (note.includes("缺上班打卡")) {
        // in is missing → out is the existing punch
        results.push({ date, shift, missing: "in", existing_time: outRaw });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ── devices ──────────────────────────────────────────────────────────────────

export interface DeviceRow {
  label: string;
  token: string;
}

/**
 * Read active devices. Returns [] if tab is missing or empty — callers
 * interpret an empty list as "enforcement disabled".
 */
export async function getActiveDevices(): Promise<DeviceRow[]> {
  const sheets = getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sid(),
      range: `${TAB_DEVICES}!A:C`,
    });
    const rows = res.data.values ?? [];
    return rows
      .slice(1)
      .filter((r) => r[1] && r[2]?.toString().toUpperCase() === "TRUE")
      .map((r) => ({ label: String(r[0] ?? ""), token: String(r[1]) }));
  } catch {
    return [];
  }
}

// ── overtime_requests ────────────────────────────────────────────────────────

export interface OvertimeRequestInput {
  submitted_at: string;
  employee: string;
  date: string;
  start_time: string;
  end_time: string;
  minutes: number;
  reason?: string;
}

export async function appendOvertimeRequest(req: OvertimeRequestInput): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sid(),
    range: `${TAB_OVERTIME}!A:G`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[req.submitted_at, req.employee, req.date, req.start_time, req.end_time, req.minutes, req.reason ?? ""]],
    },
  });
}

export interface OvertimeRecord {
  submitted_at: string;
  employee: string;
  date: string;
  start_time: string;
  end_time: string;
  minutes: number;
  reason: string;
}

export async function getOvertimeRequestsForMonth(yyyyMm: string): Promise<OvertimeRecord[]> {
  const sheets = getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sid(),
      range: `${TAB_OVERTIME}!A:G`,
    });
    const rows = res.data.values ?? [];
    return rows
      .slice(1)
      .filter((r) => (r[2] ?? "").startsWith(yyyyMm))
      .map((r) => ({
        submitted_at: r[0] ?? "",
        employee: r[1] ?? "",
        date: r[2] ?? "",
        start_time: r[3] ?? "",
        end_time: r[4] ?? "",
        minutes: Number(r[5] ?? 0),
        reason: r[6] ?? "",
      }));
  } catch {
    return [];
  }
}

/**
 * Get recent overtime requests for an employee, newest first.
 */
export async function getRecentOvertimeRequests(employee: string, limit = 10): Promise<OvertimeRecord[]> {
  const sheets = getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sid(),
      range: `${TAB_OVERTIME}!A:G`,
    });
    const rows = res.data.values ?? [];
    const results: OvertimeRecord[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if ((r[1] ?? "") !== employee) continue;
      if (!(r[0] ?? "")) continue; // skip cleared rows
      results.push({
        submitted_at: r[0] ?? "",
        employee: r[1] ?? "",
        date: r[2] ?? "",
        start_time: r[3] ?? "",
        end_time: r[4] ?? "",
        minutes: Number(r[5] ?? 0),
        reason: r[6] ?? "",
      });
    }
    results.reverse();
    return results.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Delete an overtime request by clearing the row (matching submitted_at + employee).
 */
// ── messages ─────────────────────────────────────────────────────────────────

export interface Message {
  text: string;
  weight: number;
}

/**
 * Read active boss messages. Returns [] if tab is missing or empty so callers
 * can fall back to a static greeting.
 */
export async function getActiveMessages(): Promise<Message[]> {
  const sheets = getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sid(),
      range: `${TAB_MESSAGES}!A:D`,
    });
    const rows = res.data.values ?? [];
    return rows
      .slice(1)
      .filter((r) => r[0] && r[1]?.toString().toUpperCase() === "TRUE")
      .map((r) => ({
        text: String(r[0]),
        weight: Number(r[2] ?? 1) || 1,
      }));
  } catch {
    return [];
  }
}

export interface MessageResponseInput {
  employee: string;
  message_text: string;
  response: string;
  timestamp: string;
}

export async function appendMessageResponse(input: MessageResponseInput): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sid(),
    range: `${TAB_MESSAGE_RESPONSES}!A:D`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[input.employee, input.message_text, input.response, input.timestamp]],
    },
  });
}

// ── overtime delete ──────────────────────────────────────────────────────────

export async function deleteOvertimeRequest(submittedAt: string, employee: string): Promise<boolean> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_OVERTIME}!A:G`,
  });
  const rows = res.data.values ?? [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if ((r[0] ?? "") === submittedAt && (r[1] ?? "") === employee) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sid(),
        range: `${TAB_OVERTIME}!A${i + 1}:G${i + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [["", "", "", "", "", "", ""]] },
      });
      return true;
    }
  }
  return false;
}

