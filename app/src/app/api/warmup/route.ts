import { NextResponse } from "next/server";
import { loadIdentifyContext } from "@/lib/sheets";
import { currentYyyyMm } from "@/lib/time";

/**
 * Warm-up endpoint pinged by an external cron before each daily peak
 * (09:50 / 14:00 / 15:50 / 20:00 Taipei) so the first employee in each burst
 * doesn't pay the cold-start cost.
 *
 * Calling loadIdentifyContext with an empty PIN does the cheapest meaningful
 * read: it touches Sheets (warming auth + the sheets client + the employees /
 * devices TTL caches) and returns immediately because no PIN matches.
 */
export async function GET() {
  const start = Date.now();
  try {
    await loadIdentifyContext("", currentYyyyMm(), "");
    return NextResponse.json({ ok: true, ms: Date.now() - start });
  } catch (err) {
    console.error("warmup failed", err);
    return NextResponse.json({ ok: false, ms: Date.now() - start }, { status: 500 });
  }
}
