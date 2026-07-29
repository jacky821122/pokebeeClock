# pokebeeClock

iPad PWA for employee clock-in/out. Replaces iCHEF CSV export + LINE notepad workflow.

## Features

- Employee self-service clock-in/out (enter PIN → choose direction)
- Supplement punch for missing records (補登打卡)
- Overtime request with 24hr cancel window (加班申請)
- Missing punch detection with suggested times (缺卡提示)
- Automatic shift analysis on every punch (TypeScript port of Python analyzer)
- Admin panel: employee management, bulk reanalyze, report download
- On-demand xlsx report for payroll review (摘要 + 明細 + 加班申請)

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
| `overtime_requests` | `id`, `employee`, `date`, `start_time`, `end_time`, `hours`, `reason`, `status`, `submitted_at` |
| `analyzed_YYYY-MM` | `employee`, `date`, `shift`, `in_raw`, `in_norm`, `out_raw`, `out_norm`, `normal_hours`, `overtime_hours`, `note` |

### Analyzer (V2)

The analyzer calculates hours from punch records with these rules:

- **Full-time**: `norm_out - norm_in`, cap 8hr (no break deduction). Flag if raw diff > 10hr 15min.
- **Hourly**: `norm_out - norm_in`, daily cap 8hr (first-come-first-served in punch order). Flag uses **actual hours** (before cap) > 8hr 15min.
- **Long-span note** (hourly): a single pair with raw span >= 7hr is paid but flagged — either a genuine long day needing an overtime request, or a forgotten mid-day out/in pair.
- **Missing punch**: 0hr + flag (no default hours assumed).
- **Overtime**: never auto-calculated. All overtime comes from overtime requests.
- **Shifts**: 早班 (`normalizedIn < 14:00`) / 晚班 (`>= 14:00`). Descriptive only — no effect on hours.
- **Normalize**: unified `roundToHalfHour` for both clock-in and clock-out.

Hourly rules are versioned by record date (`DAILY_CAP_ONLY_FROM = "2026-08-01"` in `analyzer.ts`) so already-paid months stay reproducible. Records **before** the cutover keep the original per-shift cap 4hr, and an `normIn < 14:00` with `normOut >= 17:00` is split into 早班缺out + 晚班缺in (both 0hr) instead of getting the long-span note.

### Punch flow

UI: enter PIN → `/api/identify` returns employee + suggested direction + missing punches → choose direction (上班 / 下班) or supplement/overtime → submit.

```
/api/punch {employee, pin, kind, client_ts}
  → verifyPin → appendPunch → reanalyzeEmployee
                                └→ getPunchesForMonth → punchesToEvents → analyzeEmployee → writeAnalyzedRecords
```

`punchesToEvents` turns the flat punch list into analyzer `Event`s, inserting synthetic `no-clock-out` events whenever two consecutive `in`s appear (the earlier one was forgotten) or the month ends on an `in`. Legacy rows without an explicit `kind` fall back to alternating order.

### Overtime flow

`/api/overtime {employee, date, start_time, end_time, reason}` → calculates hours in 15min units → appends to `overtime_requests` tab. Employees can cancel within 24hr. Report generator reads `overtime_requests` and adds overtime hours to the summary.

### Display-layer report

Core: `src/lib/report_generator.ts` — pure function, returns an xlsx `Buffer`. Reads `raw_punches` + `employees` + `overtime_requests` for the month and runs the analyzer to build the workbook. Layout mirrors `pokebee/clock_in_out_analyzer.py:write_xlsx_report`:

- **摘要** sheet: per-employee block with `正常時數`, `加班時數`, `特殊班別`, `加班申請`.
- **明細** sheet: flat `PairRecord` table.

CLI trigger:

```sh
cd app
npx tsx scripts/generate_report.ts <YYYY-MM>
# → data/reports/clock_report_<YYYY-MM>.xlsx
```

A future admin download button can call `generateReport(month)` and stream the same buffer — no CLI-specific logic to port.

## Performance notes

Google Sheets is the only data store, and each call costs 200–500ms. The PIN-entry flow has been tuned to minimise that cost:

- **Single round-trip per PIN entry** — `loadIdentifyContext` (`src/lib/sheets.ts`) issues one `batchGet` for `devices` + `employees` + `raw_punches` plus a parallel read of the current month's `analyzed_*` tab (kept separate so a missing tab doesn't fail the batch).
- **Module-level auth + sheets client cache** — warm Vercel containers skip the SA-JSON parse and the client construction.
- **TTL cache for slow-changing tabs** — `employees` and `devices` rows are cached for 5 minutes in memory. Admin add/update employee paths call `invalidateEmployeesCache()` so PIN changes propagate immediately. Direct Sheet edits to `devices` propagate within the TTL.

### Cold-start mitigation (`/api/warmup`)

iPad PWA usage is bursty: idle 2+ hours, then several employees punch in quick succession at ~10:00 / 14:00 / 16:00 / 20:00. Vercel recycles idle containers after ~10–15 min, so without intervention the first employee in each burst pays the full cold-start cost (~1–2s).

`/api/warmup` runs the same batched read as identify (with an empty PIN) to warm the Node container, auth client, and TTL caches. Vercel free plan only allows one daily cron, so use an external scheduler (e.g. cron-job.org, GitHub Actions) to hit it before each daily peak:

| Purpose | Taipei | UTC |
|---|---|---|
| Before 早班 | 09:50 | 01:50 |
| 早班 end | 14:00 | 06:00 |
| Before 晚班 | 15:50 | 07:50 |
| 收班 | 20:00 | 12:00 |

Caveat: free plan doesn't pin a single instance per region, so warm-up reduces — but doesn't eliminate — first-request cold starts.

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

Device tokens are stored in the Sheet's `devices` tab (not env). See `docs/device_setup.md` for setup steps.

Run tests and typecheck:

```sh
npm test
npm run typecheck
```

## Docs

- `docs/device_setup.md` — device token 設定步驟（iPad / 個人手機）
- `docs/plan.md` — architecture and implementation plan
- `docs/status.md` — current progress and pending work
- `docs/hours_analyzer_spec.md` — shift analysis rules
- `docs/plan_analyzer_port.md` — TypeScript analyzer port notes
- `CLAUDE.md` — hard constraints for AI coding sessions

