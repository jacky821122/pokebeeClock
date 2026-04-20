# pokebeeClock

iPad PWA for employee clock-in/out and amendment requests. Replaces iCHEF CSV export + LINE notepad workflow.

## Features

- Employee self-service clock-in/out (tap name → enter PIN)
- Amendment submission form (補登)
- Automatic shift analysis on every punch (TypeScript port of Python analyzer)
- On-demand xlsx report for payroll review (摘要 + 明細 + 補班申請)

## Stack

Next.js 16 (App Router) · Vercel · Google Sheets (`googleapis`) · Tailwind v4 · `exceljs`

## Architecture

Three data layers, each serving a distinct audience:

| Layer | Location | Who reads it |
|---|---|---|
| Raw | `raw_punches` tab | Debug / audit only |
| Data | `analyzed_YYYY-MM` tab | Per-day records, auto-updated on every punch |
| Display | on-demand xlsx | Payroll reviewer (hand them the file) |

When the reviewer has questions, they drill down from the xlsx into the data layer, then the raw layer.

### Google Sheet tabs

| Tab | Columns |
|---|---|
| `employees` | `name`, `pin_hash`, `role` (full_time/hourly), `active` |
| `raw_punches` | `id`, `employee`, `client_ts`, `server_ts`, `source`, `kind` (`in`/`out`) |
| `amendments` | `id`, `submitted_at`, `employee`, `date`, `shift`, `in_time`, `out_time`, `reason`, `status` |
| `analyzed_YYYY-MM` | `employee`, `date`, `shift`, `in_raw`, `in_norm`, `out_raw`, `out_norm`, `normal_hours`, `overtime_hours`, `note` |

### Analyzer (V2)

The analyzer calculates hours from punch records with these rules:

- **Full-time**: `(norm_out - norm_in) - 2hr break`, cap 8hr. Flag if raw diff > 10hr 15min.
- **Hourly**: `norm_out - norm_in`, per-shift cap 4hr, daily cap 8hr. Flag if daily total > 8hr 15min.
- **Missing punch**: 0hr + flag (no default hours assumed).
- **Overtime**: never auto-calculated. All overtime comes from overtime requests (planned).
- **Shifts**: 早班 (`normalizedIn < 14:00`) / 晚班 (`>= 14:00`). No sub-categories.
- **Normalize**: unified `roundToHalfHour` for both clock-in and clock-out.

### Punch flow

UI: tap name → choose direction (上班 / 下班, one is highlighted based on the last recorded punch) → enter PIN → submit.

```
/api/punch {employee, pin, kind, client_ts}
  → verifyPin → appendPunch → reanalyzeEmployee
                                └→ getPunchesForMonth → punchesToEvents → analyzeEmployee → writeAnalyzedRecords
```

`punchesToEvents` turns the flat punch list into analyzer `Event`s, inserting synthetic `no-clock-out` events whenever two consecutive `in`s appear (the earlier one was forgotten) or the month ends on an `in`. Legacy rows without an explicit `kind` fall back to alternating order.

### Amendment flow

`/api/amend → appendAmendment` (status=pending; does not trigger recalc — reviewed manually at month-end).

### Display-layer report

Core: `src/lib/report_generator.ts` — pure function, returns an xlsx `Buffer`. Reads `raw_punches` + `employees` + `amendments` for the month and runs the analyzer to build the workbook. Layout mirrors `pokebee/clock_in_out_analyzer.py:write_xlsx_report`:

- **摘要** sheet: per-employee block with `正常時數`, `加班時數`, `特殊班別`, `補班申請`.
- **明細** sheet: flat `PairRecord` table.

Amendments are listed regardless of status (status is kept in the data layer for future drill-down but not shown in the report).

CLI trigger:

```sh
cd app
npx tsx scripts/generate_report.ts <YYYY-MM>
# → data/reports/clock_report_<YYYY-MM>.xlsx
```

A future admin download button can call `generateReport(month)` and stream the same buffer — no CLI-specific logic to port.

## Development

```sh
cd app
npm install
npm run dev
```

Required `.env.local`:

```
GOOGLE_SA_JSON={"type":"service_account",...}
ADMIN_SECRET=...
SHEET_ID=...
```

Run tests and typecheck:

```sh
npm test
npm run typecheck
```

## Docs

- `docs/plan.md` — architecture and implementation plan
- `docs/status.md` — current progress and pending work
- `docs/hours_analyzer_spec.md` — shift analysis rules
- `docs/plan_analyzer_port.md` — TypeScript analyzer port notes
- `CLAUDE.md` — hard constraints for AI coding sessions
