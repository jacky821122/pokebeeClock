# pokebeeClock — 上線前檢查清單

依重要性與類別整理。完成的項目可在前面打勾。

---

## A. Code 必拿 / 必改

- [ ] **A1. 打卡頁「打卡時間（測試用）」欄位** — `src/app/page.tsx:224-228` 整段 `<label>` + `<input datetime-local>` 拿掉，連帶 `customTs` state（`:65`）與 `client_ts: toClientTs(customTs)` 改回 `client_ts: nowTaipei()`（`:118`）。員工不該能任意指定打卡時間。
- [ ] **A2. 🐝 連點 5 下進 `/admin`** — 自己用的入口可以保留（admin API 都有 `ADMIN_SECRET` 保護，不怕被點到），但要清楚這個 easter egg 存在。決定保留或移除。

## B. PWA / iPad 圖標（現在會壞）

- [ ] **B3. `public/` 缺 icon 檔** — manifest 引用 `icon-192.png` / `icon-512.png` / `icon.svg` / `apple-touch-icon.png`，但 `public/` 只有 `manifest.json`。加到主畫面會出現空白圖示。要做：512×512 的 logo png + apple-touch-icon (180×180)。
- [ ] **B4. iPad Safari 全螢幕需要的 meta** — `layout.tsx` 沒有 `apple-mobile-web-app-capable` / `apple-mobile-web-app-status-bar-style`，加到主畫面後可能還是顯示 Safari URL bar。

## C. 安全 / 防誤觸

- [ ] **C5. 打卡頁無認證**（status.md request #1） — 任何人知道 URL + 員工 PIN 就能在外面打卡。最低限度做 device token；或先靠 iPad 鎖在 kiosk 模式 + URL 不外流，把這個風險記下來。
- [ ] **C6. ADMIN_SECRET 怎麼進** — 確認自己進 `/admin` 的流程（前端怎麼把 secret 帶到 API），不要寫死在程式裡。
- [ ] **C7. PIN 唯一性** — `findEmployeeByPin` 只回第一個 match。要確保 employees tab 沒有重複 PIN（目前不一定有檢查）。

## D. iPad 實機設定（status.md #6）

- [ ] **D8. 加到主畫面 + standalone 模式** 實測
- [ ] **D9. Guided Access（引導使用模式）** 鎖在打卡頁，員工沒辦法切到 Safari 或回桌面
- [ ] **D10. 自動鎖定關掉**（設定 → 螢幕顯示與亮度 → 自動鎖定 → 永不）
- [ ] **D11. iCloud Keychain / Safari 自動填入 PIN 關掉**，否則前一個員工的 PIN 會被建議
- [ ] **D12. Wi-Fi 斷線情境**：目前沒 offline buffer，斷網時打卡會直接失敗。決定是否要做、或約定斷網時改用人工補登。

## E. 資料清理（上線前）

- [ ] **E13. 清空所有測試資料**：`raw_punches`、`analyzed_*`、`overtime_requests` 全部清掉（保留 header）。
- [ ] **E14. `employees` tab 檢查**：移除任何測試員工、確認每位 PIN 是正式的（不是 1234 之類）、`role` 與 `active` 正確。
- [ ] **E15. 沒測過的 status.md 項目**：跨月邊界（#9）、PWA 實機（#6）、實資料報表（#7）。

## F. Vercel / 部署

- [ ] **F16. 環境變數** Production 環境都齊：`GOOGLE_SA_JSON`、`SHEET_ID`、`ADMIN_SECRET`。
- [ ] **F17. Function timeout 監控** — reanalyze 是同步 await，月底資料多時可能逼近 10s。Vercel hobby plan 是 10s 限制，要不要升級或改非同步。
- [ ] **F18. 正式 domain + HTTPS**（PWA 必要）。
- [ ] **F19. Service account** 對 production sheet 的權限確認。

## G. 維運 / 流程

- [ ] **G20. 第一次月結 dry-run**：實際走一次月底流程（重算 → 下載報表 → 對照），看數字 / 缺卡 / 加班是否合理。
- [ ] **G21. 管理者 SOP 文件**：新增員工、改 PIN、下載報表、撞 quota 怎麼辦。
- [ ] **G22. 員工教學**：1 張紙說明打卡、補登、加班三個流程。
- [ ] **G23. 回滾計畫**：如果第一週系統有問題，能不能回去用 iCHEF + LINE。把 iCHEF 帳號保留別停用。

---

## 建議優先順序

| 階段 | 項目 |
|---|---|
| **上線前必做（blocker）** | A1、B3、E13、E14、F16、F18、D8、D9、D10 |
| **上線前強烈建議** | B4、D11、G20 |
| **第一週內補** | C5（device token）、A2（決定保留與否）、G21、G22 |
| **之後再說** | C6、C7、D12、F17、E15 |
