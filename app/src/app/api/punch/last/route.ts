import { NextRequest, NextResponse } from "next/server";
import { getLastPunchKind } from "@/lib/sheets";

export async function GET(req: NextRequest) {
  const employee = req.nextUrl.searchParams.get("employee");
  if (!employee) {
    return NextResponse.json({ error: "Missing employee" }, { status: 400 });
  }
  try {
    const kind = await getLastPunchKind(employee);
    return NextResponse.json({ kind });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
