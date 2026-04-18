# pokebeeClock — Playbook

## Project overview

iPad PWA for employee clock-in/out + amendment requests. Single Google Sheet as data store.
See `docs/plan.md` for full architecture and `docs/hours_analyzer_spec.md` for analyzer rules.

## Tech stack

- Next.js (App Router) + Vercel
- Google Sheets via `googleapis` service account
- Tailwind v4
- Analyzer: `src/lib/analyzer/` (ported from `pokebeeClock-analyzer/`)

## Google Sheet tabs

| Tab | Purpose |
|-----|---------|
| `employees` | name, pin_hash (sha256), role (full_time/hourly), active |
| `raw_punches` | id, employee, client_ts, server_ts, source |
| `amendments` | id, submitted_at, employee, date, shift, in_time, out_time, reason, status |
| `analyzed_YYYY-MM` | per-employee daily records (matches Python XLSX detail) |
| `summary_YYYY-MM` | per-employee monthly summary |

## Auth

- Main app: open (iPad stays on manager's Google session)
- `/admin` + admin API routes: `Authorization: Bearer $ADMIN_SECRET`
- PIN stored as sha256, never plaintext

## Environment variables

```
GOOGLE_SA_JSON          # service account JSON (full JSON string)
ADMIN_SECRET            # protects /admin routes
SHEET_ID                # Google Spreadsheet ID
```

## Add/modify API routes

Path: `src/app/api/{name}/route.ts`. Sheets I/O in `src/lib/sheets.ts`.
Admin routes: check `Authorization: Bearer ${process.env.ADMIN_SECRET}`.

## Analyzer integration

`src/lib/analyzer/` contains the ported TypeScript logic (from `pokebeeClock-analyzer`).
`src/lib/analyzer_bridge.ts` handles: read `raw_punches` → call `analyzeEmployee` → write `analyzed_*` / `summary_*`.

Re-analysis is triggered after every `/api/punch` or approved amendment. Only the affected employee's current month is re-analyzed.

## Time zone

All timestamps stored and displayed in **Asia/Taipei (UTC+8)**. Server receives UTC from Vercel; convert before calling `analyzeEmployee`.

```ts
const twNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
```

## PIN hashing

```ts
import crypto from "crypto";
const hash = crypto.createHash("sha256").update(pin).digest("hex");
```

## Recalculation flow

1. Read affected employee's `raw_punches` for the month
2. Convert timestamps to Asia/Taipei local time
3. Build `Event[]` (sequence → analyzer infers in/out)
4. `analyzeEmployee(name, events, isFullTime)` → `{ summary, records }`
5. Delete employee rows in `analyzed_YYYY-MM`, append new records
6. Upsert employee row in `summary_YYYY-MM`

## Constraints

- **Google Sheet = sole data store**: app is stateless
- **No user auth on main app**: iPad physical access is the barrier
- **Amendments do not auto-trigger recalculation**: status=pending until manager approves
- **`isFullTime` comes from `employees.role`**: never hardcode names
- Vercel functions are stateless — no in-memory cache across requests

## Reference repos

- `../pokebeeExpense/app/` — structural reference (sheets.ts, auth pattern, Tailwind, PWA)
- `../pokebeeClock-analyzer/` — analyzer source (to be merged into `src/lib/analyzer/`)
- `../pokebee/clock_in_out_analyzer.py` — Python ground truth (read-only)
