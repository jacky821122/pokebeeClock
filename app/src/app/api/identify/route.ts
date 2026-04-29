import { NextRequest, NextResponse } from "next/server";
import { findEmployeeByPinFast } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  const tStart = Date.now();
  try {
    const { pin } = (await req.json()) as { pin: string };
    if (!pin) return NextResponse.json({ error: "Missing pin" }, { status: 400 });

    const token = req.headers.get("x-device-token") ?? "";
    const ctx = await findEmployeeByPinFast(pin, token);

    // BYPASS: perf/optimistic-ui dev convenience. Remove before merging.
    const bypass = process.env.NEXT_PUBLIC_BYPASS_AUTH === "1";

    if (!bypass && ctx.deviceLabel === null) {
      return NextResponse.json(
        { error: "裝置未授權", code: "device_invalid" },
        { status: 401 },
      );
    }
    if (!ctx.employee) {
      return NextResponse.json(
        { error: "PIN 不正確", timings: { ...ctx.timings, route: Date.now() - tStart } },
        { status: 401 },
      );
    }

    return NextResponse.json({
      employee: ctx.employee,
      timings: { ...ctx.timings, route: Date.now() - tStart },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "識別失敗" }, { status: 500 });
  }
}
