/**
 * V2 analyzer tests: verify the new calculation rules.
 * - No automatic overtime (overtime_hours always 0)
 * - Missing punch = 0hr + flag
 * - Full-time: punch diff - 2hr break, cap 8hr, flag at >10hr15min
 * - Hourly: actual hours, per-shift cap 4hr, daily cap 8hr, flag at >8hr15min
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
  it("normal day 10:00-20:00 → 8hr (10hr - 2hr break)", () => {
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

describe("V2 analyzer — hourly", () => {
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
