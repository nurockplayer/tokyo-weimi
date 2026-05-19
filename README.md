# 東京維密天使新版前端

舊 WordPress/PHP 站會拋棄；此版本先以 Vite 純前端整理舊站公開內容，可直接部署到 Cloudflare Pages。

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

舊站抓取原始資料保存在 `scraped/old-site/`，圖片目前可沿用 `tokyo-weimi.com/wp-content/uploads` 網址。後續若要改成完全自有 CDN，可再把圖片上傳到 Cloudflare R2 或 Pages assets。
