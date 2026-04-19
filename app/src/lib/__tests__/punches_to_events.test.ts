import { describe, expect, it } from "vitest";
import { punchesToEvents } from "../analyzer_bridge";
import type { PunchRow } from "../sheets";

function row(ts: string, kind: PunchRow["kind"]): PunchRow {
  return { ts, kind };
}

describe("punchesToEvents", () => {
  it("maps explicit in/out to clock-in/clock-out", () => {
    const events = punchesToEvents([
      row("2026-03-03T09:27:40+08:00", "in"),
      row("2026-03-03T20:01:52+08:00", "out"),
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "clock-in" });
    expect(events[1]).toMatchObject({ kind: "clock-out" });
  });

  it("inserts no-clock-out between two consecutive in events", () => {
    // Missed the out on Mar 2 (day before), then clocked in Mar 3.
    const events = punchesToEvents([
      row("2026-03-02T09:55:10+08:00", "in"),
      row("2026-03-03T09:27:40+08:00", "in"),
      row("2026-03-03T20:01:52+08:00", "out"),
    ]);
    expect(events.map((e) => e.kind)).toEqual(["clock-in", "no-clock-out", "clock-in", "clock-out"]);
  });

  it("appends no-clock-out when sequence ends with in", () => {
    const events = punchesToEvents([
      row("2026-03-24T09:52:50+08:00", "in"),
    ]);
    expect(events.map((e) => e.kind)).toEqual(["clock-in", "no-clock-out"]);
  });

  it("falls back to alternating when kind is empty (legacy rows)", () => {
    const events = punchesToEvents([
      row("2026-03-03T09:27:40+08:00", ""),
      row("2026-03-03T20:01:52+08:00", ""),
      row("2026-03-04T09:56:17+08:00", ""),
      row("2026-03-04T20:08:30+08:00", ""),
    ]);
    expect(events.map((e) => e.kind)).toEqual([
      "clock-in", "clock-out", "clock-in", "clock-out",
    ]);
  });

  it("alternating fallback produces trailing no-clock-out on odd count", () => {
    const events = punchesToEvents([
      row("2026-03-03T09:27:40+08:00", ""),
      row("2026-03-03T20:01:52+08:00", ""),
      row("2026-03-24T09:52:50+08:00", ""),
    ]);
    expect(events.map((e) => e.kind)).toEqual(["clock-in", "clock-out", "clock-in", "no-clock-out"]);
  });

  it("explicit kind takes precedence over position when mixed with legacy", () => {
    // Legacy in (empty), then explicit in → no-clock-out should appear between.
    const events = punchesToEvents([
      row("2026-03-02T09:55:10+08:00", ""),
      row("2026-03-03T09:27:40+08:00", "in"),
      row("2026-03-03T20:01:52+08:00", "out"),
    ]);
    expect(events.map((e) => e.kind)).toEqual(["clock-in", "no-clock-out", "clock-in", "clock-out"]);
  });

  it("iCHEF 小王叭 2026-03 scenario: leading in with no out, middle intact, trailing in", () => {
    // Condensed version of the real fixture the user shared.
    const events = punchesToEvents([
      row("2026-03-02T09:55:10+08:00", "in"),   // no-clock-out (next is another in)
      row("2026-03-03T09:27:40+08:00", "in"),
      row("2026-03-03T20:01:52+08:00", "out"),
      row("2026-03-24T09:52:50+08:00", "in"),   // trailing in → no-clock-out
    ]);
    expect(events.map((e) => e.kind)).toEqual([
      "clock-in", "no-clock-out", "clock-in", "clock-out", "clock-in", "no-clock-out",
    ]);
  });
});
