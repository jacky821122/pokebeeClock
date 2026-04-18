import { google } from "googleapis";
import type { Employee, Punch } from "@/types";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Sheet tab names
const TAB_EMPLOYEES = "employees";
const TAB_PUNCHES = "raw_punches";

// employees columns: name | pin_hash | role | active
// raw_punches columns: id | employee | client_ts | server_ts | source

function getAuth() {
  const sa = process.env.GOOGLE_SA_JSON;
  if (!sa) throw new Error("GOOGLE_SA_JSON not set");
  const credentials = JSON.parse(sa);
  return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function sheetId() {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error("SHEET_ID not set");
  return id;
}

// ── employees ────────────────────────────────────────────────────────────────

export async function getActiveEmployees(): Promise<Employee[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${TAB_EMPLOYEES}!A:D`,
  });

  const rows = res.data.values ?? [];
  return rows
    .slice(1) // skip header
    .filter((r) => r[3]?.toString().toUpperCase() === "TRUE")
    .map((r) => ({
      name: r[0] ?? "",
      role: (r[2] ?? "hourly") as Employee["role"],
      active: true,
    }));
}

export async function verifyPin(name: string, pinHash: string): Promise<boolean> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
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
    spreadsheetId: sheetId(),
    range: `${TAB_PUNCHES}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[punch.id, punch.employee, punch.client_ts, punch.server_ts, punch.source]],
    },
  });
}
