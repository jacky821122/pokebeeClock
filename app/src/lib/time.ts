/** Current timestamp in Asia/Taipei as ISO string with +08:00 suffix. */
export function nowTaipei(): string {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace("Z", "+08:00");
}

/** Taipei "today" as YYYY-MM-DD. */
export function todayTaipei(): string {
  return nowTaipei().slice(0, 10);
}

/** Current Taipei month as YYYY-MM. */
export function currentYyyyMm(): string {
  return nowTaipei().slice(0, 7);
}

/** Parse "HH:mm" to minutes since midnight. */
export function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
