# Cleanup Postmortem — 2026-04-23

## 背景

根據 `docs/cleanup_plan.md` 的全專案掃描結果，執行 P1（bug 修正）+ P2（代碼品質）+ P3（housekeeping）三個優先級的清理工作。總共產生 5 個 commit。

---

## 一、各項改動：原本要解決什麼

### P1 — Bug-level fixes

| # | 問題 | 影響 |
|---|------|------|
| 1.1 | `page.tsx` import 了 `useEffect` 但從未使用 | ESLint `no-unused-vars` 可能讓 Vercel build 失敗 |
| 1.2 | `getMissingPunches()` 用 `new Date().toISOString().slice(0,10)` 取得「今天」 | 在 Vercel（UTC 時區）上，台北時間 08:00–16:00 之間「今天」會差一天，導致缺卡偵測結果錯誤 |
| 1.3 | `api/identify/route.ts` 的 `currentYyyyMm()` 同樣用 UTC | 月底跨月時（例如 5/1 00:00–08:00 UTC = 台北 4/30 16:00–5/1 00:00）會回傳錯誤月份，讀錯 analyzed tab |
| 1.4 | `handleFullTime()` 用 normalized（四捨五入後）時間判斷「超過 10hr15min」 | normalize 可移動時間最多 ±15 分鐘，讓超時 flag 不準確。應用原始打卡時差判斷 |

### P2 — Code quality / resilience

| # | 問題 | 影響 |
|---|------|------|
| 2.1 | `nowTaipei()` 複製貼上在 3 個檔案（`page.tsx`、`api/punch`、`api/overtime`），`currentYyyyMm` 在 `api/identify`，`hmToMin` 在 `page.tsx` + `api/overtime` | 維護困難，改一個忘改另一個就會出 bug |
| 2.2 | Google Sheets API 任何 429/5xx 瞬時錯誤直接失敗 | 使用者看到 500 錯誤，無重試機會 |
| 2.3 | `hmToMin()` 重複定義 | 同 2.1 |

### P3 — Housekeeping

| # | 問題 | 結果 |
|---|------|------|
| 3.1 | `npm-debug.log` 被 git 追蹤 | 檢查後發現 root `.gitignore` 已有 `npm-debug.log*` 且檔案未被 track，無需處理 |
| 3.2 | `page.tsx` 405 行太長 | 之前在 `a315750` 嘗試拆分過，但因 import 問題被 revert。本次跳過 |

---

## 二、實際出了什麼事

### Commit 1: `16b0a9c` — P1 bug fixes ✅
- 移除 `useEffect` import → 正確
- 修 `getMissingPunches` UTC → 正確
- 修 `handleFullTime` 超時 flag → 正確
- **同時在 `sheets.ts` 加入了 `withRetryProxy`** → ⚠️ 這是後來出問題的根源

### Commit 2: `dde213a` — P2 抽出共用模組 ✅
- 建立 `lib/time.ts`，統一 `nowTaipei`/`todayTaipei`/`currentYyyyMm`/`hmToMin`
- 三個 API route 改用共用 import
- `page.tsx` 保留自己的 copy（因為是 `"use client"` 元件）
- **這部分沒問題**

### Commit 3: `97656a6` — docs 更新 ✅
- 更新 `cleanup_plan.md` checklist 和 `status.md`
- **沒問題**

### 🔴 部署後發現：PIN 識別 + 管理登入全部失敗

原因是 `withRetryProxy`。以下是逐步分析：

#### 第一版 `withRetryProxy`（commit `16b0a9c` 引入）的問題

```typescript
// ❌ 有 bug 的版本
function withRetryProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, prop) {
      const val = (obj as Record<string | symbol, unknown>)[prop];
      if (typeof val === "function") {
        return (...args: unknown[]) => {
          const result = (val as Function).apply(obj, args);  // ← 第一次呼叫（真的打 API）
          if (result && typeof result.then === "function") {
            return withRetry(() => (val as Function).apply(obj, args));  // ← 第二次呼叫
          }
          return result;
        };
      }
      // ...
    },
  });
}
```

**Bug 1 — 雙重呼叫**：為了判斷函式是否回傳 Promise，先呼叫一次（`const result = ...apply(...)`），確認是 Promise 後再呼叫第二次包在 `withRetry` 裡。第一次呼叫的 Promise 被丟棄，產生 unhandled rejection。

### Commit 4: `31b9407` — 修正嘗試 1 ❌ 仍然失敗

```typescript
// ❌ 修了雙重呼叫，但沒修根本問題
return (...args: unknown[]) =>
  withRetry(() => (val as Function).apply(obj, args));
```

移除了「先呼叫再判斷」邏輯，所有函式一律包 `withRetry`。解決了雙重呼叫問題，**但 Proxy 本身的問題沒解決**。

