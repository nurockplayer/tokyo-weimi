# Fix: Update Attendance workflow false success + exit node state drift — 最終修復報告

## 根因分析（雙層）

### 第一層：Secret 名稱不匹配
GitHub repo secret 是 `TAILSCALE_EXIT_NODE`（單數），workflow 誤寫為 `TAILSCALE_EXIT_NODES`（複數）。Check 永遠讀不到 → `configured=false` → 全部 skipped → job 仍 success → auto-merge 沒 PR 可合 → content 從 2026-06-27 開始停滯。

Issue #55 的回報內容 parser 沒問題，是 workflow 根本沒執行。

### 第二層：GL.iNet AXT1800 exit-node advertise state drift
修好 secret 後，workflow 跑到 gate step 失敗，因為 `gl-axt1800` 在 Tailscale 上未廣告 exit node。GL.iNet 的 `/usr/bin/gl_tailscale` wrapper 在重啟後重新執行 `tailscale up` 不帶 `--advertise-exit-node`，導致之前手動設定的狀態被清掉。

## PR 清單

| PR | Diff | 內容 | 合併方式 |
|----|------|------|----------|
| #58 | YAML only | Secret 名稱修正 (`TAILSCALE_EXIT_NODES` → `TAILSCALE_EXIT_NODE`) + fail-fast (missing config 不再假 success) | PR |
| #60 | YAML + docs | 診斷強化（tailscale status、stderr 捕捉、public IP 輪詢、per-host HTTP status） | PR |
| #62 | content only | Update attendance for 2026-07-08（包含 25799、26980） | PR |
| #63 | YAML + docs | AXT1800 exit-node state drift docs + diagnostics 提示 | PR |
| #64 | content only | Update attendance for 2026-07-09 | 手動合併 |
| #65 | YAML + docs + memory | Codex retrospective / dual verification 後的 spec gaps 修復（Source Diagnostics exit 1、drift message 泛用化、docs 矛盾修正） | PR |

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

## 2026-07-09 再次發生 state drift

- **Failed run:** #29002767814
- **Root cause:** `gl-axt1800` 再次發生 state drift（在線但 `-`，無 `offers exit node`）
- **Symptom:** `stderr: node gl-axt1800 is not advertising an exit node`
- **Recovery:** SSH → `sudo tailscale up --accept-dns=false --advertise-exit-node --accept-routes --advertise-routes=192.168.0.0/24`
- **Persistence installed:** `/tmp/verify-exit-node.sh` + `/etc/rc.local` call + `/etc/init.d/done` (START=95)
- **Validation run:** #29003773744 — all steps success (gate → attendance:update → typecheck → test → build → e2e → PR)
- **Open risk:** 尚未確認 reboot 後 persistence 是否真正生效
