"""Generate parity-test fixtures by running the Python analyzer against synthetic
event sequences covering the 9 required edge cases.

Run from the pokebee repo root so that `clock_in_out_analyzer` is importable:

    cd /mnt/d/Users/Jacky/SynologyDrive/jacky821122/pokebee
    python /mnt/d/Users/Jacky/SynologyDrive/jacky821122/pokebeeClock-analyzer/tests/fixtures/generate_fixtures.py
"""
from __future__ import annotations

import json
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

# Ensure we import the Python analyzer from the pokebee repo.
POKEBEE = Path("/mnt/d/Users/Jacky/SynologyDrive/jacky821122/pokebee")
sys.path.insert(0, str(POKEBEE))

from clock_in_out_analyzer import (  # noqa: E402
    Event,
    FULL_TIME_NAMES,
    analyze_employee,
)

OUT_DIR = Path(__file__).parent


def dt(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")


def ci(ts: str) -> Event:
    return Event("clock-in", dt(ts))


def co(ts: str) -> Event:
    return Event("clock-out", dt(ts))


def coni(ts: str) -> Event:
    return Event("clock-out-no-in", dt(ts))


def nco() -> Event:
    return Event("no-clock-out")


def serialize_event(e: Event) -> dict:
    return {
        "kind": e.kind,
        "timestamp": e.timestamp.strftime("%Y-%m-%d %H:%M:%S") if e.timestamp else None,
    }


def run_case(case_id: str, name: str, events: list[Event], is_full_time: bool) -> None:
    # Mutate FULL_TIME_NAMES for the run (analyze_employee reads from it).
    original = set(FULL_TIME_NAMES)
    try:
        if is_full_time:
            FULL_TIME_NAMES.add(name)
        else:
            FULL_TIME_NAMES.discard(name)

        records: list = []
        summary = analyze_employee(name, events, records)
    finally:
        FULL_TIME_NAMES.clear()
        FULL_TIME_NAMES.update(original)

    events_payload = {
        "name": name,
        "isFullTime": is_full_time,
        "events": [serialize_event(e) for e in events],
    }
    expected = {
        "summary": {
            "employee": summary.employee,
            "is_full_time": summary.is_full_time,
            "normal_hours": summary.normal_hours,
            "overtime_hours": summary.overtime_hours,
            "specials": list(summary.specials),
            "overtime_specials": list(summary.overtime_specials),
        },
        "records": [asdict(r) for r in records],
    }

    (OUT_DIR / f"{case_id}.events.json").write_text(
        json.dumps(events_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / f"{case_id}.expected.json").write_text(
        json.dumps(expected, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {case_id}")


# ---------------------------------------------------------------------------
# Cases (9 edge cases from the port plan)
# ---------------------------------------------------------------------------

CASES: list[tuple[str, str, list[Event], bool]] = [
    # 1. Full-time standard 8 hours (multiple days)
    (
        "case_01_full_time_normal",
        "小王叭",
        [
            ci("2026-02-01 10:00:00"),
            co("2026-02-01 20:00:00"),
            ci("2026-02-02 09:55:00"),
            co("2026-02-02 20:05:00"),
        ],
        True,
    ),
    # 2. Full-time overtime (clock-out >= 20:30)
    (
        "case_02_full_time_overtime",
        "小王叭",
        [
            ci("2026-02-03 10:00:00"),
            co("2026-02-03 21:09:00"),
        ],
        True,
    ),
    # 3. PT early shift exactly 4 hours
    (
        "case_03_pt_early_4hr",
        "阿姨",
        [
            ci("2026-02-01 10:00:00"),
            co("2026-02-01 14:02:00"),
        ],
        False,
    ),
    # 4. PT late shift 1
    (
        "case_04_pt_late_shift_1",
        "林孟儒",
        [
            ci("2026-02-07 16:07:00"),
            co("2026-02-07 20:30:00"),
        ],
        False,
    ),
    # 4b. PT late shift 2
    (
        "case_04b_pt_late_shift_2",
        "員工B",
        [
            ci("2026-02-10 16:30:00"),
            co("2026-02-10 20:30:00"),
        ],
        False,
    ),
    # 5. Full-day continuous split
    (
        "case_05_full_day_split",
        "許凱惟",
        [
            ci("2026-02-02 10:00:00"),
            co("2026-02-02 20:00:00"),
        ],
        False,
    ),
    # 6. No clock-in (inferred)
    (
        "case_06_no_clock_in",
        "阿姨",
        [
            coni("2026-02-26 14:03:00"),
        ],
        False,
    ),
    # 7. No clock-out
    (
        "case_07_no_clock_out",
        "許凱惟",
        [
            ci("2026-02-07 10:55:00"),
            nco(),
        ],
        False,
    ),
    # 8. Duplicate clock-in within 60s
    (
        "case_08_duplicate_clock_in",
        "林孟儒",
        [
            ci("2026-02-05 10:55:02"),
            ci("2026-02-05 10:55:23"),
            co("2026-02-05 19:47:48"),
        ],
        False,
    ),
    # 9. PT daily overtime (> 8hr triggers redistribution)
    (
        "case_09_pt_daily_overtime",
        "員工C",
        [
            ci("2026-02-11 10:00:00"),
            co("2026-02-11 14:30:00"),   # 4.5hr (早班, past normal end)
            ci("2026-02-11 16:00:00"),
            co("2026-02-11 21:00:00"),   # 5hr on 晚班1 → total 9.5 > 8 triggers
        ],
        False,
    ),
    # Bonus: mixed early-no-out + later shift in same day (江秉哲 case)
    (
        "case_10_early_no_out_then_late",
        "江秉哲",
        [
            ci("2026-02-14 10:00:00"),
            nco(),
            ci("2026-02-14 16:30:00"),
            co("2026-02-14 20:30:00"),
        ],
        False,
    ),
]


def main() -> None:
    index = []
    for case_id, name, events, is_full_time in CASES:
        run_case(case_id, name, events, is_full_time)
        index.append(case_id)
    (OUT_DIR / "index.json").write_text(
        json.dumps(index, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote index.json ({len(index)} cases)")


if __name__ == "__main__":
    main()
