import { NextRequest, NextResponse } from "next/server";
import { findEmployeeByPin, getLastPunchKind } from "@/lib/sheets";
import type { PunchKind } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json() as { pin: string };
    if (!pin) return NextResponse.json({ error: "Missing pin" }, { status: 400 });

    const employee = await findEmployeeByPin(pin);
    if (!employee) return NextResponse.json({ error: "PIN 不正確" }, { status: 401 });

    const lastKind = await getLastPunchKind(employee);
    const suggested: PunchKind = lastKind === "in" ? "out" : "in";

    return NextResponse.json({ employee, suggested_kind: suggested });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "識別失敗" }, { status: 500 });
  }
}
