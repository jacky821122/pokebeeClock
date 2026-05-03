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

export type DeviceCheck =
  | { ok: true; label: string }
  | { ok: false; res: NextResponse };

/**
 * Resolve a device label produced by `findEmployeeByPinFast` (or any inline
 * lookup) into the same shape as `checkDevice`. Single source of truth for
 * the BYPASS gate so the two device-check paths can't drift.
 *
 * Convention from the lookup: `null` = enforcement on and no match,
 * `""` = enforcement disabled (no active devices), any other string = label.
 */
export function resolveDeviceLabel(label: string | null): DeviceCheck {
  // BYPASS: feat/extra-hours-and-dev-tools preview convenience. Remove before merging.
  if (process.env.NEXT_PUBLIC_BYPASS_AUTH === "1") return { ok: true, label: "BYPASS" };
  if (label === null) {
    return {
      ok: false,
      res: NextResponse.json({ error: "裝置未授權", code: "device_invalid" }, { status: 401 }),
    };
  }
  return { ok: true, label };
}

/**
 * Validate `x-device-token` header against the Sheet. Returns the matched
 * label, or "" if enforcement is disabled (empty devices list).
 */
export async function checkDevice(req: NextRequest): Promise<DeviceCheck> {
  const devices = await getDevices();
  const token = req.headers.get("x-device-token") ?? "";
  let label: string | null;
  if (devices.length === 0) label = "";
  else label = devices.find((d) => d.token === token)?.label ?? null;
  return resolveDeviceLabel(label);
}
