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
  fmtHours,
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
): void {
  records.push(rec);
  summary.normal_hours += rec.normal_hours;
  if (forceSpecial || rec.note) {
    summary.specials.push(`${rec.date} ${rec.note}`);
  }
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
    const rawHours = (outNorm!.getTime() - inNorm!.getTime()) / 3600 / 1000;
    const worked = Math.max(rawHours - 2, 0);
    normal = Math.min(worked, 8.0);

    // Flag if raw punch diff > 10hr 15min
    if (rawHours > 10.25) {
      notes.push(`上班時間 ${fmtHours(rawHours)} 小時（扣除空班後超過 8 小時 15 分），請確認是否需申請加班`);
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
    // Both present: actual hours, per-shift cap 4hr
    shift = classifyShift(inNorm!);
    const worked = Math.max((outNorm!.getTime() - inNorm!.getTime()) / 3600 / 1000, 0);
    normal = Math.min(worked, 4.0);

    if (worked > 4.0) {
      notes.push(`${shift}，實際 ${fmtHours(worked)} 小時，上限 4 小時`);
    }
  }

  addRecord(
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
}

/**
 * Post-process: apply daily cap of 8hr for hourly employees.
 * If daily total > 8hr 15min, add a flag.
 * Cap normal_hours to 8hr per day.
 */
export function applyDailyCapForPt(
  records: PairRecord[],
  summary: EmployeeSummary,
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
    const total = dayRecs.reduce((acc, r) => acc + r.normal_hours, 0);

    if (total > 8.25) {
      // Flag: daily total exceeds 8hr 15min
      summary.overtime_specials.push(
        `${date} 日總時數 ${fmtHours(total)} 小時（超過 8 小時 15 分），請確認是否需申請加班`,
      );
    }

    if (total > 8.0) {
      // Cap to 8hr, distribute across records
      let remainingNormal = 8.0;
      for (let i = 0; i < dayRecs.length; i++) {
        const r = dayRecs[i]!;
        r.normal_hours = Math.min(r.normal_hours, remainingNormal);
        remainingNormal = Math.max(0, remainingNormal - r.normal_hours);
      }
      summary.normal_hours += 8.0;
    } else {
      summary.normal_hours += total;
    }
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

  let currentIn: Date | null = null;

  const consumePair = (
    inTs: Date | null,
    outTs: Date | null,
    inferredNoIn = false,
  ): void => {
    if (isFullTime) {
      handleFullTime(summary, records, name, inTs, outTs, inferredNoIn);
    } else {
      handleHourly(summary, records, name, inTs, outTs, inferredNoIn);
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
    applyDailyCapForPt(records, summary);
  }

  return { summary, records };
}
