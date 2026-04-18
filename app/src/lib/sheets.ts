import { google } from "googleapis";
import type { Employee, Punch } from "@/types";
import type { PairRecord, EmployeeSummary } from "@/lib/analyzer";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

const TAB_EMPLOYEES = "employees";
const TAB_PUNCHES = "raw_punches";
const TAB_AMENDMENTS = "amendments";

// employees:   name | pin_hash | role | active
// raw_punches: id | employee | client_ts | server_ts | source
// amendments:  id | submitted_at | employee | date | shift | in_time | out_time | reason | status
// analyzed_YYYY-MM: employee | date | shift | in_raw | in_norm | out_raw | out_norm | normal_hours | overtime_hours | note
// summary_YYYY-MM:  employee | is_full_time | normal_hours | overtime_hours | specials | overtime_specials

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

export async function verifyPin(name: string, pinHash: string): Promise<boolean> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_EMPLOYEES}!A:D`,
  });
  const rows = res.data.values ?? [];
  const row = rows.slice(1).find((r) => r[0] === name);
  if (!row) return false;
  return row[1] === pinHash;
}

// ── raw_punches ──────────────────────────────────────────────────────────────

export async function appendPunch(punch: Punch): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sid(),
    range: `${TAB_PUNCHES}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[punch.id, punch.employee, punch.client_ts, punch.server_ts, punch.source]],
    },
  });
}

export async function getPunchesForMonth(employee: string, yyyyMm: string): Promise<string[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid(),
    range: `${TAB_PUNCHES}!A:E`,
  });
  const rows = res.data.values ?? [];
  return rows
    .slice(1)
    .filter((r) => r[1] === employee && (r[2] ?? "").startsWith(yyyyMm))
    .map((r) => r[2] as string) // client_ts
    .sort();
}

// ── amendments ───────────────────────────────────────────────────────────────

export interface AmendmentInput {
  id: string;
  submitted_at: string;
  employee: string;
  date: string;
  shift: string;
  in_time: string;
  out_time: string;
  reason: string;
}

export async function appendAmendment(a: AmendmentInput): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sid(),
    range: `${TAB_AMENDMENTS}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[a.id, a.submitted_at, a.employee, a.date, a.shift, a.in_time, a.out_time, a.reason, "pending"]],
    },
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

export async function writeSummaryRow(yyyyMm: string, summary: EmployeeSummary): Promise<void> {
  const sheets = getSheets();
  const tab = `summary_${yyyyMm}`;
  await ensureTab(sheets, tab);
  const gid = await getTabGid(sheets, tab);

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid(), range: `${tab}!A:A` });
  const allRows = res.data.values ?? [];

  // Find existing row for this employee
  const existingIdx = allRows.findIndex((r, i) => i > 0 && r[0] === summary.employee);

  const row = [
    summary.employee,
    summary.is_full_time ? "TRUE" : "FALSE",
    summary.normal_hours,
    summary.overtime_hours,
    summary.specials.join(", "),
    summary.overtime_specials.join(", "),
  ];

  if (existingIdx > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sid(),
      range: `${tab}!A${existingIdx + 1}:F${existingIdx + 1}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
  } else {
    // Ensure header
    if (allRows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sid(),
        range: `${tab}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [["employee", "is_full_time", "normal_hours", "overtime_hours", "specials", "overtime_specials"]],
        },
      });
    }
    await sheets.spreadsheets.values.append({
      spreadsheetId: sid(),
      range: `${tab}!A:F`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
  }

  void gid; // used only for potential future deletes
}
