import { NextRequest, NextResponse } from "next/server";
import { findEmployeeByPin, appendOvertimeRequest, getRecentOvertimeRequests, deleteOvertimeRequest } from "@/lib/sheets";
import { checkDevice } from "@/lib/device";
import { nowTaipei, hmToMin } from "@/lib/time";

/**
 * Round minutes down to nearest 15-min unit.
 */
function roundTo15(mins: number): number {
  return Math.floor(mins / 15) * 15;
}

export async function POST(req: NextRequest) {
  try {
    const dev = await checkDevice(req);
    if (!dev.ok) return dev.res;

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

    const diffMin = hmToMin(end_time) - hmToMin(start_time);
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
    const dev = await checkDevice(req);
    if (!dev.ok) return dev.res;

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
    const dev = await checkDevice(req);
    if (!dev.ok) return dev.res;

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
