/**
 * V2 analyzer tests: verify the new calculation rules.
 * - No automatic overtime (overtime_hours always 0)
 * - Missing punch = 0hr + flag
 * - Full-time: in/out span, cap 8hr (no break deduction), flag at >10hr15min
 * - Hourly: actual hours, daily cap 8hr, flag at >8hr15min
 *
 * Hourly rules are versioned by record date (`DAILY_CAP_ONLY_FROM`), so the
 * "hourly" block below uses pre-cutover dates and the "hourly, daily-cap-only"
 * block uses post-cutover ones.
 */
import { describe, expect, it } from "vitest";
import { analyzeEmployee } from "../analyzer";
import type { Event } from "../events";

function dt(dateStr: string, hm: string): Date {
  const [h, m] = hm.split(":").map(Number);
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(y!, mo! - 1, d!, h!, m!, 0, 0);
}

function ev(kind: Event["kind"], dateStr?: string, hm?: string): Event {
  if (kind === "no-clock-out") return { kind };
  return { kind, timestamp: dt(dateStr!, hm!) } as Event;
}

describe("V2 analyzer — full-time", () => {
  it("normal day 10:00-20:00 → 8hr (span 10hr capped at 8)", () => {
    const { summary, records } = analyzeEmployee("A", [
      ev("clock-in", "2026-02-01", "10:00"),
      ev("clock-out", "2026-02-01", "20:00"),
    ], true);
    expect(summary.normal_hours).toBe(8);
    expect(summary.overtime_hours).toBe(0);
    expect(records[0]!.normal_hours).toBe(8);
    expect(records[0]!.overtime_hours).toBe(0);
    expect(records[0]!.note).toBe("");
  });

  it("short day 10:00-14:00 → 4hr (span < 8hr, no break deduction)", () => {
    const { summary, records } = analyzeEmployee("A", [
      ev("clock-in", "2026-02-01", "10:00"),
      ev("clock-out", "2026-02-01", "14:00"),
    ], true);
    expect(summary.normal_hours).toBe(4);
    expect(records[0]!.normal_hours).toBe(4);
    expect(records[0]!.note).toBe("");
  });

  it("8hr present 09:00-17:00 → 8hr (boundary, no cliff)", () => {
    const { records } = analyzeEmployee("A", [
      ev("clock-in", "2026-02-01", "09:00"),
      ev("clock-out", "2026-02-01", "17:00"),
    ], true);
    expect(records[0]!.normal_hours).toBe(8);
  });

  it("long day 10:00-21:09 → 8hr + flag (>10hr15min)", () => {
    const { summary, records } = analyzeEmployee("A", [
      ev("clock-in", "2026-02-01", "10:00"),
      ev("clock-out", "2026-02-01", "21:09"),
    ], true);
    expect(summary.normal_hours).toBe(8);
    expect(summary.overtime_hours).toBe(0);
    expect(records[0]!.note).toContain("請確認是否需申請加班");
  });

  it("10:00-20:15 → 8hr, no flag (10.25hr = exactly threshold, not exceeded)", () => {
    // roundToHalfHour(20:15) = 20:30 → rawHours = 10.5 > 10.25 → flag
    const { summary, records } = analyzeEmployee("A", [
      ev("clock-in", "2026-02-01", "10:00"),
      ev("clock-out", "2026-02-01", "20:15"),
    ], true);
    expect(summary.normal_hours).toBe(8);
    expect(records[0]!.note).toContain("請確認是否需申請加班");
  });

  it("missing clock-out → 0hr + flag", () => {
    const { summary, records } = analyzeEmployee("A", [
      ev("clock-in", "2026-02-01", "10:00"),
      ev("no-clock-out"),
    ], true);
    expect(summary.normal_hours).toBe(0);
    expect(records[0]!.note).toContain("缺下班打卡");
  });

  it("missing clock-in → 0hr + flag", () => {
    const { summary, records } = analyzeEmployee("A", [
      ev("clock-out-no-in", "2026-02-01", "20:00"),
    ], true);
    expect(summary.normal_hours).toBe(0);
    expect(records[0]!.note).toContain("缺上班打卡");
  });
});

