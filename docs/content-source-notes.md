# Content Source Notes

This project is the static frontend replacement for the previous Tokyo Weimi WordPress/PHP site.

These notes are for maintainers only and should not appear in customer-facing website copy.

## Source Material

- Public source site: `https://tokyo-weimi.com/`
- Crawl script: `tools/scrape-old-site.mjs`
- Raw crawl output is local-only and ignored by git: `scraped/old-site/`
- Downloaded image copies are local-only and ignored by git: `public/assets/old-site/`
- The live frontend renders image proxy paths such as `/img/:id`; source image URLs are stored in `src/content/image-map.json` for the Cloudflare Pages Function.
- Primary content is maintained in `src/content/site-data.json`.

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
