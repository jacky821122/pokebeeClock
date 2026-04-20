/**
 * Time utilities — ports of the half-hour rounding helpers and the
 * `normalize_in_time` / `normalize_out_time` / `fmt_hours` functions from
 * `clock_in_out_analyzer.py`.
 *
 * All functions treat `Date` as naive local time (matching Python's
 * `datetime` used in the reference implementation).
 */

/** Clone a Date, zeroing seconds/ms and setting minutes to the given value. */
function withMinute(dt: Date, minute: number): Date {
  const out = new Date(dt.getTime());
  out.setMinutes(minute, 0, 0);
  return out;
}

/** Python `round_to_half_hour`. */
export function roundToHalfHour(dt: Date): Date {
  const m = dt.getMinutes();
  if (m < 15) return withMinute(dt, 0);
  if (m < 45) return withMinute(dt, 30);
  // minute >= 45 → +1 hour, minute = 0
  const out = new Date(dt.getTime());
  out.setHours(out.getHours() + 1);
  out.setMinutes(0, 0, 0);
  return out;
}

/** Python `floor_to_half_hour`. */
export function floorToHalfHour(dt: Date): Date {
  return withMinute(dt, dt.getMinutes() >= 30 ? 30 : 0);
}

/** Python `ceiling_to_half_hour`. */
export function ceilingToHalfHour(dt: Date): Date {
  const m = dt.getMinutes();
  if (m <= 30) return withMinute(dt, 30);
  const out = new Date(dt.getTime());
  out.setHours(out.getHours() + 1);
  out.setMinutes(0, 0, 0);
  return out;
}

/**
 * Normalize in time: simply round to nearest half hour.
 * (V2: unified rounding for both in and out.)
 */
export function normalizeInTime(inTs: Date): Date {
  return roundToHalfHour(inTs);
}

/**
 * Normalize out time: simply round to nearest half hour.
 * (V2: no longer uses normalEnd / grace-period logic.)
 */
export function normalizeOutTime(outTs: Date): Date {
  return roundToHalfHour(outTs);
}

/**
 * Python `fmt_hours`:
 * - integer values → no decimal point (e.g. "8")
 * - otherwise → one decimal place, trailing zero and trailing dot stripped
 */
export function fmtHours(hours: number): string {
  if (Math.abs(hours - Math.round(hours)) < 1e-9) {
    return String(Math.round(hours));
  }
  let s = hours.toFixed(2);
  // strip trailing zeros then trailing dot (e.g. "4.50" → "4.5", "3.00" → "3")
  s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

/** Format a Date as `YYYY-MM-DD HH:MM:SS` (local time), Python `%Y-%m-%d %H:%M:%S`. */
export function fmtTimestamp(dt: Date): string {
  return `${fmtDate(dt)} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
}

/** Format a Date as `YYYY-MM-DD HH:MM` (local time). */
export function fmtMinuteStamp(dt: Date): string {
  return `${fmtDate(dt)} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

/** Format a Date as `YYYY-MM-DD` (local time, matches `date().isoformat()`). */
export function fmtDate(dt: Date): string {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** Format Date as `HH:MM` (local time), Python `strftime('%H:%M')`. */
export function fmtHhMm(dt: Date): string {
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Seconds between two Dates (matches Python `(a - b).total_seconds()`). */
export function totalSeconds(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 1000;
}

/** Build a Date on the same calendar day as `ref` with (h, m). */
export function atTime(ref: Date, h: number, m: number): Date {
  const out = new Date(ref.getTime());
  out.setHours(h, m, 0, 0);
  return out;
}
