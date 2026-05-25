# Operations Notes

These notes are for maintainers. Do not copy this wording into visible website content.

## Deployment

- Hosting: Cloudflare Pages.
- Build command: `pnpm build`.
- Build output directory: `dist`.
- Node.js version: `24`.
- The site is a Vite static frontend. Do not reintroduce PHP or Next.js unless the project direction changes.

## Attendance Refresh

- Updater script: `tools/update-today-attendance.ts`.
- Manual GitHub workflow: `.github/workflows/update-attendance.yml`.
- GitHub-hosted runners are currently blocked by the source site with HTTP 403, even when the updater falls back to Playwright Chromium.
- Because of that block, the GitHub workflow is intentionally `workflow_dispatch` only.
- Scheduled refreshes run on the local Mac through Codex automations:
  - `tokyo-weimi-attendance-07-30-jst`
  - `tokyo-weimi-attendance-14-30-jst`
- Both local automations run daily in Japan time, update attendance, run verification, push an automation branch, and open a pull request when content changes.
- Automation pull requests should be reviewed before merge. They should not be auto-merged.

## Gemini Translation

- Repository secret: `GEMINI_API_KEY`.
- The attendance workflow passes the secret only to `pnpm run attendance:update`.
- The updater uses Gemini to fill missing profile translations in `src/content/profile-translations.json`.
- Gemini output is treated as generated profile copy for Simplified Chinese, Japanese, Korean, and English.
- Gemini failures are non-blocking. If the API returns a quota or rate-limit error, the updater keeps the existing fallback translations and still completes the attendance refresh.
- Optional local environment variable: `GEMINI_MODEL`. If unset, the updater uses `gemini-2.0-flash`.

## Content Files

- Primary profile data: `src/content/site-data.json`.
- Generated profile translations: `src/content/profile-translations.json`.
- Source image URL map: `src/content/image-map.json`.
- Source video URLs: profile-level `videos` arrays in `src/content/site-data.json`.
- Local image path map: `src/content/local-image-map.json`, kept as a historical fallback reference.
- Generated TypeScript image map: `src/content/image-map.ts`.
- Some tracked mirrored images remain under `public/assets/old-site/`, but the frontend now renders original source image and video URLs directly.

## Verification

Run these before merging operational or content pipeline changes:

```bash
pnpm run attendance:update
pnpm run typecheck
pnpm test
pnpm run build
pnpm run test:e2e
```

`pnpm run attendance:update` may change content files, image URL maps, and profile video URLs. Review those diffs before committing.

## Known Constraints

- GitHub-hosted scheduled scraping is disabled because the source site blocks GitHub runner traffic.
- Local Mac networking currently succeeds for the source site.
- Images are rendered as original source URLs resolved from `src/content/image-map.json`; profile videos are also rendered from original source URLs.
- The frontend prevents casual right-click, drag, and direct UI download paths, but public web images cannot be made impossible to retrieve by a determined user.
