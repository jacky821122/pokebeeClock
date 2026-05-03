import { NextRequest, NextResponse } from "next/server";
import { reanalyzeAllEmployees } from "@/lib/analyzer_bridge";

function checkAuth(req: NextRequest): boolean {
  // BYPASS: feat/extra-hours-and-dev-tools preview convenience. Remove before merging.
  if (process.env.NEXT_PUBLIC_BYPASS_AUTH === "1") return true;
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { month } = (await req.json()) as { month?: string };
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month 格式必須為 YYYY-MM" }, { status: 400 });
  }

  try {
    const result = await reanalyzeAllEmployees(month);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "重算失敗" }, { status: 500 });
  }
}
