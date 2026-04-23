# pokebeeClock — Code Cleanup Plan

> Generated 2026-04-23 from full project scan. Execute items in order.

---

## Priority 1 — Bug-level fixes

### 1.1 Remove unused `useEffect` import in `page.tsx`

**File:** `app/src/app/page.tsx` line 3  
**Problem:** `useEffect` is imported but never used. ESLint `no-unused-vars` may fail the Vercel build.  
**Fix:** Change `import { useState, useRef, useEffect }` → `import { useState, useRef }`.

### 1.2 Fix UTC-based "today" check in `getMissingPunches`

**File:** `app/src/lib/sheets.ts`, inside `getMissingPunches()`  
**Problem:** `new Date().toISOString().slice(0, 10)` returns UTC date. On Vercel (UTC), between 00:00–08:00 UTC (= 08:00–16:00 Taipei) the "today" value is wrong, causing missing-punch detection to either hide or expose records incorrectly.  
**Fix:** Replace with Taipei-aware today:
```ts
const now = new Date();
const today = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
```

### 1.3 Fix UTC-based `currentYyyyMm()` in `/api/identify`

**File:** `app/src/app/api/identify/route.ts`, `currentYyyyMm()` function  
**Problem:** Same UTC issue — `new Date().toISOString().slice(0, 7)` returns UTC month. Around month boundaries (e.g. May 1st 00:00–08:00 UTC = April 30 16:00–May 1 00:00 Taipei) this returns the wrong month.  
**Fix:** Apply same Taipei offset:
```ts
function currentYyyyMm(): string {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 3600 * 1000);
  return tw.toISOString().slice(0, 7);
}
```

### 1.4 Fix full-time overtime flag using normalized times instead of raw

**File:** `app/src/lib/analyzer/analyzer.ts`, inside `handleFullTime()`  
**Problem:** The overtime flag checks `rawHours = (outNorm - inNorm)` which uses **normalized** (rounded) times, not actual punch times. Rounding can shift times by up to 15 min, making the >10hr15min threshold inaccurate.  
**Fix:** Add a separate raw diff calculation using the original `inTs`/`outTs`:
```ts
// Current (wrong): uses normalized times for flag
const rawHours = (outNorm!.getTime() - inNorm!.getTime()) / 3600 / 1000;

// Should be: use original punch timestamps for flag
const normHours = (outNorm!.getTime() - inNorm!.getTime()) / 3600 / 1000;
const worked = Math.max(normHours - 2, 0);
normal = Math.min(worked, 8.0);

const rawDiffHours = (outTs!.getTime() - inTs!.getTime()) / 3600 / 1000;
if (rawDiffHours > 10.25) {
  notes.push(`上班時間 ${fmtHours(rawDiffHours)} 小時（超過 10 小時 15 分），請確認是否需申請加班`);
}
```
Also update the variable name from `rawHours` to `normHours` for the hours calculation to avoid confusion.

---

## Priority 2 — Code quality / resilience

### 2.1 Extract shared `nowTaipei()` utility

**Problem:** `nowTaipei()` is copy-pasted in 3 files:
- `app/src/app/page.tsx`
- `app/src/app/api/punch/route.ts`
- `app/src/app/api/overtime/route.ts`

**Fix:** Create `app/src/lib/time.ts`:
```ts
/** Current timestamp in Asia/Taipei as ISO string with +08:00 suffix. */
export function nowTaipei(): string {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace("Z", "+08:00");
}

/** Taipei "today" as YYYY-MM-DD. */
export function todayTaipei(): string {
  return nowTaipei().slice(0, 10);
}

/** Current Taipei month as YYYY-MM. */
export function currentYyyyMm(): string {
  return nowTaipei().slice(0, 7);
}
```
Then replace all 3 inline definitions + the `currentYyyyMm` in `api/identify` + the `todayTaipei` in `getMissingPunches` with imports from this module. The client-side `page.tsx` also defines `nowTaipei` / `todayTaipei` — since `lib/time.ts` may import server-only modules in the future, keep a separate copy in `page.tsx` or create `lib/time_shared.ts` (no server imports) and import from both.

### 2.2 Add Google Sheets API retry with exponential backoff

**Problem:** Any transient 429 / 5xx from Google Sheets API causes immediate failure. The Vercel function returns 500 to the user.  
**Fix:** Add a `withRetry` wrapper and a `withRetryProxy` in `app/src/lib/sheets.ts`:
```ts
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { code?: number }).code ?? 0;
      if (![429, 500, 502, 503, 504].includes(status) || attempt === MAX_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt + Math.random() * 200));
    }
  }
  throw lastError;
}

function withRetryProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, prop) {
      const val = (obj as Record<string | symbol, unknown>)[prop];
      if (typeof val === "function") {
        return (...args: unknown[]) => {
          const result = (val as Function).apply(obj, args);
          if (result && typeof result.then === "function") {
            return withRetry(() => (val as Function).apply(obj, args));
          }
          return result;
        };
      }
      if (val && typeof val === "object") return withRetryProxy(val as object);
      return val;
    },
  });
}
```
Then change `getSheets()` to `return withRetryProxy(google.sheets(...))`.

### 2.3 Deduplicate `hmToMin`

**Problem:** `hmToMin()` is defined in both `page.tsx` and `api/overtime/route.ts`.  
**Fix:** Move to `lib/time.ts` (or `lib/time_shared.ts` if needed client-side) and import.

---

## Priority 3 — Housekeeping

### 3.1 Add `npm-debug.log` to `.gitignore`

**File:** `app/.gitignore` (or root `.gitignore`)  
**Problem:** `app/npm-debug.log` is tracked in git.  
**Fix:**
```sh
echo "npm-debug.log" >> app/.gitignore
git rm --cached app/npm-debug.log
```

### 3.2 (Optional) Refactor `page.tsx` into components

**Problem:** `page.tsx` is 405 lines with inline `DirectionButton`, `Field`, `ToggleBtn` components and all view logic in one file.  
**Fix:** Extract to `app/src/components/clock/`:
- `PunchView.tsx` — punch direction buttons + missing punch alerts
- `SupplementView.tsx` — supplement punch form
- `OvertimeView.tsx` — overtime request form + recent records
- `shared.tsx` — `DirectionButton`, `Field`, `ToggleBtn`, shared types

**Caution:** This was attempted before (commit `a315750`) and reverted because it broke the deploy. Ensure:
1. No unused imports (`useState` was imported but unused in `PunchView.tsx` and `SupplementView.tsx`)
2. All exports/imports are correct
3. Build locally (`npm run build`) before pushing

---

## Execution checklist

```
[x] 1.1  Remove unused useEffect import
[x] 1.2  Fix getMissingPunches UTC today
[x] 1.3  Fix currentYyyyMm UTC month
[x] 1.4  Fix handleFullTime overtime flag (use raw timestamps)
[x] 2.1  Extract shared nowTaipei / todayTaipei / currentYyyyMm
[x] 2.2  Add Sheets API retry/backoff
[x] 2.3  Deduplicate hmToMin
[x] 3.1  gitignore npm-debug.log (already covered by root .gitignore, file not tracked)
[ ] 3.2  (Optional) Refactor page.tsx into components — skipped, previously reverted
[x]      Final: commit & push
```

---

## Notes

- Do NOT combine all changes into one commit. Group by priority level (P1, P2, P3) at minimum.
- After each commit, verify Vercel deploy succeeds before proceeding.
- Update `docs/status.md` completed section after all items are done.
