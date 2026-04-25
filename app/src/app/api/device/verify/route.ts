import { NextRequest, NextResponse } from "next/server";
import { findDeviceByToken, getDevices } from "@/lib/device";

export async function POST(req: NextRequest) {
  try {
    const { token } = (await req.json()) as { token: string };
    if (!token) return NextResponse.json({ error: "缺少 token" }, { status: 400 });

    // If enforcement disabled, accept any token (label = "dev")
    if (getDevices().length === 0) {
      return NextResponse.json({ ok: true, label: "dev", enforced: false });
    }

    const dev = findDeviceByToken(token);
    if (!dev) return NextResponse.json({ error: "Token 無效" }, { status: 401 });
    return NextResponse.json({ ok: true, label: dev.label, enforced: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "驗證失敗" }, { status: 500 });
  }
}
