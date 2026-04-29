import { NextRequest, NextResponse } from "next/server";
import { findEmployeeByPinFast, loadEmployeeStatus } from "@/lib/sheets";
import { currentYyyyMm } from "@/lib/time";

/**
 * Slow-path: returns suggested punch direction + missing-punch list for the
 * employee identified by PIN. The PIN flow calls /api/identify first to get
 * the employee name (fast), then this in the background while the user is
 * already on the punch screen.
 */
export async function POST(req: NextRequest) {
  const tStart = Date.now();
  try {
    const { pin } = (await req.json()) as { pin: string };
    if (!pin) return NextResponse.json({ error: "Missing pin" }, { status: 400 });

    const token = req.headers.get("x-device-token") ?? "";
    const id = await findEmployeeByPinFast(pin, token);

    // BYPASS: perf/optimistic-ui dev convenience. Remove before merging.
    const bypass = process.env.NEXT_PUBLIC_BYPASS_AUTH === "1";
    if (!bypass && id.deviceLabel === null) {
      return NextResponse.json(
        { error: "裝置未授權", code: "device_invalid" },
        { status: 401 },
      );
    }
    if (!id.employee) {
      return NextResponse.json({ error: "PIN 不正確" }, { status: 401 });
    }

    const status = await loadEmployeeStatus(id.employee, currentYyyyMm());
    const suggested = status.lastKind === "in" ? "out" : "in";

    return NextResponse.json({
      suggested_kind: suggested,
      missing_punches: status.missingPunches,
      timings: {
        ...id.timings,
        ...Object.fromEntries(
          Object.entries(status.timings).map(([k, v]) => [`status_${k}`, v]),
        ),
        route: Date.now() - tStart,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "讀取狀態失敗" }, { status: 500 });
  }
}
