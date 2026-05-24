# Content Source Notes

This project is the static frontend replacement for the previous Tokyo Weimi WordPress/PHP site.

These notes are for maintainers only and should not appear in customer-facing website copy.

## Source Material

- Public source site: `https://tokyo-weimi.com/`
- Full crawl script: `tools/scrape-old-site.ts`
- Daily attendance updater: `tools/update-today-attendance.ts`
- Scheduled refresh workflow: `.github/workflows/update-attendance.yml`, running daily at 07:30 and 14:30 JST and opening a pull request when content changes.
- Raw crawl output is local-only and ignored by git: `scraped/old-site/`
- Downloaded image copies are local-only and ignored by git: `public/assets/old-site/`
- The live frontend renders local image paths such as `/img/:id.jpg`; source image URLs are stored in `src/content/image-map.json` for reference and the Cloudflare Pages Function fallback.
- `src/content/local-image-map.json` points each image ID at a tracked local copy under `public/assets/old-site/`. Postbuild copies those files into `dist/img/` so production does not depend on the old site being reachable.
- Primary content is maintained in `src/content/site-data.json`.
- Latest attendance refresh: `2026-05-24` JST, using the public source site's visible `今日出勤` entries. The refresh keeps 15 real profiles and excludes placeholders, ads, and the unconfirmed `Mr. 源` QR entry.
- Profiles with `isToday: false` are curated non-today profiles. The daily updater must preserve them instead of deleting them when they are absent from the source site's current attendance list.

## Frontend Copy Rule

Do not mention the old site, WordPress, PHP, migration work, scraping, or static hosting in visible website copy.

Those details belong in project documentation, commit messages, or deployment notes.

## Contact QR Findings

QR codes checked during implementation:

- LINE 1: `https://line.me/ti/p/0PLMapgqhT`
- LINE 2: `https://line.me/ti/p/KMSZfYErhS`
- `https://line.me/ti/p/NTpQS7amx9` scans as `Mr. 源`; it should not be shown unless the client confirms its purpose.
- No public WeChat QR was found in the crawled pages or media search.

## Gallery Notes

Each visible profile should retain the multiple image galleries from its original profile page. The card image is only the cover image; the detail modal should expose the gallery thumbnails.
