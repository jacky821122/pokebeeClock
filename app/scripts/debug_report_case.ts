/**
 * debug_report_case.ts — one-off case-study harness.
 *
 * Synthesizes a single employee's events, runs the analyzer, and writes
 * a real xlsx through the same buildWorkbook used by production. No Sheets
 * access; safe to run anywhere.
 *
 * Usage:
 *   npx tsx scripts/debug_report_case.ts [outPath]
 */

import * as fs from "fs";
import * as path from "path";

import { analyzeEmployee } from "../src/lib/analyzer";
import { buildWorkbook, classifyRequests } from "../src/lib/report_generator";
import type { Event } from "../src/lib/analyzer/events";
import type { OvertimeRecord } from "../src/lib/sheets";

function dt(dateStr: string, hm: string): Date {
  const [h, m] = hm.split(":").map(Number);
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(y!, mo! - 1, d!, h!, m!, 0, 0);
}

function inEv(date: string, hm: string): Event {
  return { kind: "clock-in", timestamp: dt(date, hm) };
}
function outEv(date: string, hm: string): Event {
  return { kind: "clock-out", timestamp: dt(date, hm) };
}

async function main(): Promise<void> {
  const day1 = "2026-05-01";
  const day2 = "2026-05-02";
  const events: Event[] = [
    // Day 1: 早班 09:55–14:00 (raw 4h05m), 晚班 15:55–20:30 (raw 4h35m). 9hr+ raw → request → 加班.
    inEv(day1, "09:55"),
    outEv(day1, "14:00"),
    inEv(day1, "15:55"),
    outEv(day1, "20:30"),
    // Day 2: 早班 09:55–14:47 (raw 4h52m, single-shift over per-shift cap). <8hr raw → request → 加時.
    inEv(day2, "09:55"),
    outEv(day2, "14:47"),
  ];

  const name = "DEBUG_PT";
  const isFullTime = false;
  const { summary, records } = analyzeEmployee(name, events, isFullTime);

  const overtimeRequests: OvertimeRecord[] = [
    {
      submitted_at: `${day1} 20:35:00`,
      employee: name,
      date: day1,
      start_time: "20:00",
      end_time: "20:30",
      minutes: 30,
      reason: "活動加班",
    },
    {
      submitted_at: `${day2} 14:50:00`,
      employee: name,
      date: day2,
      start_time: "14:00",
      end_time: "14:30",
      minutes: 30,
      reason: "排班補時",
    },
  ];
  // Mirror the production aggregation: classify each request by raw daily
  // punch hours, then split into overtime_hours / normal_hours.
  const requestKinds = classifyRequests(overtimeRequests, records, isFullTime);
  for (const o of overtimeRequests) {
    if (requestKinds.get(o) === "extra") summary.normal_hours += o.minutes / 60;
    else summary.overtime_hours += o.minutes / 60;
  }

  console.log("== summary ==");
  console.log(summary);
  console.log("== records ==");
  for (const r of records) console.log(r);
  console.log("== overtimeRequests ==");
  for (const o of overtimeRequests) console.log(o);

  const buf = await buildWorkbook([{ summary, records, overtimeRequests, requestKinds }]);
  const defaultDir = path.join(process.env.HOME ?? "", "data");
  const requested = path.resolve(process.argv[2] ?? path.join(defaultDir, "debug_report.xlsx"));
  fs.mkdirSync(path.dirname(requested), { recursive: true });
  let outPath = requested;
  if (fs.existsSync(outPath)) {
    const dir = path.dirname(requested);
    const ext = path.extname(requested);
    const stem = path.basename(requested, ext);
    let n = 1;
    while (fs.existsSync(path.join(dir, `${stem}_${n}${ext}`))) n++;
    outPath = path.join(dir, `${stem}_${n}${ext}`);
    console.warn(`檔案已存在（可能被 Excel 開啟中），改寫入：${path.basename(outPath)}`);
  }
  fs.writeFileSync(outPath, buf);
  console.log(`Wrote ${outPath} (${buf.length} bytes).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
