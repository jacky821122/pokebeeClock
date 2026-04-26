import { NextRequest, NextResponse } from "next/server";
import { findEmployeeByPin, appendPunch } from "@/lib/sheets";
import { checkDevice } from "@/lib/device";
import { reanalyzeEmployee } from "@/lib/analyzer_bridge";
import { nowTaipei } from "@/lib/time";
import type { Punch, PunchKind } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const dev = await checkDevice(req);
    if (!dev.ok) return dev.res;

    const body = await req.json();
    const { pin, client_ts, kind, source } = body as {
      pin: string;
      client_ts: string;
      kind: PunchKind;
      source?: "pwa" | "supplement";
    };

    if (!pin) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (kind !== "in" && kind !== "out") {
      return NextResponse.json({ error: "Missing or invalid kind" }, { status: 400 });
    }

    const employee = await findEmployeeByPin(pin);
    if (!employee) {
      return NextResponse.json({ error: "PIN 不正確" }, { status: 401 });
    }

    // BYPASS: feat/boss-messages preview convenience. Remove before merging.
    // Skip the write in preview so the manager can spam in/out + supplement
    // buttons without polluting the sheet. Overtime + admin still write.
    if (process.env.NEXT_PUBLIC_BYPASS_AUTH === "1") {
      return NextResponse.json({ ok: true, employee, server_ts: nowTaipei(), preview: true });
    }

    const effectiveSource = source === "supplement" ? "supplement" : "pwa";
    const punch: Punch = {
      employee,
      client_ts: client_ts ?? nowTaipei(),
      server_ts: nowTaipei(),
      source: effectiveSource,
      kind,
      device: dev.label,
    };

    await appendPunch(punch);
    // For supplement punches, reanalyze based on the client_ts month (the
    // historical date being corrected), not the current server timestamp.
    const triggerTs = effectiveSource === "supplement" ? punch.client_ts : punch.server_ts;
    await reanalyzeEmployee(employee, triggerTs);

    return NextResponse.json({ ok: true, employee, server_ts: punch.server_ts });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "打卡失敗" }, { status: 500 });
  }
}
