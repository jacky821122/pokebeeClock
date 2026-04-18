import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { verifyPin, appendPunch } from "@/lib/sheets";
import type { Punch } from "@/types";

function nowTaipei(): string {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace("Z", "+08:00");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employee, pin, client_ts } = body as {
      employee: string;
      pin: string;
      client_ts: string;
    };

    if (!employee || !pin) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const pinHash = crypto.createHash("sha256").update(pin).digest("hex");
    const valid = await verifyPin(employee, pinHash);
    if (!valid) {
      return NextResponse.json({ error: "PIN 不正確" }, { status: 401 });
    }

    const punch: Punch = {
      id: crypto.randomUUID(),
      employee,
      client_ts: client_ts ?? nowTaipei(),
      server_ts: nowTaipei(),
      source: "pwa",
    };

    await appendPunch(punch);
    return NextResponse.json({ ok: true, server_ts: punch.server_ts });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "打卡失敗" }, { status: 500 });
  }
}
