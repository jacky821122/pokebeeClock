# Plan: pokebeeClock — 自建打卡 + 補登 PWA

## 動機

1. 現行打卡用 iCHEF CSV，月底人工匯入；補登用 LINE 記事本。兩邊資料分開對照很麻煩
2. 希望**打卡與補登合併到同一張 Google Sheet**，月底一次看完
3. 打卡分析自動化（打卡即時重算 `analyzed_YYYY-MM`）

## 產品定位

- 店內 iPad 常駐管理者 Google 帳號，員工自助打卡（輸入 PIN 即識別）
- 補登同一 PWA，月底人工審核（不影響 analyzer 自動結果）
- 不取代現有 iCHEF 流程，pokebee 的 Python analyzer 保留為 ground truth

## 技術棧

| | 來源/參考 |
|---|---|
| Framework | Next.js (App Router) + Vercel |
| Data store | Google Sheet（單張，多 tab） |
| Sheets client | `googleapis` service account |
| Styling | Tailwind v4 |
| Auth (admin) | `Authorization: Bearer $ADMIN_SECRET` |
| Analyzer | Python `clock_in_out_analyzer.py` port 成 TypeScript（`src/lib/analyzer/`） |

## 資料層哲學

```
raw_punches（永久保留原始事件）
  ↓ 每次打卡觸發
analyzed_YYYY-MM（per-day records，持久化）
  ↓ 月底 on-demand
xlsx 報表（展示層，不持久化）
```

- `raw_punches` 是唯一事實來源，analyzed 可從它完整重建
- 月度摘要不持久化，報表需要時即時從 raw_punches + overtime_requests 重算

## 安全原則

- iPad 維持管理者 Google session 常駐（主要屏障）
- `/admin` 與 admin API：`Authorization: Bearer $ADMIN_SECRET`
- PIN 4 位數明文儲存（sha256 對 10k 可能性無實質保護，明文反而省複雜度）
- Service account JSON 走 Vercel env var，不進 repo

## 跨專案關係

```
pokebee/
├─ clock_in_out_analyzer.py   ── ground truth，保留作備援
└─ docs/hours_analyzer_spec.md ── 複製到 docs/hours_analyzer_spec.md

pokebeeClock-analyzer/   ── 一次性 port 專案，使命結束
  └─ 產出搬入 src/lib/analyzer/
```
