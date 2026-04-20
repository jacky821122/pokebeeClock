import { NextRequest, NextResponse } from "next/server";
import { findEmployeeByPin, appendOvertimeRequest, getRecentOvertimeRequests, deleteOvertimeRequest } from "@/lib/sheets";

function nowTaipei(): string {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace("Z", "+08:00");
}

/**
 * Round minutes down to nearest 15-min unit.
 */
function roundTo15(mins: number): number {
  return Math.floor(mins / 15) * 15;
}

/**
 * Parse "HH:mm" to minutes since midnight.
 */
function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export async function POST(req: NextRequest) {
  try {
    const { pin, date, start_time, end_time, reason } = (await req.json()) as {
      pin: string;
      date: string;       // "YYYY-MM-DD"
      start_time: string;  // "HH:mm"
      end_time: string;    // "HH:mm"
      reason?: string;
    };

    if (!pin || !date || !start_time || !end_time) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const employee = await findEmployeeByPin(pin);
    if (!employee) {
      return NextResponse.json({ error: "PIN 不正確" }, { status: 401 });
    }

    const diffMin = hmToMinutes(end_time) - hmToMinutes(start_time);
    if (diffMin <= 0) {
      return NextResponse.json({ error: "結束時間必須晚於開始時間" }, { status: 400 });
    }
    const minutes = roundTo15(diffMin);
    if (minutes <= 0) {
      return NextResponse.json({ error: "加班時數不足 15 分鐘" }, { status: 400 });
    }

    await appendOvertimeRequest({
      submitted_at: nowTaipei(),
      employee,
      date,
      start_time,
      end_time,
      minutes,
      reason: reason?.trim() || "",
    });

    return NextResponse.json({ ok: true, employee, date, minutes });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "加班申請失敗" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const pin = req.nextUrl.searchParams.get("pin") ?? "";
    if (!pin) return NextResponse.json({ error: "Missing pin" }, { status: 400 });

    const employee = await findEmployeeByPin(pin);
    if (!employee) return NextResponse.json({ error: "PIN 不正確" }, { status: 401 });

    const records = await getRecentOvertimeRequests(employee, 10);
    return NextResponse.json({ records });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "讀取失敗" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { pin, submitted_at } = (await req.json()) as { pin: string; submitted_at: string };
    if (!pin || !submitted_at) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const employee = await findEmployeeByPin(pin);
    if (!employee) return NextResponse.json({ error: "PIN 不正確" }, { status: 401 });

    const deleted = await deleteOvertimeRequest(submitted_at, employee);
    if (!deleted) return NextResponse.json({ error: "找不到該筆申請" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "撤回失敗" }, { status: 500 });
  }
}
