# pokebeeClock — 當前狀態

> 頂部是 requests（想到就往上丟），底部是完成記錄（新→舊）。

---

## Requests（待辦 / 想法池）

預設插在最上面。每項：**做什麼 + 為什麼**。Claude 完成後移到下方完成區。

6. **PWA install-to-home 實機驗證（iPad Safari）** — 
    * 最終情境是 iPad 常駐主頁，瀏覽器跑和 PWA 跑的快取/離線行為不同，沒實測過不算 MVP 完成。
7. **展示層報表實機驗證** — 用真實資料跑 `scripts/generate_report.ts`，比對舊版 V1 output 差異。
    * V2 analyzer 改版後需重新驗證。
8. **樣式調整** — 
    * 現在是骨架樣式，等真實資料上去後一次統一處理比分散調整有效率。
9. **跨月邊界測試** — 第一筆跨月打卡自動建新 `analyzed_YYYY-MM` tab 的流程。
    * 邏輯在 `ensureTab`，只在無資料時寫 header，沒實測過怕踩到 race。
10. **LINE 通知** — 
    * 打卡異常、月底結算等事件通知管理者。

---

## 已知問題 / 注意事項（參考，非待辦）

- **Vercel function timeout**：reanalyze 改成同步 await，打卡回應會比較慢（多幾秒）。資料量大時要觀察是否接近 10s limit。
- **PIN reset 流程**：目前只能管理者直接改 sheet。
- **跨月第一筆打卡**：`analyzed_YYYY-MM` tab 自動建立，但 header 只在無資料時寫入，需實測確認。
- **V2 analyzer 加班申請已整合至報表層**：analyzer 永遠回傳 `overtime_hours=0`，加班時數由 `report_generator.ts` 從 `overtime_requests` 表加計。
- **舊版 parity test fixture 已過時**：`fixtures/` 目錄的 `.expected.json` 是 V1 output，parity test 已替換為 V2 專用測試。fixture 檔案保留供日後比對參考。

---

## 架構備忘

```
打卡流程：
page.tsx → /api/identify → findEmployeeByPin() → { employee, suggested_kind }
         → /api/punch → findEmployeeByPin() → appendPunch() → reanalyzeEmployee()
                                                          ↓
                                          getPunchesForMonth() → analyzeEmployee() [V2]
                                                          ↓
                                               writeAnalyzedRecords()

V2 analyzer 規則：
- 正職：(norm_out - norm_in - 2hr break), cap 8hr, flag if raw > 10hr15min
- 計時：(norm_out - norm_in), per-shift cap 4hr, daily cap 8hr
- 計時全日班偵測：normIn < 14:00 且 normOut >= 15:00 → 早班缺out + 晚班缺in
- 缺打卡：0hr + flag（不預設時數）
- 超時flag：用實際時數（cap前）判定 > 8hr15min
- **加班：系統不自動計算，全部來自加班申請**

補打卡流程：
打卡頁 → 選擇補打日期/時間 → /api/punch (source=supplement, triggerTs=client_ts月份)

加班申請流程：
UI → 輸入起迄時間 → /api/overtime → 系統算時數(15min單位) → 寫入 overtime_requests → 月結報表直接加計

補登流程（舊，保留）：
/amend → /api/amend → appendAmendment() [status=pending, 不觸發重算]

展示層生成（月底 on-demand）：
scripts/generate_report.ts <YYYY-MM>
  → generateReport() [src/lib/report_generator.ts]
  → getAllPunchesForMonth() + getActiveEmployees() + getAmendmentsForMonth() + getOvertimeRequestsForMonth()
  → analyzeEmployee() per employee + 加計 overtime_requests
  → exceljs → data/reports/clock_report_<YYYY-MM>.xlsx
```

---

## 完成記錄（新→舊）

格式：`- YYYY-MM-DD — 一句話 (commit hash)`。只記對應某個 request、或明顯新增/移除功能的改動；小修補、typo、註解調整不記。