**Bug 2 — Proxy 破壞 Google API client 的 `this` 綁定**：
- Google API client 的方法依賴正確的 `this` 指向
- `sheets.spreadsheets.values.get(...)` 這個呼叫鏈中，每一層的 `.` 都觸發 Proxy 的 `get` trap
- `spreadsheets` 是一個 getter 或 lazy property，被 Proxy 攔截後 `this` 指向 Proxy 而非原始物件
- 結果：API client 內部狀態讀取失敗，所有 Sheets API 呼叫都崩潰

### Commit 5: `2d848e8` — 最終修正 ✅

```typescript
// ✅ 直接回傳原始 client，不用 Proxy
function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}
```

完全移除 `withRetryProxy`，恢復原始的 `getSheets()`。問題解決。

---

## 三、現在的狀態

| 項目 | 狀態 |
|------|------|
| P1.1 移除未用 `useEffect` | ✅ 生效 |
| P1.2 修 `getMissingPunches` UTC | ✅ 生效 |
| P1.3 修 `currentYyyyMm` UTC → 改用 `lib/time.ts` | ✅ 生效 |
| P1.4 修 `handleFullTime` 超時 flag | ✅ 生效 |
| P2.1 抽出共用 `lib/time.ts` | ✅ 生效 |
| P2.2 Sheets API retry/backoff | ⚠️ **未生效** — `withRetry` 函式存在但未被使用 |
| P2.3 deduplicate `hmToMin` | ✅ server-side 已統一，`page.tsx` 保留 client-side copy |
| P3.1 gitignore npm-debug.log | ✅ 不需處理（已被 ignore） |
| P3.2 拆分 page.tsx | ⏭️ 跳過 |

---

## 四、為什麼 Proxy 方案在 Google API client 上行不通

Google API client（`googleapis`）的結構大致是：

```
sheets (client)
  └── spreadsheets (lazy getter, 依賴 this._options)
        └── values (lazy getter)
              └── get / update / append (methods, 依賴 this.context)
```

每一層都用 getter 或 factory 函式產生下一層，並把 `this` 上的 auth、baseUrl 等設定傳遞下去。Proxy 攔截 property access 後：

1. `this` 變成 Proxy 而非原始物件 → getter 讀不到 `_options`
2. 回傳的子物件又被 `withRetryProxy` 包一層 → 多層 Proxy 巢狀
3. 最終呼叫 `.get()` 時，內部的 HTTP 請求缺少必要的 auth 資訊 → API 呼叫失敗

**結論：不能用通用 Proxy 包裝有複雜內部狀態的 client library。**

---

## 五、未來 retry 該怎麼做

`withRetry` 函式已經寫好且正確，只是目前沒有接線。有兩個可行方案：

### 方案 A：在關鍵呼叫點個別包裝（推薦）

只包最容易遇到 rate limit 的高頻操作：

```typescript
// 例如 appendPunch — 多人同時打卡最容易 429
export async function appendPunch(punch: Punch): Promise<void> {
  const sheets = getSheets();
  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: sid(),
      range: `${TAB_PUNCHES}!A:E`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[punch.employee, punch.client_ts, punch.server_ts, punch.source, punch.kind]],
      },
    })
  );
}
```

優點：精確控制、不影響 client 行為、好 debug。
缺點：要改多處，但可以漸進式加入。

### 方案 B：包裝在 API helper 層

建一個薄 wrapper：

```typescript
function sheetsValues() {
  const s = getSheets();
  return {
    get: (params: Parameters<typeof s.spreadsheets.values.get>[0]) =>
      withRetry(() => s.spreadsheets.values.get(params)),
    append: (params: Parameters<typeof s.spreadsheets.values.append>[0]) =>
      withRetry(() => s.spreadsheets.values.append(params)),
    update: (params: Parameters<typeof s.spreadsheets.values.update>[0]) =>
      withRetry(() => s.spreadsheets.values.update(params)),
  };
}
```

優點：集中管理、只需改一次。
缺點：需要手動列出所有用到的 method。

### 建議

先不急著加 retry。目前 Vercel 免費方案的並發量不高，429 很少觸發。等真的在 production 觀察到 Sheets API 瞬時失敗再加，用方案 A 逐步包裝即可。

---

## 六、教訓

1. **不要用 Proxy 包裝第三方 client library** — 除非你完全理解它的內部結構。Google API client 有 lazy getter、context 傳遞、prototype chain 等機制，Proxy 會全部打斷。

2. **部署後要驗證核心流程** — 這次改了 `sheets.ts` 的底層 `getSheets()` 函式，影響所有 API 路由，但沒有本地 build/test 驗證就推上去了（因為環境沒有 npm）。

3. **基礎設施改動（如 retry wrapper）應該獨立於 bug fix commit** — P1 bug fixes 和 P2 retry proxy 混在同一次作業，導致 bug fix 的好處被 retry proxy 的問題蓋過。

4. **`cleanup_plan.md` 的 2.2 方案（Proxy-based retry）本身就有設計缺陷** — 計畫中直接給出了 `withRetryProxy` 的實作，但沒有考慮到 Google API client 的特殊性。執行計畫前應該先評估可行性。