describe("V2 analyzer — hourly (pre-2026-08-01: per-shift cap + full-day split)", () => {
  it("early shift 10:00-14:00 → 4hr", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-02-01", "10:00"),
      ev("clock-out", "2026-02-01", "14:00"),
    ], false);
    expect(records[0]!.shift).toBe("早班");
    expect(records[0]!.normal_hours).toBe(4);
    expect(records[0]!.note).toBe("");
  });

  it("late shift 16:00-20:30 → 4hr cap + flag", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-02-01", "16:07"),
      ev("clock-out", "2026-02-01", "20:30"),
    ], false);
    expect(records[0]!.shift).toBe("晚班");
    expect(records[0]!.normal_hours).toBe(4);
    expect(records[0]!.note).toContain("上限 4 小時");
  });

  it("full-day span 10:00-20:00 → 早班缺out + 晚班缺in, each 0hr + flag", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-02-01", "10:00"),
      ev("clock-out", "2026-02-01", "20:00"),
    ], false);
    expect(records).toHaveLength(2);
    expect(records[0]!.shift).toBe("早班");
    expect(records[0]!.normal_hours).toBe(0);
    expect(records[0]!.note).toContain("早班缺下班打卡");
    expect(records[1]!.shift).toBe("晚班");
    expect(records[1]!.normal_hours).toBe(0);
    expect(records[1]!.note).toContain("晚班缺上班打卡");
    expect(summary.normal_hours).toBe(0);
  });

  it("10:00-18:00 also triggers missing punch detection (out >= 17:00)", () => {
    const { records } = analyzeEmployee("B", [
      ev("clock-in", "2026-02-01", "10:00"),
      ev("clock-out", "2026-02-01", "18:00"),
    ], false);
    expect(records).toHaveLength(2);
    expect(records[0]!.shift).toBe("早班");
    expect(records[0]!.note).toContain("早班缺下班打卡");
    expect(records[1]!.shift).toBe("晚班");
    expect(records[1]!.note).toContain("晚班缺上班打卡");
  });

  it("10:00-14:30 stays as normal early shift cap 4hr (out < 15:00)", () => {
    const { records } = analyzeEmployee("B", [
      ev("clock-in", "2026-02-01", "10:00"),
      ev("clock-out", "2026-02-01", "14:20"),
    ], false);
    expect(records).toHaveLength(1);
    expect(records[0]!.shift).toBe("早班");
    expect(records[0]!.normal_hours).toBe(4);
  });

  it("missing clock-out → 0hr + flag", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-02-01", "10:55"),
      ev("no-clock-out"),
    ], false);
    expect(records[0]!.normal_hours).toBe(0);
    expect(records[0]!.note).toContain("缺下班打卡");
  });

  it("missing clock-in → 0hr + flag", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-out-no-in", "2026-02-01", "14:03"),
    ], false);
    expect(records[0]!.normal_hours).toBe(0);
    expect(records[0]!.note).toContain("缺上班打卡");
  });

  it("daily cap: two shifts totaling >8hr → cap 8hr", () => {
    const { summary } = analyzeEmployee("B", [
      ev("clock-in", "2026-02-01", "10:00"),
      ev("clock-out", "2026-02-01", "14:30"),
      ev("clock-in", "2026-02-01", "16:00"),
      ev("clock-out", "2026-02-01", "21:00"),
    ], false);
    // Each shift caps at 4hr → total 8hr, no daily flag
    expect(summary.normal_hours).toBe(8);
    expect(summary.overtime_hours).toBe(0);
  });

  it("daily flag: actual hours > 8hr15min triggers flag even after cap", () => {
    // Two shifts: 10:00-14:30 (4.5hr) + 16:00-20:30 (4.5hr) = 9hr actual
    const { summary } = analyzeEmployee("B", [
      ev("clock-in", "2026-02-01", "10:00"),
      ev("clock-out", "2026-02-01", "14:20"),
      ev("clock-in", "2026-02-01", "16:00"),
      ev("clock-out", "2026-02-01", "20:50"),
    ], false);
    // Each capped to 4hr → normal = 8, but actual 9hr > 8.25 → flagged
    expect(summary.normal_hours).toBe(8);
    expect(summary.overtime_specials.length).toBeGreaterThan(0);
    expect(summary.overtime_specials[0]).toContain("請確認是否需申請加班");
  });

  it("duplicate clock-in within 60s → discard latter", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-02-01", "10:55"),
      ev("clock-in", "2026-02-01", "10:55"),
      ev("clock-out", "2026-02-01", "14:00"),
    ], false);
    expect(records).toHaveLength(1);
    expect(summary.specials.some(s => s.includes("重複"))).toBe(true);
  });

  it("early no-clock-out then late shift", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-02-14", "10:00"),
      ev("no-clock-out"),
      ev("clock-in", "2026-02-14", "16:30"),
      ev("clock-out", "2026-02-14", "20:30"),
    ], false);
    // First pair: missing out → 0hr
    expect(records[0]!.normal_hours).toBe(0);
    expect(records[0]!.note).toContain("缺下班打卡");
    // Second pair: 16:30-20:30 = 4hr
    expect(records[1]!.normal_hours).toBe(4);
    expect(records[1]!.shift).toBe("晚班");
  });
});

