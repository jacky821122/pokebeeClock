import { NextRequest, NextResponse } from "next/server";
import { findEmployeeByPin, getLastPunchKind, getMissingPunches } from "@/lib/sheets";
import { checkDevice } from "@/lib/device";
import { currentYyyyMm } from "@/lib/time";
import type { PunchKind } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const dev = await checkDevice(req);
    if (!dev.ok) return dev.res;

    const { pin } = await req.json() as { pin: string };
    if (!pin) return NextResponse.json({ error: "Missing pin" }, { status: 400 });

    const employee = await findEmployeeByPin(pin);
    if (!employee) return NextResponse.json({ error: "PIN 不正確" }, { status: 401 });

    const [lastKind, missingPunches] = await Promise.all([
      getLastPunchKind(employee),
      getMissingPunches(employee, currentYyyyMm()),
    ]);
    const suggested: PunchKind = lastKind === "in" ? "out" : "in";

    return NextResponse.json({ employee, suggested_kind: suggested, missing_punches: missingPunches });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "識別失敗" }, { status: 500 });
  }
}
