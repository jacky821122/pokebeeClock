# pokebeeClock — Constraints

Rules that aren't obvious from the code. Everything else (stack, tabs, env vars, flows) is derivable — read the repo.

## Data store

- **Google Sheet is the sole data store.** The app is stateless; Vercel functions hold no in-memory cache across requests.
- **Data layers**: `raw_punches` (raw) → `analyzed_YYYY-MM` (per-day records, persisted) → on-demand xlsx (display layer for payroll review). There is no persisted monthly summary — summaries are recomputed from raw punches when the display-layer report is generated. Do not reintroduce a `summary_*` tab.

## Security

- **PIN is stored as plaintext.** A 4-digit PIN hash offers no meaningful protection (10k possibilities, trivially reversible); the real boundary is Sheet access control + `ADMIN_SECRET`. Do not reintroduce hashing — it adds complexity without security.
- **Main app has no user auth by design.** The iPad's physical location and the manager's always-on Google session are the barrier. Do not add a login screen to the punch flow.
- **`/admin` and admin API routes require `Authorization: Bearer $ADMIN_SECRET`.**

## Analyzer

- **`isFullTime` must come from `employees.role`.** Never hardcode employee names anywhere in analyzer-related code paths.
- **Amendments do not auto-trigger recalculation.** They land in `amendments` with `status=pending`; the manager reviews at month-end. Do not wire them into the punch-triggered recalc.

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
