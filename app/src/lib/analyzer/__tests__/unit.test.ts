/**
 * Unit tests for the pure time utilities, mirroring
 * `tests/test_clock_in_out_analyzer.py` in the pokebee repo.
 */
import { describe, expect, it } from "vitest";
import {
  ceilingToHalfHour,
  fmtHours,
  normalizeInTime,
  normalizeOutTime,
  roundToHalfHour,
  floorToHalfHour,
} from "../time_utils";
import { classifyShift } from "../analyzer";

const dt = (hm: string): Date => {
  const [h, m] = hm.split(":").map(Number);
  return new Date(2026, 1, 1, h!, m!, 0, 0); // 2026-02-01 (month is 0-indexed)
};

describe("ceilingToHalfHour", () => {
  it("09:11 → 09:30", () => expect(ceilingToHalfHour(dt("09:11"))).toEqual(dt("09:30")));
  it("09:30 → 09:30", () => expect(ceilingToHalfHour(dt("09:30"))).toEqual(dt("09:30")));
  it("09:31 → 10:00", () => expect(ceilingToHalfHour(dt("09:31"))).toEqual(dt("10:00")));
  it("09:59 → 10:00", () => expect(ceilingToHalfHour(dt("09:59"))).toEqual(dt("10:00")));
});

describe("roundToHalfHour", () => {
  it("10:07 → 10:00", () => expect(roundToHalfHour(dt("10:07"))).toEqual(dt("10:00")));
  it("10:20 → 10:30", () => expect(roundToHalfHour(dt("10:20"))).toEqual(dt("10:30")));
  it("10:55 → 11:00", () => expect(roundToHalfHour(dt("10:55"))).toEqual(dt("11:00")));
});

describe("floorToHalfHour", () => {
  it("20:49 → 20:30", () => expect(floorToHalfHour(dt("20:49"))).toEqual(dt("20:30")));
  it("20:29 → 20:00", () => expect(floorToHalfHour(dt("20:29"))).toEqual(dt("20:00")));
});

describe("normalizeInTime", () => {
  // V2: unified roundToHalfHour for all times
  it("09:11 → 09:00", () => expect(normalizeInTime(dt("09:11"))).toEqual(dt("09:00")));
  it("09:55 → 10:00", () => expect(normalizeInTime(dt("09:55"))).toEqual(dt("10:00")));
  it("10:00 → 10:00", () => expect(normalizeInTime(dt("10:00"))).toEqual(dt("10:00")));
  it("10:20 → 10:30", () => expect(normalizeInTime(dt("10:20"))).toEqual(dt("10:30")));
  it("16:07 → 16:00", () => expect(normalizeInTime(dt("16:07"))).toEqual(dt("16:00")));
});

describe("normalizeOutTime", () => {
  // V2: unified roundToHalfHour, no grace period
  it("19:47 → 20:00", () =>
    expect(normalizeOutTime(dt("19:47"))).toEqual(dt("20:00")));
  it("20:17 → 20:30", () =>
    expect(normalizeOutTime(dt("20:17"))).toEqual(dt("20:30")));
  it("20:29 → 20:30", () =>
    expect(normalizeOutTime(dt("20:29"))).toEqual(dt("20:30")));
  it("20:49 → 21:00", () =>
    expect(normalizeOutTime(dt("20:49"))).toEqual(dt("21:00")));
  it("21:09 → 21:00", () =>
    expect(normalizeOutTime(dt("21:09"))).toEqual(dt("21:00")));
});

describe("classifyShift", () => {
  // V2: only 早班 / 晚班
  it("10:00 → 早班", () => expect(classifyShift(dt("10:00"))).toBe("早班"));
  it("13:30 → 早班", () => expect(classifyShift(dt("13:30"))).toBe("早班"));
  it("14:00 → 晚班", () => expect(classifyShift(dt("14:00"))).toBe("晚班"));
  it("16:00 → 晚班", () => expect(classifyShift(dt("16:00"))).toBe("晚班"));
  it("16:30 → 晚班", () => expect(classifyShift(dt("16:30"))).toBe("晚班"));
});

describe("fmtHours", () => {
  it("integer", () => expect(fmtHours(8)).toBe("8"));
  it("8.0 → 8", () => expect(fmtHours(8.0)).toBe("8"));
  it("4.5 → 4.5", () => expect(fmtHours(4.5)).toBe("4.5"));
  it("0 → 0", () => expect(fmtHours(0)).toBe("0"));
  it("1.0 → 1", () => expect(fmtHours(1.0)).toBe("1"));
  it("9.5 → 9.5", () => expect(fmtHours(9.5)).toBe("9.5"));
});
