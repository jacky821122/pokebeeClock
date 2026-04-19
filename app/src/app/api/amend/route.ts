import { NextRequest, NextResponse } from "next/server";
import { appendAmendment } from "@/lib/sheets";

function nowTaipei(): string {
  const tw = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace("Z", "+08:00");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employee, date, shift, in_time, out_time, reason } = body as {
      employee: string;
      date: string;
      shift: string;
      in_time: string;
      out_time: string;
      reason: string;
    };

    if (!employee || !date || !shift || !in_time || !out_time) {
      return NextResponse.json({ error: "缺少必填欄位" }, { status: 400 });
    }

    await appendAmendment({
      submitted_at: nowTaipei(),
      employee,
      date,
      shift,
      in_time,
      out_time,
      reason: reason ?? "",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "補登失敗" }, { status: 500 });
  }
}
