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
- `TAILSCALE_EXIT_NODE` is the Tailscale machine name or `100.x.y.z` tailnet IP of the exit node. The primary exit node is `gl-axt1800` (the GL-AXT1800 router in a JP residential network). Only this node's network can reliably reach the source sites.
- If multiple nodes are listed (newline-separated), the workflow probes in order and uses the first reachable exit node that can also reach at least one source site. **Do not list `tachinas`** — it is in Taiwan and its egress cannot reach the source sites.
- Missing or expired Tailscale secrets cause the workflow to **fail immediately** (not silently skip). The failure is recorded in the central failure log.
- All exit nodes must advertise themselves as Tailscale exit nodes and be approved in the Tailscale admin console. The primary exit node is `gl-axt1800`.
- Put the most reliable exit node first. The GL-AXT1800 is the primary exit node. **Do not list `tachinas`.**
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

### Intended exit node

This workflow **must** use `gl-axt1800` / `AXT1800` as its exit node. That GL.iNet router is in a residential JP network that can reach `tokyo-weimi.com`, `hikari888.com`, and `vip6969.com`.

**Do not switch this workflow to `tachinas`.** `tachinas` (a Synology NAS in Taiwan) does advertise exit-node capability and appears selectable, but its egress cannot reach the Tokyo source sites. Using it would make `tailscale set` succeed but all source probes return non-2xx.

You can tell which node the runner is configured to use by checking the `TAILSCALE_EXIT_NODE` secret in GitHub Settings → Secrets and variables → Actions. The correct value is `gl-axt1800` or its tailnet IP.

### Recognizing exit-node advertise state drift

The most reliable check is the GitHub Actions log from `Source Diagnostics` or `Update Attendance`. Look for `tailscale status` output:

Healthy — node is advertising exit node:
```
100.100.4.126   tachinas       nurockplayer@  linux  idle; offers exit node
***             gl-axt1800     nurockplayer@  linux  idle; offers exit node
```

Drifted — node is online but not advertising:
```
100.100.4.126   tachinas       nurockplayer@  linux  idle; offers exit node
***             gl-axt1800     nurockplayer@  linux  -
```

In the drifted state, `gl-axt1800` has a `-` in the rightmost column instead of `offers exit node`. This causes `tailscale set --exit-node=gl-axt1800` to fail with:
```
stderr: node gl-axt1800 is not advertising an exit node
```

### Why this happens (GL.iNet state drift)

The GL.iNet AXT1800 manages Tailscale through its own integration layer. The relevant script is `/usr/bin/gl_tailscale`. When the router boots, Tailscale restarts, firmware updates, packages update, or the GL.iNet UI applies a setting change, this wrapper re-runs `tailscale up`.

The key problem: the wrapper's `tailscale up` invocation does **not** include `--advertise-exit-node`. So even though you previously configured exit-node advertising (via `tailscale up --advertise-exit-node` or `tailscale set --advertise-exit-node`), the next GL.iNet-managed restart clears it.

