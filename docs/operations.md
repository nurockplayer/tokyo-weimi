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
- To avoid that block, the workflow joins the Tailscale tailnet and routes traffic through a configured exit node before running the updater.
- Required GitHub repository secrets:
  - `TS_OAUTH_CLIENT_ID`
  - `TS_OAUTH_SECRET`
  - `TAILSCALE_EXIT_NODE`
  - `DEEPSEEK_API_KEY`
- `TAILSCALE_EXIT_NODE` is a newline-separated list of Tailscale machine names or `100.x.y.z` tailnet IPs. The workflow probes each node in order, and uses the first one that can reach at least one source site.
- Missing or expired Tailscale secrets cause the workflow to **fail immediately** (not silently skip). The failure is recorded in the central failure log.
- All exit nodes must advertise themselves as Tailscale exit nodes and be approved in the Tailscale admin console.
- Put the most reliable exit node first. The GL-AXT1800 can remain in the list but should not be the only entry.
- Local Codex automations may remain as a fallback path, but the primary scheduled refresh path is GitHub Actions through Tailscale.
- Automation pull requests are auto-merged only by `.github/workflows/auto-merge-attendance.yml` after guarded checks pass.
- Guarded auto-merge requires an `automation/update-attendance-YYYY-MM-DD` branch for today's JST date, the expected title, GitHub Actions as author, `main` as base branch, only approved content files changed, bounded additions/deletions, valid content JSON, and all reported PR checks green.
- Any PR that fails a guard remains open for manual review.

## Source Diagnostics

- Manual diagnostic workflow: `.github/workflows/source-diagnostics.yml`.
- Use it after changing Tailscale secrets, exit-node settings, or source scraping behavior.
- It reports the GitHub runner public IP before Tailscale, `tailscale status`, whether `tailscale set --exit-node` succeeds, public IP after the exit node, and HTTP status for each source endpoint.
- The diagnostics workflow can be triggered even when the attendance update gate is failing — run it first to determine the root cause.

## Tailscale Exit Node Troubleshooting

When `Gate on exit node connectivity` fails in `Update Attendance`, first run `Source Diagnostics` manually.

### 1. `tailscale set` fails (no stderr)

The gate step logs will show:
```
tailscale set FAILED for exit node #1.
Possible causes:
  1. Node is offline or not in the tailnet
  2. Node does not advertise exit-node capability
  3. Exit node is not approved in Tailscale admin console
  4. tag:ci ACL does not permit using this exit node
```

Checklist:
- **Is the node online?** Log into the machine and confirm it is connected to Tailscale (`tailscale status`).
- **Does it advertise exit node?** On the machine, check `tailscale set --advertise-exit-node` is configured.
- **Is it approved?** In the Tailscale admin console (https://login.tailscale.com/admin/machines), find the node and confirm the **Exit node** toggle is enabled.
- **Can `tag:ci` use it?** In Tailscale admin console → **Access controls**, verify the ACL allows `tag:ci` or the GitHub Actions device to use exit nodes. The ACL should include something like:
  ```json
  "nodeAttrs": [
    { "target": ["*"], "attr": ["exit-node"] }
  ]
  ```

### 2. `tailscale set` succeeds but source hosts return non-2xx/3xx

The gate step will show:
```
Public IP after exit node (waiting for route to establish):
  2s: <IP>
  4s: <IP>
  6s: <IP>
```

- If the public IP does not change after the exit node, the route is not working — check that `--exit-node-allow-lan-access=true` is set and the exit node's firewall allows forwarding.
- If the public IP changes but all hosts return HTTP 403/429/000, the exit node's IP may be blocked by the source sites. Try a different exit node or check with the source site operator.
- If only some hosts fail, adjust `SOURCE_HOSTS` in the workflow or add fallback exit nodes.

### 3. `TAILSCALE_EXIT_NODE` secret value

- The secret is a newline-separated list of Tailscale machine names or `100.x.y.z` tailnet IPs.
- Machine names must exactly match what appears in `tailscale status` on the GitHub Actions runner.
- Tailnet IPs (`100.x.y.z`) are more reliable than hostnames.
- After updating the secret, run `Source Diagnostics` to verify.

### 4. Common Tailscale admin steps

```bash
# On the exit node machine — check exit node is advertised
tailscale status
tailscale exit-node list

# Advertise exit node (if not already)
sudo tailscale set --advertise-exit-node

# After advertising, approve in admin console
# https://login.tailscale.com/admin/machines → toggle "Exit node" on
```

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