- 2026-04-25 — iPad 橫屏 (lg:) 放大 PinPad、打卡主畫面字級與按鈕
- 2026-04-25 — Device token 驗證：env `DEVICE_TOKENS=label|token,...`、`/setup` 頁面、`apiFetch` 自動帶 header 並在 401 跳 /setup、`raw_punches` 加 device 欄
- 2026-04-23 — 代碼清理 P1+P2：修 UTC 時區 bug（getMissingPunches/currentYyyyMm）、正職超時 flag 改用原始時差、移除未用 useEffect import、抽出共用 `lib/time.ts`（nowTaipei/todayTaipei/currentYyyyMm/hmToMin）、Sheets API 加 retry/backoff
- 2026-04-20 — 補登後樂觀移除對應缺卡提示；補登/加班 fire-and-forget 快速回應、成功後回主畫面不登出 (90ac464)
- 2026-04-20 — 加班申請：最近紀錄與 24 小時內撤回功能 (a9026cd)
- 2026-04-20 — 全員工重算 API（批次讀取優化）、加班申請 reason 欄位、iOS 時間輸入溢出修正 (d103a46)
- 2026-04-20 — 補登建議：只顯示過去日期的缺卡，不顯示今天 (d9df4fa)
- 2026-04-21 — 正職超時 flag 修正：`handleFullTime` 改用原始打卡時差（非 normalize 後）判定 >10hr15min
- 2026-04-21 — page.tsx 重構：拆出 `PunchView`、`SupplementView`、`OvertimeView`、`shared` 至 `src/components/clock/`（405→202 行）
- 2026-04-21 — Google Sheets API retry/backoff：`withRetryProxy` 自動重試 429/5xx，指數退避 3 次
- 2026-04-20 — 報表整合加班申請：`report_generator.ts` 讀取 `overtime_requests`，加計加班時數至摘要，顯示各筆加班明細
- 2026-04-20 — UI 改版：PIN 後直接到打卡頁、缺卡顯示已存在紀錄與建議補登時間（依班別）、補登打卡 + 加班申請 UI
- 2026-04-20 — 統一 PIN 流程 + 補登打卡 + 加班申請 API（`/api/punch` source=supplement、`/api/overtime`、`/api/identify` 回傳缺卡紀錄）
- 2026-04-20 — V2 analyzer 改版：取消自動加班計算、缺打卡改 0hr+flag、正職扣 2hr 空班、計時每班 cap 4hr / 日 cap 8hr、班別簡化為早班/晚班、normalize 統一 roundToHalfHour、flag 閾值 >8hr15min（正職 >10hr15min）；parity test 替換為 V2 專用測試
- 2026-04-19 — admin 後台加「← 打卡系統」返回連結；報表摘要員工名稱列改粗體 (c90d2e4)
- 2026-04-19 — [temp] 打卡頁加指定打卡時間欄位（`datetime-local`，測試用）；bee emoji 連點 5 下進 `/admin`；補登頁 iPhone time input 溢出修正；admin 報表區塊移置頂 (2c83acc)
- 2026-04-19 — 修 analyzed 時間錯 8 小時（`parseTaipeiNaive` 修正 +08:00 被當 UTC 解析）；打卡流程改 PIN-first（直接輸入 PIN 識別人員，省去選人步驟），新增 `/api/identify`
- 2026-04-19 — `/admin` 新增報表下載區塊：月份選擇器 + 下載 xlsx 按鈕，`GET /api/admin/report?month=YYYY-MM` 受 Bearer 保護
- 2026-04-19 — PIN 改明文儲存（hash 對 4 位數無實質保護）；`/admin` 改為直接顯示/編輯 PIN、dirty 才能儲存、支援批次新增多列
- 2026-04-19 — `/admin` 員工管理：列表/新增/重設 PIN/切 role/啟停用，API 受 `Bearer ADMIN_SECRET` 保護
- 2026-04-19 — `raw_punches` 加 `kind` 欄、UI 拆上班/下班按鈕、`punchesToEvents` 自動補 `no-clock-out`；新增 `punches_to_events.test.ts` 補齊中間層測試
- 2026-04-19 — 新增 on-demand xlsx 展示層報表（摘要/明細/補班申請），廢除 `summary_*` tab (07d0cf2)

---

## 早期完成記錄（分類保留，未來新增項改用上方時間序）

### 基礎建設
- Next.js 16 + Vercel 骨架（仿 pokebeeExpense）
- Google Sheets 整合（service account）
- PWA manifest
- Git + GitHub

### Analyzer
- Python `clock_in_out_analyzer.py` port 成 TypeScript（`src/lib/analyzer/`）
- 42 tests 全綠（31 unit + 11 parity），涵蓋 10 種邊界 case
- `pokebeeClock-analyzer/` 獨立 package 已完成，使命結束

### 打卡流程（MVP 階段 1）
- 員工格（`EmployeeGrid`）+ PIN 輸入（`PinPad`）
- `/api/employees`：讀 `employees` tab
- `/api/punch`：PIN 驗證 → 寫 `raw_punches` → 重算 `analyzed_*`
- `analyzer_bridge.ts`：punches → Events → analyzeEmployee → 寫回 sheet
- 補登頁 `/amend` + `/api/amend`（寫 `amendments`，status=pending）

### 已驗證
- 打卡後 `raw_punches` 正確寫入
- `analyzed_2026-04` tab 自動建立並有資料

---

## 相關檔案

| 用途 | 路徑 |
|------|------|
| 硬約束 | `CLAUDE.md` |
| 架構與使用說明 | `README.md` |
| 實作計畫 | `docs/plan.md` |
| Analyzer port 說明 | `docs/plan_analyzer_port.md` |
| 班別計算規則 | `docs/hours_analyzer_spec.md` |
| Sheets 操作 | `app/src/lib/sheets.ts` |
| Analyzer bridge | `app/src/lib/analyzer_bridge.ts` |
| Analyzer 本體 | `app/src/lib/analyzer/` |
| 展示層生成 | `app/src/lib/report_generator.ts` |
| CLI 觸發 | `app/scripts/generate_report.ts` |
