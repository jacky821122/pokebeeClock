import { getPunchesForMonth, getEmployeeRole, writeAnalyzedRecords, rewriteAnalyzedTab, getActiveEmployees, getAllPunchesForMonth, type PunchRow } from "@/lib/sheets";
import { analyzeEmployee } from "@/lib/analyzer";
import type { Event, PairRecord } from "@/lib/analyzer";

/**
 * Parse a "+08:00" timestamp naively: extract Y/M/D/h/m/s from the string
 * and build a Date as-if local time. On Vercel (UTC), .getHours() will then
 * return the Taipei hour, matching the Python analyzer's naive-datetime logic.
 */
function parseTaipeiNaive(ts: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(ts);
  if (!m) return new Date(ts);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/**
 * Convert a sorted list of PunchRows to analyzer Events.
 *
 * New punches carry an explicit `kind` ("in" or "out"). Legacy rows
 * (written before the `kind` column existed) have kind="" and are handled
 * by alternating fallback: first, third, fifth… = in; others = out.
 *
 * After kinds are resolved, the function also synthesizes `no-clock-out`
 * events in two cases:
 *   - two consecutive `in` events (the earlier one is missing its pair);
 *   - the sequence ends with an `in` (still-on-shift or forgotten-out).
 */
export function punchesToEvents(rows: PunchRow[]): Event[] {
  // Step 1: resolve kind for legacy rows.
  const resolved: { ts: string; kind: "in" | "out" }[] = [];
  let fallbackParity = 0; // 0 = expect in, 1 = expect out
  for (const r of rows) {
    let kind: "in" | "out";
    if (r.kind === "in" || r.kind === "out") {
      kind = r.kind;
      fallbackParity = kind === "in" ? 1 : 0;
    } else {
      kind = fallbackParity === 0 ? "in" : "out";
      fallbackParity ^= 1;
    }
    resolved.push({ ts: r.ts, kind });
  }

  // Step 2: emit Events, inserting no-clock-out where needed.
  const events: Event[] = [];
  let lastKind: "in" | "out" | null = null;
  for (const r of resolved) {
    if (r.kind === "in" && lastKind === "in") {
      events.push({ kind: "no-clock-out" });
    }
    events.push({ kind: r.kind === "in" ? "clock-in" : "clock-out", timestamp: parseTaipeiNaive(r.ts) });
    lastKind = r.kind;
  }
  if (lastKind === "in") {
    events.push({ kind: "no-clock-out" });
  }
  return events;
}

function yyyyMmFromTs(ts: string): string {
  return ts.slice(0, 7); // "YYYY-MM"
}

export async function reanalyzeEmployee(employee: string, triggerTs: string): Promise<void> {
  const yyyyMm = yyyyMmFromTs(triggerTs);
  const role = await getEmployeeRole(employee);
  const isFullTime = role === "full_time";

  const rows = await getPunchesForMonth(employee, yyyyMm);
  const events = punchesToEvents(rows);

  const { records } = analyzeEmployee(employee, events, isFullTime);

  await writeAnalyzedRecords(yyyyMm, employee, records);
}

/**
 * Batch reanalyze all active employees for a given month.
 * Only 2 Sheets API reads (employees + punches), then 1 write per employee with data.
 */
export async function reanalyzeAllEmployees(yyyyMm: string): Promise<{ count: number; total: number; errors: string[] }> {
  const [employees, punchMap] = await Promise.all([
    getActiveEmployees(),
    getAllPunchesForMonth(yyyyMm),
  ]);

  let count = 0;
  const errors: string[] = [];
  const allRecords: PairRecord[] = [];

  for (const emp of employees) {
    try {
      const rows = punchMap.get(emp.name) ?? [];
      const isFullTime = emp.role === "full_time";
      const events = punchesToEvents(rows);
      const { records } = analyzeEmployee(emp.name, events, isFullTime);
      allRecords.push(...records);
      count++;
    } catch (err) {
      errors.push(`${emp.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await rewriteAnalyzedTab(yyyyMm, allRecords);

  return { count, total: employees.length, errors };
}
