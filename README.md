# 東京維密天使新版前端

Vite 純前端版本，可直接部署到 Cloudflare Pages。內容來源與遷移注意事項請見 `docs/content-source-notes.md`。

## 開發

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm test:e2e
```

Cloudflare Pages 建議設定：

- Build command: `pnpm build`
- Build output directory: `dist`
- Node.js version: `24`

抓取原始資料保存在本機忽略目錄 `scraped/old-site/`。主要內容資料在 `src/content/site-data.json`，圖片來源對應在 `src/content/image-map.json`，前端透過 `/img/:id` 的 Cloudflare Pages Function 載入圖片。

## 部署與檢查

- `pnpm build` 會先執行 Vite build，再用 `tools/postbuild.mjs` 產生多語靜態路徑與 `sitemap.xml`。
- 多語路徑：`/zh-hant/`、`/zh-hans/`、`/ja/`、`/ko/`、`/en/`。
- `pnpm test` 會檢查資料檔、圖片代理、SEO 產物、政策文件與 CI 設定。
- `pnpm test:e2e` 會用 Playwright 驗證桌面/手機首頁、多語切換、篩選與相簿流程。
