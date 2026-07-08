# Fix: Update Attendance workflow false success + exit node state drift — 最終修復報告

## 根因分析（雙層）

### 第一層：Secret 名稱不匹配
GitHub repo secret 是 `TAILSCALE_EXIT_NODE`（單數），workflow 誤寫為 `TAILSCALE_EXIT_NODES`（複數）。Check 永遠讀不到 → `configured=false` → 全部 skipped → job 仍 success → auto-merge 沒 PR 可合 → content 從 2026-06-27 開始停滯。

Issue #55 的回報內容 parser 沒問題，是 workflow 根本沒執行。

### 第二層：GL.iNet AXT1800 exit-node advertise state drift
修好 secret 後，workflow 跑到 gate step 失敗，因為 `gl-axt1800` 在 Tailscale 上未廣告 exit node。GL.iNet 的 `/usr/bin/gl_tailscale` wrapper 在重啟後重新執行 `tailscale up` 不帶 `--advertise-exit-node`，導致之前手動設定的狀態被清掉。

## PR 清單

| PR | Diff | 內容 |
|----|------|------|
| #58 | YAML only | Secret 名稱修正 + fail-fast |
| #60 | YAML + docs | 診斷強化（tailscale status、stderr、IP、per-host） |
| #63 | YAML + docs | AXT1800 drift 文件化 + 診斷提示 |
| #64 | YAML + docs | Codex spec gaps 修復 |

## Codex 回顧審查

Verdict: SAFE（retrospective 補做）
- Source Diagnostics 加 `exit 1`（原本 loop 結束後無錯誤碼）
- workflow 提示訊息改為泛用（`Node '$node'` 而非 hardcode `gl-axt1800`）
- docs 中多 exit node 與固定 gl-axt1800 的矛盾已修正
- memory/last-report.md 已更新

## 殘餘風險

- GL.iNet AXT1800 exit-node advertise state 可能再次漂移。發生時 workflow 每 2h 失敗一次，failure-log 會留言。
- Source Diagnostics 不攔截 `tachinas`——依賴 source-host probe 被動拒絕。
- `check-site.ts` 只檢查 `TAILSCALE_EXIT_NODE` 字串存在，不檢查 fail-fast 邏輯。