This has happened at least twice:
- 2026-06-26: workflow failed, `gl-axt1800` re-configured manually, worked again
- 2026-07-08: same failure pattern reappeared (recorded in issue #61)

The `tailscale set --advertise-exit-node` flag is in-memory state managed by the tailscaled daemon. It is not written to a persistent config file that survives GL.iNet's own Tailscale management cycle. When GL.iNet's boot sequence calls its own `tailscale up`, the daemon's previous `--advertise-exit-node` is replaced by whatever flags GL.iNet passes — which is none.

### Short-term recovery

When the workflow gate fails with "not advertising an exit node":

```bash
# SSH into the AXT1800
ssh root@gl-axt1800

# Re-apply the advertise-exit-node flag
sudo tailscale up --advertise-exit-node --accept-dns=false
```

Then check that the router now shows the capability:
```bash
tailscale status | grep axt1800
```
Expected: `gl-axt1800` with `offers exit node` in the right column.

Next, go to the Tailscale admin console (https://login.tailscale.com/admin/machines):
- Find `gl-axt1800`
- Confirm the **Exit node** toggle is enabled (if not, turn it on)
- Confirm the device is still approved

After recovery:
1. Re-run `Source Diagnostics` (manual trigger)
2. Confirm `gl-axt1800` shows `offers exit node`
3. Confirm `tailscale set --exit-node=gl-axt1800` succeeds
4. Confirm the public IP after exit node is the AXT1800-side network (Japanese residential, not Taiwanese)
5. Re-run `Update Attendance`
6. Confirm `pnpm run attendance:update` executes

### Post-recovery verification (reboot persistence)

Manual recovery (`tailscale up --advertise-exit-node`) only works until the next router reboot or Tailscale restart. To verify the startup script survives reboots:

1. Reboot gl-axt1800:
   ```bash
   ssh root@gl-axt1800 'reboot'
   ```
2. Wait 2 minutes for the router to boot and GL.iNet to finish its Tailscale setup.
3. Check exit-node status:
   ```bash
   ssh root@gl-axt1800 'tailscale status | grep axt1800'
   ```
   Expected: `gl-axt1800` shows `offers exit node`.
4. Run `Source Diagnostics` from GitHub Actions and confirm:
   - `gl-axt1800` shows `offers exit node`
   - `tailscale set --exit-node=gl-axt1800` succeeds
   - Gate on exit node connectivity passes
5. If the status still shows `-` instead of `offers exit node` after reboot, the startup script did not execute. Investigate:
   - Check `/etc/rc.local` exists and is non-empty:
     ```bash
     cat /etc/rc.local
     ```
   - Check `/etc/init.d/done` is enabled:
     ```bash
     ls -l /etc/rc.d/S95done
     ```
   - Check the script target file still exists:
     ```bash
     ls -l /tmp/verify-exit-node.sh
     ```
   - Check syslog for execution:
     ```bash
     logread | grep exit-node-persistence
     ```

### Actual installed configuration (as of 2026-07-09)

The AXT1800 has the following persistence mechanism installed:

- **Script:** `/tmp/verify-exit-node.sh` — re-applies `tailscale set --advertise-exit-node=true` with retry (60s initial delay, 3 attempts, 30s between attempts)
- **Trigger:** `/etc/rc.local` calls `sh /tmp/verify-exit-node.sh &` before `exit 0`
- **OpenWrt init:** `/etc/init.d/done` (START=95) runs `sh /etc/rc.local` during boot sequence
- **Tailscale version on AXT1800:** 1.80.3 (supports `tailscale set --advertise-exit-node=true`)

If this still fails after reboot, open a new issue titled:
"GL.iNet AXT1800 rc.local persistence does not survive reboot"

### Long-term persistence

The goal is to make `--advertise-exit-node` survive reboots and GL.iNet Tailscale management cycles without manual re-application.

**Option A — GL.iNet Web UI (preferred if available)**

Log into the GL.iNet admin panel (http://192.168.8.1):
Applications → Tailscale → Advanced settings.
Look for a checkbox or toggle labelled "Advertise as Exit Node", "出口節點", or similar.
If the setting survives a reboot, this is the best long-term fix.

**Option B — LuCI startup script (if UI cannot persist the setting)**

GL.iNet firmware includes LuCI (OpenWrt web UI). The "Local startup" script runs after boot and can re-apply flags after GL.iNet's own Tailscale startup completes.

Recommended startup script:
```sh
(
  sleep 90
  tailscale set --advertise-exit-node=true
) &
```

The `sleep 90` is critical: the script must wait until after GL.iNet has finished its own `tailscale up` (which would clear the flag). If the installed `tailscale set` does not accept `--advertise-exit-node=true`, use the `tailscale up` form instead:
```sh
(
  sleep 90
  tailscale up --advertise-exit-node --accept-dns=false
) &
```

To install: GL.iNet Admin → Advanced Settings → Go to LuCI → System → Startup → Local Startup → paste the script → Save & Apply → reboot to verify.

**Option C — Edit `/usr/bin/gl_tailscale` (not preferred)**

Editing the vendor script directly:
```bash
vi /usr/bin/gl_tailscale
```
Find the `tailscale up` invocation and add `--advertise-exit-node`. However, GL.iNet firmware/package updates may overwrite this file, so this is a temporary fix only.

### Diagnosing drift from the workflow logs

The `Source Diagnostics` and `Update Attendance` workflows now print specific messages when `gl-axt1800` is seen online but not advertising:

```text
gl-axt1800 is online but not advertising exit-node capability.
Possible GL.iNet state drift: re-apply --advertise-exit-node on the AXT1800
and approve it in Tailscale admin.
Do not switch to tachinas for this workflow.
```

If you see "tailscale set FAILED" but the `tailscale status` does show other machines offering exit node, compare the rightmost column carefully. `tachinas` will show `offers exit node` but is in Taiwan and cannot reach source sites — do not switch to it.

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
