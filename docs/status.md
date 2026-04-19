# pokebeeClock — 當前狀態

> 最後更新：2026-04-19

## 完成度

體感約 30%。核心 punch 流程與 analyzer 已驗證，但 admin UI、員工管理、樣式調整都還沒做。

---

## 已完成

### 基礎建設
- [x] Next.js 16 + Vercel 骨架（仿 pokebeeExpense）
- [x] Google Sheets 整合（service account）
- [x] PWA manifest
- [x] Git + GitHub

### Analyzer
- [x] Python `clock_in_out_analyzer.py` port 成 TypeScript（`src/lib/analyzer/`）
- [x] 42 tests 全綠（31 unit + 11 parity），涵蓋 10 種邊界 case
- [x] `pokebeeClock-analyzer/` 獨立 package 已完成，使命結束

### 打卡流程（MVP 階段 1）
- [x] 員工格（`EmployeeGrid`）+ PIN 輸入（`PinPad`）
- [x] `/api/employees`：讀 `employees` tab
- [x] `/api/punch`：PIN 驗證 → 寫 `raw_punches` → 重算 `analyzed_*`
- [x] `analyzer_bridge.ts`：punches → Events → analyzeEmployee → 寫回 sheet
- [x] 補登頁 `/amend` + `/api/amend`（寫 `amendments`，status=pending）

### 展示層（2026-04-19）
- [x] 廢除 `summary_*` tab，改為 on-demand xlsx
- [x] `src/lib/report_generator.ts`：純 function 產 xlsx Buffer（摘要 + 明細）
- [x] `scripts/generate_report.ts <YYYY-MM>`：CLI 觸發，寫到 `data/reports/`
- [x] 摘要區塊含「補班申請」，讀 `amendments` 不論 status
- [x] 加 `exceljs` 相依

### 已驗證
- [x] 打卡後 `raw_punches` 正確寫入
- [x] `analyzed_2026-04` tab 自動建立並有資料

---

## 待完成

### 階段 2
- [ ] `/admin` 報表下載按鈕（呼叫 `generateReport()` → stream xlsx；lib 層已就緒）
- [ ] `/admin` 員工管理 CRUD（新增/停用員工、設定/重設 PIN）
- [ ] PWA install-to-home 實機驗證（iPad Safari）

### 驗證 / 測試
- [ ] iCHEF CSV import script（`scripts/import_ichef_csv.ts`）— 用真實歷史資料跑一次，對照 Python 輸出確認邏輯與格式正確
- [ ] 樣式調整（待有真實資料後統一處理）
- [ ] 跨月邊界測試（第一筆打卡自動建新 tab）

### 階段 3（可選）
- [ ] 月底管理者 UI：把 approved amendments 合併進 raw_punches
- [ ] iCHEF CSV 匯入路徑（如果還需要）
- [ ] LINE 通知

---

## 已知問題 / 注意事項

- **Vercel function timeout**：reanalyze 改成同步 await，打卡回應會比較慢（多幾秒）。資料量大時要觀察是否接近 10s limit。
- **補登不觸發重算**：amendments status=pending，月底審核後需人工處理或另跑工具。MVP 已知限制。
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

## 相關檔案

| 用途 | 路徑 |
|------|------|
| 架構與規範 | `CLAUDE.md` |
| 實作計畫 | `docs/plan.md` |
| Analyzer port 說明 | `docs/plan_analyzer_port.md` |
| 班別計算規則 | `docs/hours_analyzer_spec.md` |
| Sheets 操作 | `app/src/lib/sheets.ts` |
| Analyzer bridge | `app/src/lib/analyzer_bridge.ts` |
| Analyzer 本體 | `app/src/lib/analyzer/` |
| 展示層生成 | `app/src/lib/report_generator.ts` |
| CLI 觸發 | `app/scripts/generate_report.ts` |
