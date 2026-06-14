# 東京維密天使新版前端

Vite 純前端版本，可直接部署到 Cloudflare Pages。內容來源與遷移注意事項請見 `docs/content-source-notes.md`，排程、DeepSeek 翻譯與部署設定請見 `docs/operations.md`。

## 開發

```bash
pnpm install
pnpm dev
pnpm run typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Cloudflare Pages 建議設定：

- Build command: `pnpm build`
- Build output directory: `dist`
- Node.js version: `24`

抓取原始資料保存在本機忽略目錄 `scraped/old-site/`。主要內容資料在 `src/content/site-data.json`，圖片來源對應在 `src/content/image-map.json`，影片來源直接存於 profile 的 `videos` 欄位。前端會把圖片 ID 解析成來源站原始圖片 URL 載入；Cloudflare Pages Function 保留作為舊 `/img/:id.jpg` 路徑的備援。

## 部署與檢查

- 專案主程式、工具腳本與 Cloudflare Pages Function 皆使用 TypeScript。
- `pnpm build` 會先執行 Vite build，再用 `tools/postbuild.ts` 產生多語靜態路徑與 `sitemap.xml`。
- 多語路徑：`/zh-hant/`、`/zh-hans/`、`/ja/`、`/ko/`、`/en/`。
- `pnpm test` 會檢查資料檔、圖片代理、SEO 產物、政策文件與 CI 設定。
- `pnpm test:e2e` 會用 Playwright 驗證桌面/手機首頁、多語切換、篩選與相簿流程。
- GitHub Actions 的出勤更新 workflow 保留手動觸發；固定 07:30 / 14:30 JST 更新改由本機 Codex automation 執行，避免 GitHub-hosted runner 被來源站 403 擋下。
