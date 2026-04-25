"use client";

const TOKEN_KEY = "pokebee_device_token";
const LABEL_KEY = "pokebee_device_label";

export function getDeviceToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setDevice(token: string, label: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(LABEL_KEY, label);
}

export function clearDevice(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LABEL_KEY);
}

/**
 * fetch wrapper that injects the device token header and redirects to /setup
 * on 401 device_invalid. Use for all punch-flow API calls.
 */
export async function apiFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getDeviceToken();
  if (token) headers.set("x-device-token", token);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    try {
      const data = await res.clone().json();
      if (data?.code === "device_invalid") {
        clearDevice();
        window.location.href = "/setup";
      }
    } catch { /* not JSON */ }
  }
  return res;
}
