/**
 * V2 Analyzer — simplified calculation logic.
 *
 * Key changes from V1:
 * - No automatic overtime calculation (all overtime comes from overtime requests)
 * - Missing punches = 0hr + flag (no default hours)
 * - Full-time: recorded_hours - 2hr (break deduction), cap 8hr
 * - Hourly: actual hours, per-shift cap 4hr, daily cap 8hr
 * - Unified normalize: roundToHalfHour for both in and out
 * - Shift classification simplified: 早班 (< 14:00) / 晚班 (>= 14:00)
 * - Flag when daily total > 8hr 15min (full-time: raw punch diff > 10hr 15min)
 */
import type { Event } from "./events";
import {
  fmtDate,
  fmtHoursMinutes,
  fmtMinuteStamp,
  fmtTimestamp,
  normalizeInTime,
  normalizeOutTime,
  totalSeconds,
} from "./time_utils";

export interface PairRecord {
  employee: string;
  date: string;
  shift: string;
  in_raw: string;
  in_norm: string;
  out_raw: string;
  out_norm: string;
  normal_hours: number;
  overtime_hours: number;
  note: string;
}

export interface EmployeeSummary {
  employee: string;
  is_full_time: boolean;
  normal_hours: number;
  overtime_hours: number;
  specials: string[];
  overtime_specials: string[];
}

/** Classify shift based on normalized in time. */
export function classifyShift(normIn: Date): string {
  const h = normIn.getHours() + normIn.getMinutes() / 60;
  if (h < 14) return "早班";
  return "晚班";
}

function addRecord(
  records: PairRecord[],
  summary: EmployeeSummary,
  rec: PairRecord,
  forceSpecial: boolean,
): PairRecord {
  records.push(rec);
  summary.normal_hours += rec.normal_hours;
  if (forceSpecial || rec.note) {
    summary.specials.push(`${rec.date} ${rec.note}`);
  }
  return rec;
}

function handleFullTime(
  summary: EmployeeSummary,
  records: PairRecord[],
  name: string,
  inTs: Date | null,
  outTs: Date | null,
  inferredNoIn: boolean,
): void {
  const anchor = (inTs ?? outTs)!;
  const date = fmtDate(anchor);
  const inNorm = inTs ? normalizeInTime(inTs) : null;
  const outNorm = outTs ? normalizeOutTime(outTs) : null;

  let normal = 0.0;
  const notes: string[] = [];

  if (inferredNoIn || !inTs) {
    notes.push("缺上班打卡，需人工確認");
  } else if (!outTs) {
    notes.push("缺下班打卡，需人工確認");
  } else {
    // Full-time: punch diff - 2hr break, cap 8hr
    const normHours = (outNorm!.getTime() - inNorm!.getTime()) / 3600 / 1000;
    const worked = Math.max(normHours - 2, 0);
    normal = Math.min(worked, 8.0);

    // Flag if raw punch diff > 10hr 15min (use original timestamps, not normalized)
    const rawDiffHours = (outTs!.getTime() - inTs!.getTime()) / 3600 / 1000;
    // `>=` for cap+15min grace — boundary itself is "long enough to alert".
    if (rawDiffHours >= 10.25) {
      notes.push(`上班時間 ${fmtHoursMinutes(rawDiffHours)}（超過 10 小時 15 分），請確認是否需申請加班`);
    }
  }

  addRecord(
    records,
    summary,
    {
      employee: name,
      date,
      shift: "正職",
      in_raw: inTs ? fmtTimestamp(inTs) : "",
      in_norm: inNorm ? fmtMinuteStamp(inNorm) : "",
      out_raw: outTs ? fmtTimestamp(outTs) : "",
      out_norm: outNorm ? fmtMinuteStamp(outNorm) : "",
      normal_hours: normal,
      overtime_hours: 0,
      note: notes.join("；"),
    },
    notes.length > 0,
  );
}

