import { NextResponse } from "next/server";
import { findEmployeeByPinFast, loadEmployeeStatus } from "@/lib/sheets";
import { currentYyyyMm } from "@/lib/time";

/**
 * Warm-up endpoint pinged by an external cron before each daily peak
 * (09:50 / 14:00 / 15:50 / 20:00 Taipei) so the first employee in each burst
 * doesn't pay the cold-start cost.
 *
 * Touches both the fast PIN path (warms auth + sheets client + employees /
 * devices caches) and the slow status path (warms raw_punches + analyzed
 * read paths) with throwaway inputs.
 */
export async function GET() {
  const start = Date.now();
  try {
    await Promise.all([
      findEmployeeByPinFast("", ""),
      loadEmployeeStatus("__warmup__", currentYyyyMm()),
    ]);
    return NextResponse.json({ ok: true, ms: Date.now() - start });
  } catch (err) {
    console.error("warmup failed", err);
    return NextResponse.json({ ok: false, ms: Date.now() - start }, { status: 500 });
  }
}
