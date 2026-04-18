/**
 * Port of `clock_in_out_analyzer.py` calculation logic.
 *
 * API: `analyzeEmployee(name, events, isFullTime)` returns
 * `{ summary, records }`, byte-for-byte equivalent to the Python
 * `analyze_employee` + `apply_daily_overtime_for_pt` pipeline.
 *
 * Caller must supply `isFullTime` (sourced from the employees sheet in the
 * new system). The Python `FULL_TIME_NAMES` constant is intentionally NOT
 * reproduced here.
 */
import type { Event } from "./events";
import {
  atTime,
  fmtDate,
  fmtHhMm,
  fmtHours,
  fmtMinuteStamp,
  fmtTimestamp,
  normalizeInTime,
  normalizeOutTime,
  roundToHalfHour,
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

/** Python `classify_shift`. */
export function classifyShift(normIn: Date): { shift: string; normalEnd: Date } {
  const h = normIn.getHours() + normIn.getMinutes() / 60;
  if (h < 14) return { shift: "早班", normalEnd: atTime(normIn, 14, 0) };
  if (h <= 16 && h >= 14) return { shift: "晚班1", normalEnd: atTime(normIn, 20, 0) };
  // h > 16
  return { shift: "晚班2", normalEnd: atTime(normIn, 20, 30) };
}

function addRecord(
  records: PairRecord[],
  summary: EmployeeSummary,
  rec: PairRecord,
  forceSpecial: boolean,
): void {
  records.push(rec);
  summary.normal_hours += rec.normal_hours;
  summary.overtime_hours += rec.overtime_hours;
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
  const normalEnd = outTs ? atTime(outTs, 20, 0) : null;
  const outNorm = outTs ? normalizeOutTime(outTs, normalEnd) : null;

  let normal = inTs && outTs ? 8.0 : 0.0;
  let overtime = 0.0;
  const notes: string[] = [];

  if (inferredNoIn || !inTs) {
    notes.push("缺上班打卡，需人工確認");
  } else if (!outTs) {
    notes.push("缺下班打卡，需人工確認");
  } else if (outNorm!.getTime() >= normalEnd!.getTime() + 30 * 60 * 1000) {
    overtime = (outNorm!.getTime() - normalEnd!.getTime()) / 3600 / 1000;
    notes.push(`下班 ${fmtHhMm(outNorm!)}，計為 ${fmtHours(overtime)} 小時加班`);
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
      overtime_hours: overtime,
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

  let shift = "未知";
  let normal = 0.0;
  let overtime = 0.0;
  const notes: string[] = [];

  let outNorm: Date | null = null;
  if (inNorm && outTs) {
    const { normalEnd: normalEndPreview } = classifyShift(inNorm);
    outNorm = normalizeOutTime(outTs, normalEndPreview);
  } else if (outTs) {
    outNorm = roundToHalfHour(outTs);
  }

  if (
    inNorm &&
    outNorm &&
    inNorm.getTime() < atTime(inNorm, 14, 0).getTime() &&
    outNorm.getTime() >= atTime(outNorm, 20, 0).getTime()
  ) {
    shift = "全日連續班";
    normal = 8.0;
    const lateEnd = atTime(outNorm, 20, 30);
    if (outNorm.getTime() > lateEnd.getTime()) {
      overtime = (outNorm.getTime() - lateEnd.getTime()) / 3600 / 1000;
    }
    notes.push("全日連續班（強制拆分）");
  } else if (inNorm && outNorm) {
    shift = classifyShift(inNorm).shift;
    const worked = (outNorm.getTime() - inNorm.getTime()) / 3600 / 1000;
    normal = worked;
    if (Math.abs(normal - 4.0) > 1e-9) {
      notes.push(`${shift}，正常時數 ${fmtHours(normal)} 小時（非 4 小時）`);
    }
  } else if (inNorm && !outNorm) {
    shift = classifyShift(inNorm).shift;
    normal = 4.0;
    notes.push(`${shift}，無下班紀錄，計為 4 小時（default）`);
  } else if (outNorm && !inNorm) {
    const h = outNorm.getHours();
    const m = outNorm.getMinutes();
    if (h < 15 || (h === 14 && m <= 30)) {
      shift = "早班";
    } else if (h >= 20) {
      shift = "晚班";
    } else {
      shift = "未知";
    }
    normal = 4.0;
    notes.push(`${shift}，無上班紀錄，推算計為 4 小時`);
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
      normal_hours: Math.max(normal, 0.0),
      overtime_hours: Math.max(overtime, 0.0),
      note: notes.join("；"),
    },
    notes.length > 0 || inferredNoIn,
  );
}

/** Python `apply_daily_overtime_for_pt`. Mutates records and summary in place. */
export function applyDailyOvertimeForPt(
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
  summary.overtime_hours = 0.0;

  const sortedDates = Array.from(dayMap.keys()).sort();
  for (const date of sortedDates) {
    const dayRecs = dayMap.get(date)!;
    const total = dayRecs.reduce(
      (acc, r) => acc + r.normal_hours + r.overtime_hours,
      0,
    );

    if (total > 8.0) {
      const overtime = total - 8.0;
      let remainingNormal = 8.0;
      for (let i = 0; i < dayRecs.length - 1; i++) {
        const r = dayRecs[i]!;
        const rTotal = r.normal_hours + r.overtime_hours;
        r.normal_hours = Math.min(rTotal, remainingNormal);
        r.overtime_hours = 0.0;
        remainingNormal = Math.max(0.0, remainingNormal - r.normal_hours);
      }
      const last = dayRecs[dayRecs.length - 1]!;
      last.normal_hours = remainingNormal;
      last.overtime_hours = overtime;
      summary.normal_hours += 8.0;
      summary.overtime_hours += overtime;
      summary.overtime_specials.push(
        `${date} 日總時數 ${fmtHours(total)} 小時，計為 ${fmtHours(overtime)} 小時加班`,
      );
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
    applyDailyOvertimeForPt(records, summary);
  }

  return { summary, records };
}
