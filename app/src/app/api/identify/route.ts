import { NextRequest, NextResponse } from "next/server";
import { loadIdentifyContext } from "@/lib/sheets";
import { currentYyyyMm } from "@/lib/time";
import type { PunchKind } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { pin } = (await req.json()) as { pin: string };
    if (!pin) return NextResponse.json({ error: "Missing pin" }, { status: 400 });

    const token = req.headers.get("x-device-token") ?? "";
    const ctx = await loadIdentifyContext(pin, currentYyyyMm(), token);

    if (ctx.deviceLabel === null) {
      return NextResponse.json(
        { error: "裝置未授權", code: "device_invalid" },
        { status: 401 },
      );
    }
    if (!ctx.employee) {
      return NextResponse.json({ error: "PIN 不正確" }, { status: 401 });
    }

    const suggested: PunchKind = ctx.lastKind === "in" ? "out" : "in";
    return NextResponse.json({
      employee: ctx.employee,
      suggested_kind: suggested,
      missing_punches: ctx.missingPunches,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "識別失敗" }, { status: 500 });
  }
}
