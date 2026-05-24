/**
 * Display-layer report generator.
 *
 * Produces a human-readable xlsx matching the Python `write_xlsx_report`
 * layout (pokebee/clock_in_out_analyzer.py). Two sheets:
 *   - 摘要: per-employee block (正常時數 / 加班時數 / 特殊班別 / 加班申請)
 *   - 明細: flat table of PairRecords
 *
 * Pure function — returns a Buffer. The caller decides where it goes
 * (CLI writes to disk; a future admin route could stream it as a download).
 */

import ExcelJS from "exceljs";
import { analyzeEmployee, fmtHours, type EmployeeSummary, type PairRecord } from "@/lib/analyzer";
import { getActiveEmployees, getAllPunchesForMonth, getOvertimeRequestsForMonth, type OvertimeRecord } from "@/lib/sheets";
import { punchesToEvents } from "@/lib/analyzer_bridge";

type RequestKind = "overtime" | "extra";

interface EmployeeResult {
  summary: EmployeeSummary;
  records: PairRecord[];
  overtimeRequests: OvertimeRecord[];
  /**
   * Per-request classification (referenced by request object identity).
   * Hourly: raw daily punch hours > 8 → "overtime", else → "extra".
   * Full-time: always "overtime" (full-time has no "加時" concept by design).
   *
   * Edge: hourly worker with raw 7.5hr + a 1hr request → all 1hr classified
   * as "extra" (option (a): based on punches alone, not punches+request).
   * Managers are expected to split such cases at submission time.
   */
  requestKinds: Map<OvertimeRecord, RequestKind>;
}

/** Raw worked hours from a record's in_raw/out_raw strings (0 if either missing). */
function rawHoursOf(r: PairRecord): number {
  if (!r.in_raw || !r.out_raw) return 0;
  const inMs = new Date(r.in_raw.replace(" ", "T")).getTime();
  const outMs = new Date(r.out_raw.replace(" ", "T")).getTime();
  if (Number.isNaN(inMs) || Number.isNaN(outMs)) return 0;
  return Math.max((outMs - inMs) / 3600 / 1000, 0);
}

export function classifyRequests(
  requests: OvertimeRecord[],
  records: PairRecord[],
  isFullTime: boolean,
): Map<OvertimeRecord, RequestKind> {
  const kinds = new Map<OvertimeRecord, RequestKind>();
  if (isFullTime) {
    for (const o of requests) kinds.set(o, "overtime");
    return kinds;
  }
  const rawByDate = new Map<string, number>();
  for (const r of records) {
    rawByDate.set(r.date, (rawByDate.get(r.date) ?? 0) + rawHoursOf(r));
  }
  for (const o of requests) {
    const daily = rawByDate.get(o.date) ?? 0;
    kinds.set(o, daily > 8 ? "overtime" : "extra");
  }
  return kinds;
}

export async function generateReport(yyyyMm: string, log?: (label: string) => void): Promise<Buffer> {
  log?.("start Sheets reads");
  const [employees, punchesByEmp, allOvertimeRequests] = await Promise.all([
    getActiveEmployees(),
    getAllPunchesForMonth(yyyyMm),
    getOvertimeRequestsForMonth(yyyyMm),
  ]);
  log?.("Sheets reads done");

  const fullTimeSet = new Set(employees.filter((e) => e.role === "full_time").map((e) => e.name));

  // Overtime requests → by employee (sorted by date)
  const otByEmp = new Map<string, OvertimeRecord[]>();
  for (const o of allOvertimeRequests) {
    if (!otByEmp.has(o.employee)) otByEmp.set(o.employee, []);
    otByEmp.get(o.employee)!.push(o);
  }
  for (const arr of otByEmp.values()) arr.sort((a, b) => a.date.localeCompare(b.date));

  const applyKinds = (
    summary: EmployeeSummary,
    requests: OvertimeRecord[],
    kinds: Map<OvertimeRecord, RequestKind>,
  ): void => {
    for (const o of requests) {
      const hours = o.minutes / 60;
      if (kinds.get(o) === "extra") summary.normal_hours += hours;
      else summary.overtime_hours += hours;
    }
  };

  // Analyze every employee with punches this month
  const results: EmployeeResult[] = [];
  const seenEmployees = new Set<string>();
  for (const [name, punches] of punchesByEmp) {
    const isFullTime = fullTimeSet.has(name);
    const events = punchesToEvents(punches);
    const { summary, records } = analyzeEmployee(name, events, isFullTime);
    const empOt = otByEmp.get(name) ?? [];
    const requestKinds = classifyRequests(empOt, records, isFullTime);
    applyKinds(summary, empOt, requestKinds);
    if (summary.normal_hours === 0 && summary.overtime_hours === 0 && summary.specials.length === 0) {
      continue;
    }
    results.push({ summary, records, overtimeRequests: empOt, requestKinds });
    seenEmployees.add(name);
  }

  // Employees with only overtime requests (no punches)
  for (const [name, ots] of otByEmp) {
    if (seenEmployees.has(name)) continue;
    const isFullTime = fullTimeSet.has(name);
    const summary: EmployeeSummary = {
      employee: name,
      is_full_time: isFullTime,
      normal_hours: 0,
      overtime_hours: 0,
      specials: [],
      overtime_specials: [],
    };
    const requestKinds = classifyRequests(ots, [], isFullTime);
    applyKinds(summary, ots, requestKinds);
    results.push({ summary, records: [], overtimeRequests: ots, requestKinds });
  }

  results.sort((a, b) => a.summary.employee.localeCompare(b.summary.employee));

  log?.("analyze done, building workbook");
  const buf = await buildWorkbook(results);
  log?.("workbook done");
  return buf;
}

