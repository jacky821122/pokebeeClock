import { NextRequest, NextResponse } from "next/server";
import { getActiveEmployees } from "@/lib/sheets";
import { reanalyzeEmployee } from "@/lib/analyzer_bridge";

function checkAuth(req: NextRequest): boolean {
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
    const employees = await getActiveEmployees();
    let count = 0;
    const errors: string[] = [];

    for (const emp of employees) {
      try {
        // Use a fake triggerTs in the target month so reanalyzeEmployee picks the right month
        const triggerTs = `${month}-15T12:00:00+08:00`;
        await reanalyzeEmployee(emp.name, triggerTs);
        count++;
      } catch (err) {
        errors.push(`${emp.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({ ok: true, count, total: employees.length, errors });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "重算失敗" }, { status: 500 });
  }
}
