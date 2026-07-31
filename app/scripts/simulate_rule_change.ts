/**
 * Old-vs-new rule comparison for the hourly daily-cap-only change.
 *
 * Runs the same synthetic punch scenarios through the analyzer twice — once
 * dated before `DAILY_CAP_ONLY_FROM` (legacy per-shift rules) and once after
 * (daily-cap-only) — and prints what each scenario pays and flags. Synthetic
 * because the live Sheet needs credentials this script deliberately avoids.
 *
 *   npx tsx scripts/simulate_rule_change.ts
 */
import { analyzeEmployee, DAILY_CAP_ONLY_FROM } from "../src/lib/analyzer/analyzer";
import type { Event } from "../src/lib/analyzer/events";

const BEFORE = "2026-07-15"; // pre-cutover
const AFTER = "2026-08-15"; // post-cutover

/** "HH:MM" on `date` as a naive Date (analyzer reads Taipei wall-clock fields). */
function at(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00`);
}

interface Scenario {
  label: string;
  /** Punch pairs as ["in", "out"]; a null out means the employee forgot to punch out. */
  pairs: Array<[string, string | null]>;
}

const SCENARIOS: Scenario[] = [
  { label: "短班 2.5hr (11:00-13:30)", pairs: [["11:00", "13:30"]] },
  { label: "半天 4.5hr (10:00-14:30)", pairs: [["10:00", "14:30"]] },
  { label: "常見全天 6hr (11:00-17:00)", pairs: [["11:00", "17:00"]] },
  { label: "跨午 5hr (12:00-17:00)", pairs: [["12:00", "17:00"]] },
  { label: "長班 7hr (09:00-16:00)", pairs: [["09:00", "16:00"]] },
  { label: "長班 8hr (10:00-18:00)", pairs: [["10:00", "18:00"]] },
  { label: "超長 10hr (10:00-20:00)", pairs: [["10:00", "20:00"]] },
  {
    label: "兩班分開 4+4 (09:00-13:00, 17:00-21:00)",
    pairs: [
      ["09:00", "13:00"],
      ["17:00", "21:00"],
    ],
  },
  {
    label: "兩班超日上限 6+4 (09:00-15:00, 17:00-21:00)",
    pairs: [
      ["09:00", "15:00"],
      ["17:00", "21:00"],
    ],
  },
  { label: "缺下班打卡 (11:00-?)", pairs: [["11:00", null]] },
];

function eventsFor(date: string, pairs: Scenario["pairs"]): Event[] {
  const evs: Event[] = [];
  for (const [inT, outT] of pairs) {
    evs.push({ kind: "clock-in", timestamp: at(date, inT) });
    if (outT === null) evs.push({ kind: "no-clock-out" });
    else evs.push({ kind: "clock-out", timestamp: at(date, outT) });
  }
  return evs;
}

function run(date: string, s: Scenario) {
  const { summary, records } = analyzeEmployee("測試員工", eventsFor(date, s.pairs), false);
  return {
    hours: summary.normal_hours,
    lines: records.map(
      (r) => `${r.shift} ${r.in_norm.slice(11) || "—"}~${r.out_norm.slice(11) || "—"} ` +
        `${r.normal_hours.toFixed(1)}hr${r.note ? ` │ ${r.note}` : ""}`,
    ),
  };
}

console.log(`規則分界: ${DAILY_CAP_ONLY_FROM}（計時人員 / 非正職）`);
console.log(`舊規則樣本日: ${BEFORE}    新規則樣本日: ${AFTER}\n`);

let changed = 0;
for (const s of SCENARIOS) {
  const before = run(BEFORE, s);
  const after = run(AFTER, s);
  const diff = after.hours - before.hours;
  const mark = Math.abs(diff) > 1e-9 ? "  ← 給薪改變" : "";
  if (mark) changed += 1;

  console.log(`■ ${s.label}`);
  console.log(`  舊 ${before.hours.toFixed(1)}hr → 新 ${after.hours.toFixed(1)}hr` +
    `${diff !== 0 ? ` (${diff > 0 ? "+" : ""}${diff.toFixed(1)})` : ""}${mark}`);
  console.log(`    舊: ${before.lines.join("\n        ") || "(無紀錄)"}`);
  console.log(`    新: ${after.lines.join("\n        ") || "(無紀錄)"}`);
  console.log("");
}

console.log(`共 ${SCENARIOS.length} 個情境，其中 ${changed} 個給薪時數改變。`);