function handleHourly(
  summary: EmployeeSummary,
  records: PairRecord[],
  rawHoursMap: WeakMap<PairRecord, number>,
  name: string,
  inTs: Date | null,
  outTs: Date | null,
  inferredNoIn: boolean,
): void {
  const anchor = (inTs ?? outTs)!;
  const date = fmtDate(anchor);
  const inNorm = inTs ? normalizeInTime(inTs) : null;
  const outNorm = outTs ? normalizeOutTime(outTs) : null;

  let shift = "未知";
  let normal = 0.0;
  let rawWorked: number | null = null;
  const notes: string[] = [];

  if (inferredNoIn || !inTs) {
    // Missing clock-in: 0hr + flag
    if (outNorm) {
      const h = outNorm.getHours() + outNorm.getMinutes() / 60;
      shift = h < 15 ? "早班" : h >= 20 ? "晚班" : "未知";
    }
    notes.push("缺上班打卡，需人工確認");
  } else if (!outTs) {
    // Missing clock-out: 0hr + flag
    shift = classifyShift(inNorm!);
    notes.push("缺下班打卡，需人工確認");
  } else {
    // Both present — check for full-day span (in < 14:00, out >= 17:00).
    // Heuristic: a single hourly shift caps at 4hr, plus 加時申請 / 上限寬限
    // can plausibly stretch to ~5hr. Any out >= 17:00 with in < 14:00 is
    // unlikely to be one shift, so treat it as 早班缺out + 晚班缺in.
    const inH = inNorm!.getHours() + inNorm!.getMinutes() / 60;
    const outH = outNorm!.getHours() + outNorm!.getMinutes() / 60;

    if (inH < 14 && outH >= 17) {
      // Early shift: has in, missing out → 0hr + flag
      addRecord(records, summary, {
        employee: name, date, shift: "早班",
        in_raw: inTs ? fmtTimestamp(inTs) : "",
        in_norm: inNorm ? fmtMinuteStamp(inNorm) : "",
        out_raw: "", out_norm: "",
        normal_hours: 0, overtime_hours: 0,
        note: "早班缺下班打卡，需補打",
      }, true);
      // Late shift: missing in, has out → 0hr + flag
      addRecord(records, summary, {
        employee: name, date, shift: "晚班",
        in_raw: "", in_norm: "",
        out_raw: outTs ? fmtTimestamp(outTs) : "",
        out_norm: outNorm ? fmtMinuteStamp(outNorm) : "",
        normal_hours: 0, overtime_hours: 0,
        note: "晚班缺上班打卡，需補打",
      }, true);
      return;
    }

    // Normal single-shift: pay uses normalized hours (cap applied later in
    // applyDailyCapForPt), but the per-shift over-cap flag uses raw so the
    // message matches the employee's actual punches.
    shift = classifyShift(inNorm!);
    const worked = Math.max((outNorm!.getTime() - inNorm!.getTime()) / 3600 / 1000, 0);
    normal = worked;

    rawWorked = Math.max((outTs!.getTime() - inTs!.getTime()) / 3600 / 1000, 0);
    if (rawWorked >= 4.25) {
      notes.push(`${shift}，實際 ${fmtHoursMinutes(rawWorked)}，上限 4 小時`);
    }
  }

  const rec = addRecord(
    records,
    summary,
    {
      employee: name,
      date,
      shift,
      in_raw: inTs ? fmtTimestamp(inTs) : "",
      in_norm: inNorm ? fmtMinuteStamp(inNorm) : "",
      out_raw: outTs ? fmtTimestamp(outTs) : "",
      out_norm: outNorm ? fmtMinuteStamp(outNorm) : "",
      normal_hours: normal,
      overtime_hours: 0,
      note: notes.join("；"),
    },
    notes.length > 0 || inferredNoIn,
  );
  if (rawWorked !== null) rawHoursMap.set(rec, rawWorked);
}

/**
 * Post-process: apply daily cap of 8hr for hourly employees.
 * If daily total > 8hr 15min, add a flag.
 * Cap normal_hours to 8hr per day.
 */
