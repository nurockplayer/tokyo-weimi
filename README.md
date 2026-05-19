# 東京維密天使新版前端

Vite 純前端版本，可直接部署到 Cloudflare Pages。內容來源與遷移注意事項請見 `docs/content-source-notes.md`。

## 開發

```bash
pnpm install
pnpm dev
pnpm build
```

Cloudflare Pages 建議設定：

- Build command: `pnpm build`
- Build output directory: `dist`
- Node.js version: `24`

抓取原始資料保存在本機忽略目錄 `scraped/old-site/`。圖片目前沿用 `tokyo-weimi.com/wp-content/uploads` 網址；後續若要改成完全自有 CDN，可再把圖片上傳到 Cloudflare R2 或 Pages assets。