export async function buildWorkbook(results: EmployeeResult[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // ── 摘要 ────────────────────────────────────────────────────────────────
  const wsSummary = wb.addWorksheet("摘要");
  for (const { summary, overtimeRequests, requestKinds } of results) {
    const role = summary.is_full_time ? "正職" : "計時";
    const nameRow = wsSummary.addRow([`${summary.employee}（${role}）`]);
    nameRow.font = { bold: true };
    wsSummary.addRow([`正常時數 ${fmtHours(summary.normal_hours)} 小時`]);
    wsSummary.addRow([`加班時數 ${fmtHours(summary.overtime_hours)} 小時`]);

    wsSummary.addRow(["特殊班別:"]);
    if (summary.specials.length > 0) {
      for (const line of summary.specials) wsSummary.addRow([`  ${line}`]);
    } else {
      wsSummary.addRow(["  無"]);
    }

    if (summary.overtime_specials.length > 0) {
      wsSummary.addRow(["加班提醒:"]);
      for (const line of summary.overtime_specials) wsSummary.addRow([`  ${line}`]);
    }

    const otRequests = overtimeRequests.filter((o) => requestKinds.get(o) === "overtime");
    const extraRequests = overtimeRequests.filter((o) => requestKinds.get(o) === "extra");

    wsSummary.addRow(["加班申請:"]);
    if (otRequests.length > 0) {
      for (const o of otRequests) {
        const reasonPart = o.reason ? ` 原因：${o.reason}` : "";
        wsSummary.addRow([`  ${o.date} ${o.start_time}-${o.end_time}（${o.minutes}分鐘）${reasonPart}`]);
      }
    } else {
      wsSummary.addRow(["  無"]);
    }

    wsSummary.addRow(["加時申請:"]);
    if (extraRequests.length > 0) {
      for (const o of extraRequests) {
        const reasonPart = o.reason ? ` 原因：${o.reason}` : "";
        wsSummary.addRow([`  ${o.date} ${o.start_time}-${o.end_time}（${o.minutes}分鐘）${reasonPart}`]);
      }
    } else {
      wsSummary.addRow(["  無"]);
    }

    wsSummary.addRow([]); // blank separator
  }

  // ── 明細 ────────────────────────────────────────────────────────────────
  const wsDetail = wb.addWorksheet("明細");
  wsDetail.addRow([
    "員工", "班別", "日期", "上班原始", "上班normalized",
    "下班原始", "下班normalized", "正常時數", "加班時數", "備註",
  ]);
  for (const { summary, records, overtimeRequests, requestKinds } of results) {
    // Group overtime requests by date so each date's punch rows are followed
    // by its overtime rows (synthesized as separate "加班" records — display
    // only, not persisted).
    const otByDate = new Map<string, typeof overtimeRequests>();
    for (const o of overtimeRequests) {
      const bucket = otByDate.get(o.date);
      if (bucket) bucket.push(o);
      else otByDate.set(o.date, [o]);
    }

    const dates = Array.from(new Set([
      ...records.map((r) => r.date),
      ...overtimeRequests.map((o) => o.date),
    ])).sort();

    for (const date of dates) {
      for (const r of records) {
        if (r.date !== date) continue;
        wsDetail.addRow([
          r.employee, r.shift, r.date, r.in_raw, r.in_norm, r.out_raw, r.out_norm,
          r.normal_hours, r.overtime_hours, r.note,
        ]);
      }
      for (const o of otByDate.get(date) ?? []) {
        const inStamp = `${o.date} ${o.start_time}:00`;
        const outStamp = `${o.date} ${o.end_time}:00`;
        const inMin = `${o.date} ${o.start_time}`;
        const outMin = `${o.date} ${o.end_time}`;
        const isExtra = requestKinds.get(o) === "extra";
        const label = isExtra ? "加時" : "加班";
        const hours = o.minutes / 60;
        wsDetail.addRow([
          summary.employee, label, o.date, inStamp, inMin, outStamp, outMin,
          isExtra ? hours : 0, isExtra ? 0 : hours, o.reason ?? "",
        ]);
      }
    }
  }
  // 正常時數 / 加班時數: stored as numbers so Excel doesn't flag "number as text".
  wsDetail.getColumn(8).numFmt = "0.0";
  wsDetail.getColumn(9).numFmt = "0.0";

  // Approximate auto-fit — same heuristic as the Python version.
  for (const ws of [wsSummary, wsDetail]) {
    ws.columns.forEach((col) => {
      let maxLen = 0;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const v = cell.value == null ? "" : String(cell.value);
        if (v.length > maxLen) maxLen = v.length;
      });
      col.width = Math.min(maxLen + 4, 60);
    });
  }

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}
