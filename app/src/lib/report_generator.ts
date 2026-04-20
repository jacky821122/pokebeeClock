/**
 * Display-layer report generator.
 *
 * Produces a human-readable xlsx matching the Python `write_xlsx_report`
 * layout (pokebee/clock_in_out_analyzer.py). Two sheets:
 *   - 摘要: per-employee block (正常時數 / 加班時數 / 特殊班別 / 補班申請)
 *   - 明細: flat table of PairRecords
 *
 * Pure function — returns a Buffer. The caller decides where it goes
 * (CLI writes to disk; a future admin route could stream it as a download).
 */

import ExcelJS from "exceljs";
import { analyzeEmployee, fmtHours, type EmployeeSummary, type PairRecord } from "@/lib/analyzer";
import { getActiveEmployees, getAllPunchesForMonth, getAmendmentsForMonth, getOvertimeRequestsForMonth, type AmendmentRecord, type OvertimeRecord } from "@/lib/sheets";
import { punchesToEvents } from "@/lib/analyzer_bridge";

interface EmployeeResult {
  summary: EmployeeSummary;
  records: PairRecord[];
  amendments: AmendmentRecord[];
  overtimeRequests: OvertimeRecord[];
}

export async function generateReport(yyyyMm: string, log?: (label: string) => void): Promise<Buffer> {
  log?.("start Sheets reads");
  const [employees, punchesByEmp, allAmendments, allOvertimeRequests] = await Promise.all([
    getActiveEmployees(),
    getAllPunchesForMonth(yyyyMm),
    getAmendmentsForMonth(yyyyMm),
    getOvertimeRequestsForMonth(yyyyMm),
  ]);
  log?.("Sheets reads done");

  const fullTimeSet = new Set(employees.filter((e) => e.role === "full_time").map((e) => e.name));

  // Amendments → by employee (sorted by date)
  const amendByEmp = new Map<string, AmendmentRecord[]>();
  for (const a of allAmendments) {
    if (!amendByEmp.has(a.employee)) amendByEmp.set(a.employee, []);
    amendByEmp.get(a.employee)!.push(a);
  }
  for (const arr of amendByEmp.values()) arr.sort((a, b) => a.date.localeCompare(b.date));

  // Overtime requests → by employee (sorted by date)
  const otByEmp = new Map<string, OvertimeRecord[]>();
  for (const o of allOvertimeRequests) {
    if (!otByEmp.has(o.employee)) otByEmp.set(o.employee, []);
    otByEmp.get(o.employee)!.push(o);
  }
  for (const arr of otByEmp.values()) arr.sort((a, b) => a.date.localeCompare(b.date));

  // Analyze every employee with punches this month
  const results: EmployeeResult[] = [];
  const seenEmployees = new Set<string>();
  for (const [name, punches] of punchesByEmp) {
    const events = punchesToEvents(punches);
    const { summary, records } = analyzeEmployee(name, events, fullTimeSet.has(name));
    const empOt = otByEmp.get(name) ?? [];
    const otMinutes = empOt.reduce((sum, o) => sum + o.minutes, 0);
    summary.overtime_hours += otMinutes / 60;
    if (summary.normal_hours === 0 && summary.overtime_hours === 0 && summary.specials.length === 0) {
      continue;
    }
    results.push({ summary, records, amendments: amendByEmp.get(name) ?? [], overtimeRequests: empOt });
    seenEmployees.add(name);
  }

  // Employees who submitted amendments but have no punches → still appear in report
  for (const [name, amendments] of amendByEmp) {
    if (seenEmployees.has(name)) continue;
    const empOt = otByEmp.get(name) ?? [];
    const otMinutes = empOt.reduce((sum, o) => sum + o.minutes, 0);
    const summary: EmployeeSummary = {
      employee: name,
      is_full_time: fullTimeSet.has(name),
      normal_hours: 0,
      overtime_hours: otMinutes / 60,
      specials: [],
      overtime_specials: [],
    };
    results.push({ summary, records: [], amendments, overtimeRequests: empOt });
    seenEmployees.add(name);
  }

  // Employees with only overtime requests (no punches, no amendments)
  for (const [name, ots] of otByEmp) {
    if (seenEmployees.has(name)) continue;
    const otMinutes = ots.reduce((sum, o) => sum + o.minutes, 0);
    const summary: EmployeeSummary = {
      employee: name,
      is_full_time: fullTimeSet.has(name),
      normal_hours: 0,
      overtime_hours: otMinutes / 60,
      specials: [],
      overtime_specials: [],
    };
    results.push({ summary, records: [], amendments: [], overtimeRequests: ots });
  }

  results.sort((a, b) => a.summary.employee.localeCompare(b.summary.employee));

  log?.("analyze done, building workbook");
  const buf = await buildWorkbook(results);
  log?.("workbook done");
  return buf;
}

async function buildWorkbook(results: EmployeeResult[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // ── 摘要 ────────────────────────────────────────────────────────────────
  const wsSummary = wb.addWorksheet("摘要");
  for (const { summary, amendments, overtimeRequests } of results) {
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
      wsSummary.addRow(["加班:"]);
      for (const line of summary.overtime_specials) wsSummary.addRow([`  ${line}`]);
    }

    wsSummary.addRow(["補班申請:"]);
    if (amendments.length > 0) {
      for (const a of amendments) {
        const range = a.in_time && a.out_time ? `${a.in_time}-${a.out_time}` : (a.in_time || a.out_time || "");
        wsSummary.addRow([`  ${a.date} ${range} 原因：${a.reason}`]);
      }
    } else {
      wsSummary.addRow(["  無"]);
    }

    wsSummary.addRow(["加班申請:"]);
    if (overtimeRequests.length > 0) {
      for (const o of overtimeRequests) {
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
  for (const { records } of results) {
    for (const r of records) {
      wsDetail.addRow([
        r.employee, r.shift, r.date, r.in_raw, r.in_norm, r.out_raw, r.out_norm,
        fmtHours(r.normal_hours), fmtHours(r.overtime_hours), r.note,
      ]);
    }
  }

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
