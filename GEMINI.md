# tokyo-weimi — Gemini CLI 運作指令

## 核心身份
你作為本專案的 **Orchestrator (編排者)**。你的任務是維護 Vite + TS 前端架構，並監控自動化管線。

## 協作模式：Gemini + DeepSeek
- **Gemini (你)**：負責代碼邏輯、架構設計、錯誤診斷、任務規劃。
- **DeepSeek (打工仔)**：由 `tools/update-today-attendance.ts` 調用，負責處理 `src/content/profile-translations.json` 中的翻譯任務。
- **規則**：若 DeepSeek 翻譯失敗，應視為非阻塞錯誤 (Non-blocking)，繼續完成剩餘的資料更新與 Build 流程。

## 關鍵運作禁忌
1. **禁止使用npm**：只能使用pnpm。
2. **網絡封鎖意識**：來源站會封鎖 GitHub IP (403)。執行抓取任務時，應優先確認是否在本地環境或是否有 Tailscale 隧道。
3. **圖片處理**：不要嘗試將圖片下載到 `dist`，應維護 `image-map.json` 並引用原始網址。

## 常用診斷流程
當用戶要求檢查專案狀態時，請依序執行：
1. `pnpm run typecheck`
2. `pnpm test` (檢查 SEO 與政策文件)
3. `pnpm test:e2e` (驗證關鍵 UI 流程)

## 參考文件
- 通用規範見 `CLAUDE.md`
- 運維細節見 `docs/operations.md`
- 來源說明見 `docs/content-source-notes.md`
