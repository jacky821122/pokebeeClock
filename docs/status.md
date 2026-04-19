# pokebeeClock — 當前狀態

> 頂部是 requests（想到就往上丟），底部是完成記錄（新→舊）。

---

## Requests（待辦 / 想法池）

預設插在最上面。每項：**做什麼 + 為什麼**。Claude 完成後移到下方完成區。

### 階段 2
- **`/admin` 報表下載按鈕** — 呼叫 `generateReport(month)` 回傳 xlsx 當下載。為什麼：現在只能終端機跑，非工程人員沒辦法自己拿報表；lib 層已就緒，route 一層薄包裝即可。
- **`/admin` 員工管理 CRUD** — 新增/停用員工、設定/重設 PIN。為什麼：目前 PIN 忘記只能手動改 sheet，有新員工也得直接編 sheet，不是長期解法。
- **PWA install-to-home 實機驗證（iPad Safari）** — 為什麼：最終情境是 iPad 常駐主頁，瀏覽器跑和 PWA 跑的快取/離線行為不同，沒實測過不算 MVP 完成。

### 驗證 / 測試
- **iCHEF CSV import 對照跑一次** — 用真實歷史資料跑 `scripts/import_ichef_csv.ts`，比對 Python 輸出。為什麼：analyzer 有 parity test 但沒跑過完整一個月的真實 CSV，實測才能確認邊界。
- **展示層報表實機驗證** — 用 2026-03 或 2026-04 真實資料跑 `scripts/generate_report.ts`，比對 `pokebee/data/clock_in_out/clock_report_*.xlsx`。為什麼：這次新寫的，還沒跑過真資料。
- **樣式調整** — 為什麼：現在是骨架樣式，等真實資料上去後一次統一處理比分散調整有效率。
- **跨月邊界測試** — 第一筆跨月打卡自動建新 `analyzed_YYYY-MM` tab 的流程。為什麼：邏輯在 `ensureTab`，只在無資料時寫 header，沒實測過怕踩到 race。

### 階段 3（可選 / 遠程）
- **月底管理者 UI：approved amendments 合併進 raw_punches** — 為什麼：目前 amendments 不自動併入分析，月底要手動處理。
- **iCHEF CSV 匯入常駐路徑** — 為什麼：若保留 iCHEF 平行流程作為備援，需要穩定匯入入口（目前 script 僅 one-off 驗證用）。
- **LINE 通知** — 為什麼：打卡異常、月底結算等事件通知管理者。

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
page.tsx → /api/punch → verifyPin() → appendPunch() → reanalyzeEmployee()
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
