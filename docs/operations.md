# Operations Notes

These notes are for maintainers. Do not copy this wording into visible website content.

## Deployment

- Hosting: Cloudflare Pages.
- Build command: `pnpm build`.
- Build output directory: `dist`.
- Node.js version: `24`.

## Workflow Failure Tracking

- Failure log workflow: `.github/workflows/record-workflow-failure.yml`.
- Central tracking issue: `GitHub Actions Failure Log` ([#50](https://github.com/nurockplayer/tokyo-weimi/issues/50)).
- Any GitHub Actions workflow that completes with `failure`, `timed_out`, or `action_required` is recorded in the central `GitHub Actions Failure Log` issue.
- The recorder creates the issue automatically if it does not exist and labels it `ci-failure-log`.
- Each failure comment includes the run link, attempt number, event, branch, commit, failed jobs, failed steps, a log excerpt, and an initial heuristic classification.
- When fixing a workflow failure, reference the failure-log comment or issue from the remediation PR. This keeps recurring failures comparable instead of losing root-cause notes in chat.

## Attendance Refresh

- Updater script: `tools/update-today-attendance.ts`.
- GitHub workflow: `.github/workflows/update-attendance.yml`.
- The workflow runs every 2 hours through GitHub Actions.
- GitHub-hosted runners are blocked by the source site when they use the default GitHub/Azure egress IP.
- To avoid that block, the workflow joins the Tailscale tailnet and routes traffic through the home GL-AXT1800 exit node before running the updater.
- Required GitHub repository secrets:
  - `TS_OAUTH_CLIENT_ID`
  - `TS_OAUTH_SECRET`
  - `TAILSCALE_EXIT_NODE`
  - `DEEPSEEK_API_KEY`
- `TAILSCALE_EXIT_NODE` should be the GL-AXT1800 Tailscale machine name or its `100.x.y.z` tailnet IP.
- The GL-AXT1800 must advertise itself as a Tailscale exit node and be approved as an exit node in the Tailscale admin console.
- Local Codex automations may remain as a fallback path, but the primary scheduled refresh path is GitHub Actions through Tailscale.
- Automation pull requests are auto-merged only by `.github/workflows/auto-merge-attendance.yml` after guarded checks pass.
- Guarded auto-merge requires an `automation/update-attendance-YYYY-MM-DD` branch for today's JST date, the expected title, GitHub Actions as author, `main` as base branch, only approved content files changed, bounded additions/deletions, valid content JSON, and all reported PR checks green.
- Any PR that fails a guard remains open for manual review.

## Source Diagnostics

- Manual diagnostic workflow: `.github/workflows/source-diagnostics.yml`.
- Use it after changing Tailscale secrets, exit-node settings, or source scraping behavior.
- It reports the GitHub runner public IP before Tailscale, the public IP after selecting the exit node, and HTTP status for the source homepage, WordPress REST API, and detail pages.

## DeepSeek Translation

- Repository secret: `DEEPSEEK_API_KEY`.
- The attendance workflow passes the secret only to `pnpm run attendance:update`.
- The updater uses DeepSeek to fill missing profile translations in `src/content/profile-translations.json`.
- DeepSeek output is treated as generated profile copy for Simplified Chinese, Japanese, Korean, and English.
- DeepSeek failures are non-blocking. If the API returns a quota or rate-limit error, the updater keeps the existing fallback translations and still completes the attendance refresh.
- Optional local environment variable: `DEEPSEEK_MODEL`. If unset, the updater uses `deepseek-v4-pro`.

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

- GitHub-hosted scheduled scraping requires Tailscale exit-node routing because the source site blocks default GitHub/Azure egress traffic.
- Local Mac networking currently succeeds for the source site.
- Images are rendered as original source URLs resolved from `src/content/image-map.json`; profile videos are also rendered from original source URLs.
- The frontend prevents casual right-click, drag, and direct UI download paths, but public web images cannot be made impossible to retrieve by a determined user.
