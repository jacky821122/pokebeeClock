# Device Token 設定指南

打卡頁無 user auth，靠 device token 防止「知道 URL 就能打卡」。每個被授權的裝置（iPad、個人手機）配一組 token，存在該瀏覽器的 localStorage，每次打卡 API 自動帶 header 驗證。

---

## 1. 產生 token

每台裝置一組獨立 token。本機產生，不上傳：

```sh
openssl rand -hex 16
# 例：a1b2c3d4e5f67890a1b2c3d4e5f67890
```

需要幾台就跑幾次。建議的 label 命名：地點/用途，方便日後從 `raw_punches` 表追溯。

---

## 2. 設定 Vercel env var

格式：`label1|token1,label2|token2`（comma 分隔多筆，pipe 分隔 label 與 token）。

```
DEVICE_TOKENS=ipad-store|a1b2c3d4...,phone-jacky|9f8e7d6c...
```

設定步驟：

1. Vercel Dashboard → 專案 → Settings → Environment Variables
2. Name: `DEVICE_TOKENS`，Value: 上面格式
3. Environments 勾 **Production**（dev 不勾，本機跑就不啟用驗證，方便開發）
4. Save → 觸發 redeploy（Deployments → 最新一筆 → Redeploy，或推一個 commit）

> **注意**：env 為空或未設時，server 端**不啟用**驗證（任何 request 都過）。是設計如此，方便本機開發。Production 一定要設。

---

## 3. 各裝置完成 setup

### 方法 A：URL 直接帶 code（推薦）

把帶 code 的 URL 在該裝置上打開：

```
https://<your-app>.vercel.app/setup?code=a1b2c3d4e5f67890a1b2c3d4e5f67890
```

→ 自動填入 → 按「完成設定」→ 驗證成功後跳到打卡頁。

iPad 用法：在自己電腦上產好 URL，AirDrop / iMessage 傳到 iPad，Safari 打開。

手機用法：自己手機上直接打開連結。

### 方法 B：手動輸入

裝置上開 `https://<your-app>.vercel.app/setup`，把 token 貼進輸入框，按「完成設定」。

---

## 4. 驗證

完成 setup 後：

1. 該裝置打開 `/`，正常輸入 PIN → 應能打卡
2. 開另一個沒設定過的瀏覽器（或無痕視窗）打開 `/`，輸入 PIN → 應自動跳到 `/setup`
3. 打卡後查 Google Sheet 的 `raw_punches`，最右欄應有 device label（例：`ipad-store`）

---

## 5. 失效與撤銷

### 撤銷單一裝置（裝置遺失、員工離職）

1. Vercel env var → 編輯 `DEVICE_TOKENS`，把該筆移掉
2. Save → redeploy
3. 該裝置下次 punch 會收到 401，自動跳 `/setup`，且 localStorage 裡舊 token 被清掉

### 全部重置

把 `DEVICE_TOKENS` env var 整個刪掉 → 變回不啟用驗證（任何裝置都能打卡）。**只在緊急情況用**，平常別這樣。

### 換 token（懷疑外洩但裝置還在）

1. 重新跑 `openssl rand -hex 16` 產新 token
2. 改 env var 把舊 token 換掉
3. 該裝置會 401 → 跳 `/setup` → 重新貼新 token

---

## FAQ

**Q: 一個 token 可以多台裝置共用嗎？**
A: 技術上可以（server 端只比對字串），但失去 label 追蹤的意義。建議一台一組。

**Q: 瀏覽器清快取/重灌會丟失 token 嗎？**
A: 會。token 存在 localStorage，清掉就要重新 setup（重新打開 `/setup?code=...` 即可，token 本身不變）。

**Q: PWA 裝到主畫面後，token 還在嗎？**
A: 在。PWA 與 Safari 共享同一個 origin 的 localStorage。

**Q: 為什麼不做 session/JWT 過期？**
A: 打卡頁是長期常駐的店面 iPad，session 過期會造成「員工要打卡但要先請管理者重新登入」的麻煩。改 env var 是唯一的撤銷路徑——簡單、明確、不會自己過期。

**Q: token 在網路上會被偷看嗎？**
A: 全程 HTTPS（Vercel 預設）。中間人攔截需要破 TLS。實際風險比 token 寫在便利貼上被偷看高得多——別把 setup URL 截圖丟群組。
