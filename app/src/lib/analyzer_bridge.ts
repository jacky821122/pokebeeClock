import { getPunchesForMonth, getEmployeeRole, writeAnalyzedRecords, type PunchRow } from "@/lib/sheets";
import { analyzeEmployee } from "@/lib/analyzer";
import type { Event } from "@/lib/analyzer";

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
    events.push({ kind: r.kind === "in" ? "clock-in" : "clock-out", timestamp: new Date(r.ts) });
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
