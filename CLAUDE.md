# pokebeeClock — Constraints

Rules that aren't obvious from the code. Everything else (stack, tabs, env vars, flows) is derivable — read the repo.

## Data store

- **Google Sheet is the sole data store.** The app is stateless; Vercel functions hold no in-memory cache across requests.
- **Data layers**: `raw_punches` (raw) → `analyzed_YYYY-MM` (per-day records, persisted) → on-demand xlsx (display layer for payroll review). There is no persisted monthly summary — summaries are recomputed from raw punches when the display-layer report is generated. Do not reintroduce a `summary_*` tab.

## Security

- **PIN is stored as plaintext.** A 4-digit PIN hash offers no meaningful protection (10k possibilities, trivially reversible); the real boundary is Sheet access control + `ADMIN_SECRET`. Do not reintroduce hashing — it adds complexity without security.
- **Main app has no user auth by design.** The iPad's physical location and the manager's always-on Google session are the barrier. Do not add a login screen to the punch flow.
- **`/admin` and admin API routes require `Authorization: Bearer $ADMIN_SECRET`.**
- **Device tokens are stored plaintext in the Sheet's `devices` tab.** Same reasoning as PIN — the boundary is Sheet edit access, not token secrecy. Do not move device tokens to env or add hashing. Empty/missing tab disables enforcement (dev-friendly).

## Analyzer

- **V2 rules** (2026-04-20): no automatic overtime, missing punch = 0hr + flag, full-time deducts 2hr break, per-shift cap 4hr (hourly), daily cap 8hr. All overtime comes from overtime requests (not yet built).
- **`isFullTime` must come from `employees.role`.** Never hardcode employee names anywhere in analyzer-related code paths.
- **Shifts**: only 早班 / 晚班 (no sub-categories). Classification based on `normalizedIn < 14:00`.
- **Shift windows**: 早班 9:00-15:00, 晚班 15:00-21:00 (normal ±1hr buffer). If hourly employee's `normIn < 14:00` and `normOut >= 15:00`, it is treated as two missing punches (早班缺out + 晚班缺in), not a single long shift.
- **Overtime flag**: uses **actual worked hours** (before cap) to check > 8hr 15min (hourly) / > 10hr 15min (full-time). Per-shift cap and daily cap are applied after the flag check.
- **Normalize**: unified `roundToHalfHour` for both in and out. No grace period, no directional bias.
- **Amendments do not auto-trigger recalculation.** They land in `amendments` with `status=pending`; the manager reviews at month-end. Do not wire them into the punch-triggered recalc.
- **Python parity is no longer a goal.** V2 intentionally diverges from the Python analyzer. The parity test has been replaced with V2-specific tests.

## Time zone

All timestamps are stored and displayed in **Asia/Taipei (UTC+8)**. Vercel runs in UTC — convert at the boundary before calling the analyzer.

## Maintaining `docs/status.md`

`docs/status.md` is the user's read/write worklog. Respect its shape:

- **Requests live at the top** (what + why). When the user mentions a new idea or future work, append it to the Requests section with a one-line *why*. Default insertion is at the top of its subsection — the user reorders by priority themselves.
- **Completed entries live at the bottom**, reverse chronological (newest first), one line each: `- YYYY-MM-DD — summary (commit hash)`.
- **Noise filter**: only log completed entries that correspond to a Request, or that clearly add/remove a feature. Skip typo fixes, comment tweaks, and other trivial maintenance — those belong in the git log, not here.
- When you finish work tied to a Request, move it: delete from Requests, add a completed line at the top of the completed list.
- Do not reorganize existing completed entries. The earlier categorized block is frozen history.

## Reference repos (read-only)

- `../pokebee/clock_in_out_analyzer.py` — Python ground truth for analyzer parity.
- `../pokebeeExpense/app/` — sibling project used as a structural reference for sheets/auth/PWA patterns.
