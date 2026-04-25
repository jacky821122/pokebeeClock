import { NextRequest, NextResponse } from "next/server";
import { getActiveDevices } from "@/lib/sheets";

export interface Device {
  label: string;
  token: string;
}

/**
 * Read active devices from the Sheet `devices` tab. Empty list (tab missing
 * or no active rows) disables enforcement — friendly for dev / first install.
 */
export async function getDevices(): Promise<Device[]> {
  return getActiveDevices();
}

export async function findDeviceByToken(token: string): Promise<Device | null> {
  return (await getDevices()).find((d) => d.token === token) ?? null;
}

/**
 * Validate `x-device-token` header against the Sheet. Returns the matched
 * label, or "" if enforcement is disabled (empty devices list).
 */
export async function checkDevice(req: NextRequest): Promise<
  | { ok: true; label: string }
  | { ok: false; res: NextResponse }
> {
  // BYPASS: feat/visual-refresh preview convenience. Remove before merging.
  if (process.env.NEXT_PUBLIC_BYPASS_AUTH === "1") return { ok: true, label: "preview" };
  const devices = await getDevices();
  if (devices.length === 0) return { ok: true, label: "" };
  const token = req.headers.get("x-device-token") ?? "";
  const dev = devices.find((d) => d.token === token);
  if (!dev) {
    return {
      ok: false,
      res: NextResponse.json({ error: "裝置未授權", code: "device_invalid" }, { status: 401 }),
    };
  }
  return { ok: true, label: dev.label };
}
