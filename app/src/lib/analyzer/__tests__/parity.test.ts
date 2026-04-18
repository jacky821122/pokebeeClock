/**
 * Parity tests: load each fixture produced by `generate_fixtures.py`
 * (run via the Python reference implementation), feed the serialized events
 * into our TS `analyzeEmployee`, and assert the output JSON matches the
 * Python ground truth byte-for-byte.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeEmployee } from "../analyzer";
import type { Event } from "../events";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

interface SerializedEvent {
  kind: Event["kind"];
  timestamp: string | null;
}
interface EventsFixture {
  name: string;
  isFullTime: boolean;
  events: SerializedEvent[];
}

function parseTs(s: string): Date {
  // "YYYY-MM-DD HH:MM:SS" → local-time Date (matches Python naive datetime).
  const [date, time] = s.split(" ");
  const [y, mo, d] = date!.split("-").map(Number);
  const [h, mi, se] = time!.split(":").map(Number);
  return new Date(y!, mo! - 1, d!, h!, mi!, se!);
}

function deserializeEvents(raw: SerializedEvent[]): Event[] {
  return raw.map((e) => {
    if (e.kind === "no-clock-out") return { kind: e.kind };
    return { kind: e.kind, timestamp: parseTs(e.timestamp!) };
  });
}

const index: string[] = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "index.json"), "utf-8"),
);

describe("parity with Python analyzer", () => {
  for (const caseId of index) {
    it(caseId, () => {
      const eventsFx: EventsFixture = JSON.parse(
        readFileSync(join(FIXTURE_DIR, `${caseId}.events.json`), "utf-8"),
      );
      const expected = JSON.parse(
        readFileSync(join(FIXTURE_DIR, `${caseId}.expected.json`), "utf-8"),
      );

      const events = deserializeEvents(eventsFx.events);
      const { summary, records } = analyzeEmployee(
        eventsFx.name,
        events,
        eventsFx.isFullTime,
      );

      expect(summary).toEqual(expected.summary);
      expect(records).toEqual(expected.records);
    });
  }
});