describe("V2 analyzer — hourly, daily-cap-only (2026-08-01 onward)", () => {
  it("2.5hr shift 10:00-12:30 → paid in full", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-08-03", "10:00"),
      ev("clock-out", "2026-08-03", "12:30"),
    ], false);
    expect(records).toHaveLength(1);
    expect(records[0]!.normal_hours).toBe(2.5);
    expect(records[0]!.note).toBe("");
    expect(summary.normal_hours).toBe(2.5);
  });

  it("4.5hr shift 16:00-20:30 → 4.5hr, no per-shift cap, no note", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-08-03", "16:00"),
      ev("clock-out", "2026-08-03", "20:30"),
    ], false);
    expect(records[0]!.shift).toBe("晚班");
    expect(records[0]!.normal_hours).toBe(4.5);
    expect(records[0]!.note).toBe("");
    expect(summary.normal_hours).toBe(4.5);
  });

  it("6hr shift 09:00-15:00 → 6hr, no note (below 7hr threshold)", () => {
    const { records } = analyzeEmployee("B", [
      ev("clock-in", "2026-08-03", "09:00"),
      ev("clock-out", "2026-08-03", "15:00"),
    ], false);
    expect(records).toHaveLength(1);
    expect(records[0]!.normal_hours).toBe(6);
    expect(records[0]!.note).toBe("");
  });

  it("12:00-17:00 → one 5hr record (no longer split by the old in<14/out>=17 rule)", () => {
    const { records } = analyzeEmployee("B", [
      ev("clock-in", "2026-08-03", "12:00"),
      ev("clock-out", "2026-08-03", "17:00"),
    ], false);
    expect(records).toHaveLength(1);
    expect(records[0]!.normal_hours).toBe(5);
    expect(records[0]!.note).toBe("");
  });

  it("09:00-16:00 → 7hr paid + note at the threshold boundary", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-08-03", "09:00"),
      ev("clock-out", "2026-08-03", "16:00"),
    ], false);
    expect(records).toHaveLength(1);
    expect(records[0]!.normal_hours).toBe(7);
    expect(records[0]!.note).toContain("超過 7 小時");
    expect(summary.normal_hours).toBe(7);
  });

  it("10:00-18:00 → one 8hr record + note (was split into two 0hr records before)", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-08-03", "10:00"),
      ev("clock-out", "2026-08-03", "18:00"),
    ], false);
    expect(records).toHaveLength(1);
    expect(records[0]!.shift).toBe("早班");
    expect(records[0]!.normal_hours).toBe(8);
    expect(records[0]!.note).toContain("請確認是否漏打卡或需申請加班");
    expect(summary.normal_hours).toBe(8);
    // raw 8.0 < 8.25 → the daily overtime reminder does not fire; the
    // long-span note is the only signal, which is exactly why it exists.
    expect(summary.overtime_specials).toHaveLength(0);
  });

  it("long-span note never contains the missing-punch substrings", () => {
    // getMissingPunches / loadEmployeeStatus match on these; a collision would
    // raise a phantom 缺卡 prompt on a record that has both punches.
    const { records } = analyzeEmployee("B", [
      ev("clock-in", "2026-08-03", "10:00"),
      ev("clock-out", "2026-08-03", "20:00"),
    ], false);
    expect(records).toHaveLength(1);
    expect(records[0]!.note).not.toContain("缺上班打卡");
    expect(records[0]!.note).not.toContain("缺下班打卡");
  });

  it("10:00-20:00 → capped at 8hr, long-span note + daily overtime reminder", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-08-03", "10:00"),
      ev("clock-out", "2026-08-03", "20:00"),
    ], false);
    expect(records[0]!.normal_hours).toBe(8);
    expect(records[0]!.overtime_hours).toBe(0);
    expect(summary.normal_hours).toBe(8);
    expect(summary.overtime_specials[0]).toContain("請確認是否需申請加班");
  });

  it("daily cap is first-come-first-served: 6hr + 4hr → 6hr and 2hr", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-08-03", "09:00"),
      ev("clock-out", "2026-08-03", "15:00"),
      ev("clock-in", "2026-08-03", "17:00"),
      ev("clock-out", "2026-08-03", "21:00"),
    ], false);
    expect(records).toHaveLength(2);
    expect(records[0]!.normal_hours).toBe(6);
    expect(records[1]!.normal_hours).toBe(2); // truncated by the daily cap
    expect(summary.normal_hours).toBe(8);
    expect(summary.overtime_specials[0]).toContain("請確認是否需申請加班");
  });

  it("missing punches still produce 0hr + flag", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-08-03", "10:55"),
      ev("no-clock-out"),
    ], false);
    expect(records[0]!.normal_hours).toBe(0);
    expect(records[0]!.note).toContain("缺下班打卡");
    expect(summary.normal_hours).toBe(0);
  });
});

