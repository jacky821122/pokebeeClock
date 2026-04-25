import { NextRequest, NextResponse } from "next/server";

export interface Device {
  label: string;
  token: string;
}

/**
 * Parse DEVICE_TOKENS env var. Format: "label1|token1,label2|token2".
 * Empty/unset env disables enforcement (returns []).
 */
export function getDevices(): Device[] {
  const raw = process.env.DEVICE_TOKENS?.trim();
  if (!raw) return [];
  return raw.split(",").map((entry) => {
    const [label, token] = entry.split("|").map((s) => s.trim());
    return { label: label ?? "", token: token ?? "" };
  }).filter((d) => d.token);
}

export function findDeviceByToken(token: string): Device | null {
  return getDevices().find((d) => d.token === token) ?? null;
}

/**
 * Validate `x-device-token` header against env. Returns the matched label,
 * or "" if enforcement is disabled (empty env). Throws a 401 NextResponse
 * via { res } when the token is invalid.
 */
export function checkDevice(req: NextRequest):
  | { ok: true; label: string }
  | { ok: false; res: NextResponse } {
  const devices = getDevices();
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
