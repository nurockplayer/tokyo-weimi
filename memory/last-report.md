# Workflow Failure Tracking Report

## 完成了什麼

- 新增 `.github/workflows/auto-merge-attendance.yml`，在 `Update Attendance` 成功後掃描 open 的 attendance automation PR，通過 guard 才自動 merge。
- 新增 `.github/workflows/record-workflow-failure.yml`，透過 `workflow_run` 監聽 GitHub Actions 失敗、逾時或需要人工處理的 run。
- 已建立 GitHub tracking issue `#50`，Reporter 會更新 `GitHub Actions Failure Log` issue，並用 `ci-failure-log` label 集中保存失敗紀錄。
- 已在 `#50` 留下一則手動回填摘要，整理最近 12 次 `Update Attendance` 失敗；這批都停在 `pnpm/action-setup@v4`，關鍵錯誤是 pnpm metadata fetch socket timeout。
- 每次失敗會留言記錄 run link、attempt、event、branch、commit、failed jobs、failed steps、log excerpt，以及初步分類。
- 更新 `docs/operations.md`，加入 workflow failure tracking 操作規則，並修正 attendance workflow 排程與 Tailscale 限制描述。

## 驗證狀態

- YAML parse 檢查通過。
- Embedded bash 以 `shellcheck -s bash` 檢查通過。
- 使用既有失敗 run `28349590705` 在 `/tmp` 做只讀模擬，確認可以抓到 failed job/step、job log excerpt，並分類為 package manager setup/network timeout。
- Guarded auto-merge dry-run 確認既有舊 attendance PR `#44`-`#48` 會因為不是今天 JST 日期而被跳過，不會被批量 merge。
- `pnpm test` 未跑到專案測試：本地 Codex pnpm wrapper 在 dependency install 階段因 `esbuild@0.28.0` build script 尚未 approve 而停止。

## 殘餘風險

- 新 workflow 只有 merge 到 default branch 後才會開始記錄未來失敗，不會自動回補過去一個月的歷史失敗。
- `actionlint` 本機不可用，因此未執行 GitHub Actions 專用 lint；已用 YAML parse、shellcheck、以及實際 `gh`/`jq` 模擬補強驗證。
- Guarded auto-merge 只處理當天 JST 日期的 attendance PR；較舊的 open attendance PR 會保守跳過，保留人工處理。
- Guarded auto-merge 依賴 GitHub API 回報 PR checks；如果沒有任何 reported check，會保守跳過 auto-merge。
