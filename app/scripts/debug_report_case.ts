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
import { buildWorkbook } from "../src/lib/report_generator";
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
  const date = "2026-05-01";
  // 早班 09:55–14:00 (raw 4h05m), 晚班 15:55–20:30 (raw 4h35m).
  const events: Event[] = [
    inEv(date, "09:55"),
    outEv(date, "14:00"),
    inEv(date, "15:55"),
    outEv(date, "20:30"),
  ];

  const name = "DEBUG_PT";
  const isFullTime = false;
  const { summary, records } = analyzeEmployee(name, events, isFullTime);

  // Simulate an approved overtime request: 同日 20:00-20:30，30 分鐘.
  const overtimeRequests: OvertimeRecord[] = [
    {
      submitted_at: `${date} 20:35:00`,
      employee: name,
      date,
      start_time: "20:00",
      end_time: "20:30",
      minutes: 30,
      reason: "活動加班",
    },
  ];
  summary.overtime_hours += overtimeRequests.reduce((s, o) => s + o.minutes, 0) / 60;

  console.log("== summary ==");
  console.log(summary);
  console.log("== records ==");
  for (const r of records) console.log(r);
  console.log("== overtimeRequests ==");
  for (const o of overtimeRequests) console.log(o);

  const buf = await buildWorkbook([{ summary, records, overtimeRequests }]);
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
