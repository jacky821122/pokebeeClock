import { NextRequest, NextResponse } from "next/server";
import { checkDevice } from "@/lib/device";
import { findEmployeeByPin, getRecentPunches } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  try {
    const dev = await checkDevice(req);
    if (!dev.ok) return dev.res;

    const pin = req.nextUrl.searchParams.get("pin") ?? "";
    if (!pin) return NextResponse.json({ error: "Missing pin" }, { status: 400 });

    const employee = await findEmployeeByPin(pin);
    if (!employee) return NextResponse.json({ error: "PIN 不正確" }, { status: 401 });

    const records = await getRecentPunches(employee, 10);
    return NextResponse.json({ records });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "讀取失敗" }, { status: 500 });
  }
}
