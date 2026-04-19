import { getPunchesForMonth, getEmployeeRole, writeAnalyzedRecords } from "@/lib/sheets";
import { analyzeEmployee } from "@/lib/analyzer";
import type { Event } from "@/lib/analyzer";

/**
 * Convert a sorted list of client_ts strings (Asia/Taipei ISO) to Events.
 * Punches alternate: clock-in, clock-out, clock-in, clock-out, …
 * If the last punch has no pair, it becomes no-clock-out.
 */
export function punchesToEvents(timestamps: string[]): Event[] {
  const events: Event[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = new Date(timestamps[i]);
    if (i % 2 === 0) {
      events.push({ kind: "clock-in", timestamp: ts });
    } else {
      events.push({ kind: "clock-out", timestamp: ts });
    }
  }
  if (timestamps.length % 2 === 1) {
    // last clock-in has no matching clock-out
    events[events.length - 1] = { kind: "no-clock-out" };
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

  const timestamps = await getPunchesForMonth(employee, yyyyMm);
  const events = punchesToEvents(timestamps);

  const { records } = analyzeEmployee(employee, events, isFullTime);

  await writeAnalyzedRecords(yyyyMm, employee, records);
}
