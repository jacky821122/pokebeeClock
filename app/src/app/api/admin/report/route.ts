import { NextRequest, NextResponse } from "next/server";
import { generateReport } from "@/lib/report_generator";

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month 格式必須為 YYYY-MM" }, { status: 400 });
  }

  try {
    const buf = await generateReport(month);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="clock_report_${month}.xlsx"`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "報表產生失敗" }, { status: 500 });
  }
}
