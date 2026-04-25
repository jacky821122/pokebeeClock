# Device Token 設定指南

打卡頁無 user auth，靠 device token 防止「知道 URL 就能打卡」。每個被授權的裝置（iPad、個人手機）配一組 token，存在該瀏覽器的 localStorage，每次打卡 API 自動帶 header 驗證。

授權清單放在 Google Sheet 的 `devices` tab——管理權與 PIN、employees 一致（誰有 Sheet 編輯權誰能改），不需碰 Vercel。

---

## 1. 在 Sheet 建 `devices` tab（一次性）

開試算表，新增分頁 `devices`，第一列 header：

| label | token | active |
|---|---|---|

> 沒有 `devices` tab 或 active 列為空 → server 端**不啟用**驗證（任何 request 都過）。dev/初次安裝友善，但 production 一定要建好。

---

## 2. 產生 token

每台裝置一組獨立 token。本機產生，不上傳：

```sh
openssl rand -hex 16
# 例：a1b2c3d4e5f67890a1b2c3d4e5f67890
```

需要幾台就跑幾次。建議的 label 命名：地點/用途（例：`ipad-store`、`phone-jacky`），方便日後從 `raw_punches` 表追溯。

---

## 3. 寫入 Sheet

在 `devices` tab 新增一列：

| label | token | active |
|---|---|---|
| ipad-store | a1b2c3d4... | TRUE |
| phone-jacky | 9f8e7d6c... | TRUE |

存檔即生效，**不需 redeploy**。下一次 punch API 呼叫就會讀到新清單。

---

## 4. 各裝置完成 setup

> **iOS 重要**：Safari 與「加到主畫面」的 PWA 是**分開的 storage**，要分別跑一次 setup。先在 Safari 設好確認能用，再加到主畫面、從主畫面圖示打開 PWA、再貼一次同樣的 token。詳見下方 FAQ。

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

> **生產環境一定要用 production domain**（你的 custom domain 或固定的 `*.vercel.app` alias），不要用 immutable preview URL（每次 deploy 會變）——否則下次 deploy 後 origin 不同，localStorage 看不到，會被迫重設。

---

## 5. 驗證

完成 setup 後：

1. 該裝置打開 `/`，正常輸入 PIN → 應能打卡
2. 開另一個沒設定過的瀏覽器（或無痕視窗）打開 `/`，輸入 PIN → 應自動跳到 `/setup`
3. 打卡後查 Google Sheet 的 `raw_punches`，最右欄應有 device label（例：`ipad-store`）

---

## 6. 失效與撤銷

### 撤銷單一裝置（裝置遺失、員工離職）

1. 編 `devices` tab，把該列的 `active` 改成 `FALSE`（或直接刪掉整列）
2. 存檔即生效（無 cache，下次 API 呼叫立即拒絕）
3. 該裝置下次 punch 會收到 401，自動跳 `/setup`，且 localStorage 裡舊 token 被清掉

### 全部重置

把 `devices` tab 整個清空（保留 header 即可）→ 變回不啟用驗證（任何裝置都能打卡）。**只在緊急情況用**，平常別這樣。

### 換 token（懷疑外洩但裝置還在）

1. 重新跑 `openssl rand -hex 16` 產新 token
2. 改 Sheet 對應列的 token 欄
3. 該裝置會 401 → 跳 `/setup` → 重新貼新 token

---

## FAQ

**Q: 一個 token 可以多台裝置共用嗎？**
A: 技術上可以（server 端只比對字串），但失去 label 追蹤的意義。建議一台一組。

**Q: 瀏覽器清快取/重灌會丟失 token 嗎？**
A: 會。token 存在 localStorage，清掉就要重新 setup（重新打開 `/setup?code=...` 即可，token 本身不變）。

**Q: PWA 裝到主畫面後，token 還在嗎？**
A: **iOS Safari 與 PWA 是分開的 storage**——加到主畫面後 PWA 會建獨立 sandbox，看不到 Safari 那邊的 localStorage。所以 iPad / iPhone 上要：
  1. Safari 打開 `/setup?code=xxx` → 設定一次（為了能在 Safari 內用）
  2. 加到主畫面 → 從主畫面圖示打開 PWA → **再跑一次 setup**（PWA 會自動跳 `/setup`，貼同一個 token 即可）

  之後兩邊各自獨立運作，token 失效時也要兩邊各自重新設定。Android Chrome 不一定有此隔離（視版本而定），但建議照同樣流程跑一遍最保險。

**Q: 為什麼不做 session/JWT 過期？**
A: 打卡頁是長期常駐的店面 iPad，session 過期會造成「員工要打卡但要先請管理者重新登入」的麻煩。改 Sheet 是唯一的撤銷路徑——簡單、明確、不會自己過期。

**Q: token 在網路上會被偷看嗎？**
A: 全程 HTTPS（Vercel 預設）。中間人攔截需要破 TLS。實際風險比 token 寫在便利貼上被偷看高得多——別把 setup URL 截圖丟群組。

**Q: 為什麼不加 cache？每次 punch 都讀一次 Sheet 不會慢嗎？**
A: 流量很小（10-20 員工 × 每天 ~2 次打卡 < 100 次/天，平均 <1 req/min），Sheets API quota（60 reads/min/user）綽綽有餘。多 ~150ms 延遲跟原本 punch flow 已經多次讀 Sheet 比起來可忽略。換來的好處：撤銷即時生效，零 cache 失效邏輯。
