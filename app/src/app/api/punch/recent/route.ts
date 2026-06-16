import { NextRequest, NextResponse } from "next/server";
import { checkDevice } from "@/lib/device";
import { findEmployeeByPin, getRecentPunches, getAnalyzedMonthSummary } from "@/lib/sheets";
import { currentYyyyMm } from "@/lib/time";

export async function GET(req: NextRequest) {
  try {
    const dev = await checkDevice(req);
    if (!dev.ok) return dev.res;

    const pin = req.nextUrl.searchParams.get("pin") ?? "";
    if (!pin) return NextResponse.json({ error: "Missing pin" }, { status: 400 });

    const employee = await findEmployeeByPin(pin);
    if (!employee) return NextResponse.json({ error: "PIN 不正確" }, { status: 401 });

    const [records, summaryWithContrib] = await Promise.all([
      getRecentPunches(employee, 50),
      getAnalyzedMonthSummary(employee, currentYyyyMm()),
    ]);

    // Attach each out-punch's contribution to the month total so the records
    // view can show "+N 小時" on the rows that actually fed the summary.
    // Analyzed `out_raw` is "YYYY-MM-DD HH:MM:SS"; map a client_ts onto it.
    const contributions = summaryWithContrib?.contributions ?? {};
    for (const r of records) {
      if (r.kind !== "out") continue;
      const key = r.client_ts.slice(0, 19).replace("T", " ");
      const hours = contributions[key];
      if (hours) r.hours = hours;
    }

    const summary = summaryWithContrib
      ? {
          month: summaryWithContrib.month,
          normalHours: summaryWithContrib.normalHours,
          overtimeHours: summaryWithContrib.overtimeHours,
        }
      : null;
    return NextResponse.json({ records, summary });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "讀取失敗" }, { status: 500 });
  }
}
