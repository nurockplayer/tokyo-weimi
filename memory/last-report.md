# Workflow Failure Tracking Report

## 完成了什麼

- 新增 `.github/workflows/record-workflow-failure.yml`，透過 `workflow_run` 監聽 GitHub Actions 失敗、逾時或需要人工處理的 run。
- 已建立 GitHub tracking issue `#50`，Reporter 會更新 `GitHub Actions Failure Log` issue，並用 `ci-failure-log` label 集中保存失敗紀錄。
- 已在 `#50` 留下一則手動回填摘要，整理最近 12 次 `Update Attendance` 失敗；這批都停在 `pnpm/action-setup@v4`，關鍵錯誤是 pnpm metadata fetch socket timeout。
- 每次失敗會留言記錄 run link、attempt、event、branch、commit、failed jobs、failed steps、log excerpt，以及初步分類。
- 更新 `docs/operations.md`，加入 workflow failure tracking 操作規則，並修正 attendance workflow 排程與 Tailscale 限制描述。

## 驗證狀態

- YAML parse 檢查通過。
- Embedded bash 以 `shellcheck -s bash` 檢查通過。
- 使用既有失敗 run `28349590705` 在 `/tmp` 做只讀模擬，確認可以抓到 failed job/step、job log excerpt，並分類為 package manager setup/network timeout。
- `pnpm test` 未跑到專案測試：本地 Codex pnpm wrapper 在 dependency install 階段因 `esbuild@0.28.0` build script 尚未 approve 而停止。

## 殘餘風險

- 新 workflow 只有 merge 到 default branch 後才會開始記錄未來失敗，不會自動回補過去一個月的歷史失敗。
- `actionlint` 本機不可用，因此未執行 GitHub Actions 專用 lint；已用 YAML parse、shellcheck、以及實際 `gh`/`jq` 模擬補強驗證。
