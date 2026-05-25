# Content Source Notes

This project is the static frontend replacement for the previous Tokyo Weimi WordPress/PHP site.

These notes are for maintainers only and should not appear in customer-facing website copy.

## Source Material

- Public source site: `https://tokyo-weimi.com/`
- Full crawl script: `tools/scrape-old-site.ts`
- Daily attendance updater: `tools/update-today-attendance.ts`
- Manual GitHub refresh workflow: `.github/workflows/update-attendance.yml`. This remains available for manual checks, but it is not scheduled because the source site returns HTTP 403 to GitHub-hosted runners, including Playwright Chromium.
- Scheduled refreshes run from local Codex automations at 07:30 and 14:30 JST. See `docs/operations.md`.
- Raw crawl output is local-only and ignored by git: `scraped/old-site/`
- Downloaded image copies are local-only and ignored by git: `public/assets/old-site/`
- The live frontend resolves image IDs through `src/content/image-map.json` and renders the source site's original image URLs.
- Profile videos are stored directly as original source video URLs in `src/content/site-data.json`.
- `src/content/local-image-map.json` and tracked local image copies remain as historical fallback references, but `pnpm build` no longer mirrors images into `dist/img/`.
- Primary content is maintained in `src/content/site-data.json`.
- Latest attendance refresh: `2026-05-25` JST, using the public source site's visible `今日出勤` entries. The current refresh keeps 12 today profiles and preserves 9 curated profiles. It excludes placeholders, ads, and the unconfirmed `Mr. 源` QR entry.
- Profiles with `isToday: false` are curated non-today profiles. The daily updater must preserve them instead of deleting them when they are absent from the source site's current attendance list.

## Frontend Copy Rule

Do not mention the old site, WordPress, PHP, migration work, scraping, or static hosting in visible website copy.

Those details belong in project documentation, commit messages, or deployment notes.

## Contact QR Findings

QR codes checked during implementation:

- LINE 1: `https://line.me/ti/p/0PLMapgqhT`
- LINE 2: `https://line.me/ti/p/KMSZfYErhS`
- `https://line.me/ti/p/NTpQS7amx9` scans as `Mr. 源`; it should not be shown unless the client confirms its purpose.

## Gallery Notes

Each visible profile should retain the multiple image galleries from its original profile page. The card image is only the cover image; the detail modal should expose the gallery thumbnails.
