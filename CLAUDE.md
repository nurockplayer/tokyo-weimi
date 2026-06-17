# tokyo-weimi — Claude Code Guidelines

## 專案簡述

Vite + TypeScript 多語靜態前端，部署到 Cloudflare Pages。內容來自外部來源站抓取，透過 `src/content/site-data.json` 驅動頁面渲染。支援五種語言：zh-Hant、zh-Hans、ja、ko、en。

## 常用指令

```bash
pnpm install          # 安裝依賴
pnpm dev              # 開發伺服器 (127.0.0.1)
pnpm build            # Vite build + postbuild（多語路徑、sitemap）
pnpm test             # 資料檔、圖片代理、SEO 產物、政策文件檢查
pnpm test:e2e         # Playwright e2e（桌面/手機首頁、多語、篩選、相簿）
pnpm run typecheck    # tsc --noEmit
pnpm run attendance:update  # 更新今日出勤資料（含 DeepSeek 翻譯）
```

## TypeScript 慣例

- 一律 TypeScript（`.ts`），不得新增 `.js` / `.mjs` / `.cjs`
- ES modules（`"type": "module"`），strict mode 開啟
- 工具腳本用 `tsx` 執行（已配置於 package.json scripts）
- 型別定義集中在 `src/types.ts`

## 專案結構

```
src/           # 前端原始碼（main.ts、i18n.ts、media.ts、site-data.ts、types.ts、styles.css）
src/content/   # 資料檔（site-data.json、profile-translations.json、image-map.json 等）
tools/         # 工具腳本（check-site.ts、postbuild.ts、update-today-attendance.ts 等）
tests/         # Playwright e2e 測試
public/        # 靜態檔案（_headers、robots.txt、404.html 等）
docs/          # 維護者文件（operations.md、privacy-policy.md 等）
functions/     # Cloudflare Pages Functions（備援用圖片代理）
dist/          # Build 輸出目錄
```

## 內容管線

- 出勤更新由 GitHub Actions（`.github/workflows/update-attendance.yml`）排程觸發，透過 Tailscale 出口節點繞過來源站 IP 封鎖
- `pnpm run attendance:update` 會抓取來源站資料、用 DeepSeek 補翻譯、更新 `src/content/` 下的 JSON
- Build 時 `tools/postbuild.ts` 產生多語路徑（`/zh-hant/`、`/zh-hans/`、`/ja/`、`/ko/`、`/en/`）和 `sitemap.xml`
- 來源站圖片與影片直接以原始 URL 渲染；圖片 ID 對應表在 `src/content/image-map.json`

## 注意事項

- GitHub Actions runner 會被來源站 403 阻擋，必須走 Tailscale 出口節點
- DeepSeek 翻譯失敗不影響流程，會保留現有翻譯繼續完成更新
- `pnpm run attendance:update` 可能會變更 content JSON，commit 前要檢查 diff
- 前端有防右鍵/拖曳機制，但公開圖片無法完全防止下載

## 驗證檢查清單

更動內容管線或 operational code 後，依序跑：

```bash
pnpm run typecheck
pnpm test
pnpm build
pnpm test:e2e
```