describe("V2 analyzer — hourly rule cutover boundary", () => {
  it("2026-07-31 10:00-18:00 → still splits into two 0hr records", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-07-31", "10:00"),
      ev("clock-out", "2026-07-31", "18:00"),
    ], false);
    expect(records).toHaveLength(2);
    expect(summary.normal_hours).toBe(0);
  });

  it("2026-08-01 10:00-18:00 → one record paid 8hr", () => {
    const { summary, records } = analyzeEmployee("B", [
      ev("clock-in", "2026-08-01", "10:00"),
      ev("clock-out", "2026-08-01", "18:00"),
    ], false);
    expect(records).toHaveLength(1);
    expect(summary.normal_hours).toBe(8);
  });

  it("2026-07-31 16:00-20:30 → per-shift cap 4hr; 2026-08-01 → 4.5hr", () => {
    const before = analyzeEmployee("B", [
      ev("clock-in", "2026-07-31", "16:00"),
      ev("clock-out", "2026-07-31", "20:30"),
    ], false);
    const after = analyzeEmployee("B", [
      ev("clock-in", "2026-08-01", "16:00"),
      ev("clock-out", "2026-08-01", "20:30"),
    ], false);
    expect(before.summary.normal_hours).toBe(4);
    expect(after.summary.normal_hours).toBe(4.5);
  });
});
