# Fix: Update Attendance workflow false success — issue #55/#56 修復報告

## 根因分析

GitHub repo secret `TAILSCALE_EXIT_NODES`（複數）不存在，只有舊的 `TAILSCALE_EXIT_NODE`（單數）。Workflow 永遠讀不到 exit node → `configured=false` → 全部 skipped → job 仍回傳 `conclusion: success` → auto-merge 看到 success 但沒有 open PR → content 停留在 2026-06-27。

Issue #55 的回報內容實際上在 parser 範疇內並無缺失（兩個 profile 都在首頁），是 workflow 根本沒執行。

## 修改內容

### `.github/workflows/update-attendance.yml`
- 新增 `TAILSCALE_EXIT_NODE`（單數）legacy fallback，支援兩種 secret 名稱
- `Check Tailscale config` 改為 `::error::` + 設 `configured=false`
- `Skip attendance update` → `Abort on missing Tailscale config`（`exit 1`，不再假 success）
- Gate step 不再靠 `skip_reason` 優雅退出，不能用 exit node 就直接 `exit 1`
- 下游 steps 條件簡化：不再檢查 `skip_reason`

### `.github/workflows/source-diagnostics.yml`
- 同上的 `TAILSCALE_EXIT_NODE` legacy fallback
- Exit node step 改用 `exit_nodes` env var

### `docs/operations.md`
- 更新 secret 清單，標記 legacy `TAILSCALE_EXIT_NODE` fallback
- 說明 missing secret 會使 workflow 直接失敗而非靜默跳過

## 驗證狀態

- `pnpm test` — PASSED（check-site.ts 包含 `TAILSCALE_EXIT_NODE` 字串檢查）
- YAML diff review 已完成

## 殘餘風險

- 需要手動補 `TAILSCALE_EXIT_NODES` secret（複製 `TAILSCALE_EXIT_NODE` 值）
- Workflow 改動無法在本地完整模擬，需觀察下一次排程或手動 workflow_dispatch
