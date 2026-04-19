# pokebeeClock — 當前狀態

> 頂部是 requests（想到就往上丟），底部是完成記錄（新→舊）。

---

## Requests（待辦 / 想法池）

預設插在最上面。每項：**做什麼 + 為什麼**。Claude 完成後移到下方完成區。

1. **打卡頁 device token 驗證** — 防止知道 URL 就能打卡。iPad 初次設定時輸入 setup code 存 localStorage，之後每次 punch API call 帶 token；失效只需改 env var，無 session 過期問題。
2. **PWA install-to-home 實機驗證（iPad Safari）** — 
    * 最終情境是 iPad 常駐主頁，瀏覽器跑和 PWA 跑的快取/離線行為不同，沒實測過不算 MVP 完成。
3. **iCHEF CSV import 對照跑一次** — 用真實歷史資料跑 `scripts/import_ichef_csv.ts`，比對 Python 輸出。
    * analyzer 有 parity test 但沒跑過完整一個月的真實 CSV，實測才能確認邊界。
4. **展示層報表實機驗證** — 用 2026-03 或 2026-04 真實資料跑 `scripts/generate_report.ts`，比對 `pokebee/data/clock_in_out/clock_report_*.xlsx`。
    * 這次新寫的，還沒跑過真資料。
5. **樣式調整** — 
    * 現在是骨架樣式，等真實資料上去後一次統一處理比分散調整有效率。
6. **跨月邊界測試** — 第一筆跨月打卡自動建新 `analyzed_YYYY-MM` tab 的流程。
    * 邏輯在 `ensureTab`，只在無資料時寫 header，沒實測過怕踩到 race。
7. **月底管理者 UI：approved amendments 合併進 raw_punches** — 
    * 目前 amendments 不自動併入分析，月底要手動處理。
8. **iCHEF CSV 匯入常駐路徑** — 
    * 若保留 iCHEF 平行流程作為備援，需要穩定匯入入口（目前 script 僅 one-off 驗證用）。
9. **LINE 通知** — 
    * 打卡異常、月底結算等事件通知管理者。

---

## 已知問題 / 注意事項（參考，非待辦）

- **Vercel function timeout**：reanalyze 改成同步 await，打卡回應會比較慢（多幾秒）。資料量大時要觀察是否接近 10s limit。
- **補登不觸發重算**：amendments status=pending，月底審核後需人工處理或另跑工具。設計上的 MVP 限制。
- **PIN reset 流程**：目前只能管理者直接改 sheet。
- **跨月第一筆打卡**：`analyzed_YYYY-MM` tab 自動建立，但 header 只在無資料時寫入，需實測確認。

---

## 架構備忘

```
打卡流程：
page.tsx → /api/identify → findEmployeeByPin() → { employee, suggested_kind }
         → /api/punch → findEmployeeByPin() → appendPunch() → reanalyzeEmployee()
                                                          ↓
                                          getPunchesForMonth() → analyzeEmployee()
                                                          ↓
                                               writeAnalyzedRecords()

補登流程：
/amend → /api/amend → appendAmendment() [status=pending, 不觸發重算]

展示層生成（月底 on-demand）：
scripts/generate_report.ts <YYYY-MM>
  → generateReport() [src/lib/report_generator.ts]
  → getAllPunchesForMonth() + getActiveEmployees() + getAmendmentsForMonth()
  → analyzeEmployee() per employee
  → exceljs → data/reports/clock_report_<YYYY-MM>.xlsx
```

---

## 完成記錄（新→舊）

格式：`- YYYY-MM-DD — 一句話 (commit hash)`。只記對應某個 request、或明顯新增/移除功能的改動；小修補、typo、註解調整不記。

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