export function applyDailyCapForPt(
  records: PairRecord[],
  summary: EmployeeSummary,
  rawHoursMap: WeakMap<PairRecord, number> = new WeakMap(),
): void {
  const dayMap = new Map<string, PairRecord[]>();
  for (const r of records) {
    if (r.employee !== summary.employee) continue;
    const bucket = dayMap.get(r.date);
    if (bucket) bucket.push(r);
    else dayMap.set(r.date, [r]);
  }

  summary.normal_hours = 0.0;

  const sortedDates = Array.from(dayMap.keys()).sort();
  for (const date of sortedDates) {
    const dayRecs = dayMap.get(date)!;

    // Daily flag uses raw worked hours so the alert matches actual punches,
    // not the normalized rounding. Records with missing punches contribute 0.
    const rawTotal = dayRecs.reduce((acc, r) => acc + (rawHoursMap.get(r) ?? 0), 0);

    if (rawTotal >= 8.25) {
      summary.overtime_specials.push(
        `${date} 日實際總時數 ${fmtHoursMinutes(rawTotal)}（超過 8 小時 15 分），請確認是否需申請加班`,
      );
    }

    // Apply per-shift cap (4hr) then daily cap (8hr)
    let remainingNormal = 8.0;
    for (const r of dayRecs) {
      r.normal_hours = Math.min(r.normal_hours, 4.0); // per-shift cap
      r.normal_hours = Math.min(r.normal_hours, remainingNormal); // daily cap
      remainingNormal = Math.max(0, remainingNormal - r.normal_hours);
    }

    const cappedTotal = dayRecs.reduce((acc, r) => acc + r.normal_hours, 0);
    summary.normal_hours += cappedTotal;
  }
}

/**
 * Port of Python `analyze_employee`. Given a sequence of Events for one
 * employee and an `isFullTime` flag, returns the computed summary and the
 * list of per-pair records.
 *
 * The Python version mutates a shared `records` list; here we return a fresh
 * list for each call (callers can concatenate as needed).
 */
export function analyzeEmployee(
  name: string,
  events: Event[],
  isFullTime: boolean,
): { summary: EmployeeSummary; records: PairRecord[] } {
  const summary: EmployeeSummary = {
    employee: name,
    is_full_time: isFullTime,
    normal_hours: 0.0,
    overtime_hours: 0.0,
    specials: [],
    overtime_specials: [],
  };
  const records: PairRecord[] = [];
  const rawHoursMap = new WeakMap<PairRecord, number>();

  let currentIn: Date | null = null;

  const consumePair = (
    inTs: Date | null,
    outTs: Date | null,
    inferredNoIn = false,
  ): void => {
    if (isFullTime) {
      handleFullTime(summary, records, name, inTs, outTs, inferredNoIn);
    } else {
      handleHourly(summary, records, rawHoursMap, name, inTs, outTs, inferredNoIn);
    }
  };

  let i = 0;
  while (i < events.length) {
    const e = events[i]!;

    if (e.kind === "clock-in") {
      if (currentIn !== null) {
        if (
          e.timestamp &&
          Math.abs(totalSeconds(e.timestamp, currentIn)) <= 60
        ) {
          summary.specials.push(
            `${fmtDate(currentIn)} 重複 clock-in（<=60秒），丟棄後者`,
          );
          i += 1;
          continue;
        }
        consumePair(currentIn, null);
      }
      currentIn = e.timestamp;
    } else if (e.kind === "clock-out") {
      if (currentIn === null) {
        consumePair(null, e.timestamp, true);
      } else if (e.timestamp && fmtDate(currentIn) !== fmtDate(e.timestamp)) {
        // Cross-date pair → two separate missing-punch records (the in's
        // date is missing an out; the out's date is missing an in).
        consumePair(currentIn, null);
        consumePair(null, e.timestamp, true);
        currentIn = null;
      } else {
        consumePair(currentIn, e.timestamp);
        currentIn = null;
      }
    } else if (e.kind === "clock-out-no-in") {
      consumePair(null, e.timestamp, true);
    } else if (e.kind === "no-clock-out" && currentIn !== null) {
      // Edge case: clock-in + no-clock-out + clock-in(<=60s) + no-clock-out.
      if (i + 1 < events.length) {
        const nxt = events[i + 1]!;
        if (
          nxt.kind === "clock-in" &&
          nxt.timestamp &&
          Math.abs(totalSeconds(nxt.timestamp, currentIn)) <= 60
        ) {
          summary.specials.push(
            `${fmtDate(currentIn)} 重複 clock-in（<=60秒），丟棄後者`,
          );
          i += 1;
        }
      }
      consumePair(currentIn, null);
      currentIn = null;
    }

    i += 1;
  }

  if (currentIn !== null) {
    consumePair(currentIn, null);
  }

  if (!isFullTime) {
    applyDailyCapForPt(records, summary, rawHoursMap);
  }

  return { summary, records };
}
