# Content Store Schema

本文檔對應 migration `supabase/migrations/202607180001_content_store.sql`。

## 資料表總覽

| 資料表 | 用途 | Primary Key | Upsert Key | 刪除策略 | Browser 直接存取 |
|---|---|---|---|---|---|
| `content_scrape_runs` | 記錄每一次抓取執行的狀態 | `id` (uuid) | —（append-only log） | 手動清理 | 否（RLS 無 public policy） |
| `content_profiles` | 人物檔案主表，一個 shop+source 一筆 | `id` (text) | `(shop_id, source_id)` | 軟刪除（建議）或 CASCADE 關聯子表 | 否（RLS 無 public policy） |
| `content_profile_media` | 人物對應的圖片與影片 | `id` (text) | `source_url` | CASCADE（跟 profile 一起刪） | 否（RLS 無 public policy） |
| `content_attendance` | 每日出勤快照 | `(profile_id, attendance_date)` | 同 PK（可覆寫） | CASCADE（跟 profile 一起刪） | 否（RLS 無 public policy） |
| `content_profile_translations` | 多語翻譯內容 | `(profile_id, language)` | 同 PK（可覆寫） | CASCADE（跟 profile 一起刪） | 否（RLS 無 public policy） |
| `content_profile_overrides` | 手動覆寫 profile 欄位 | `profile_id` | 同 PK（可覆寫） | CASCADE（跟 profile 一起刪） | 否（RLS 無 public policy） |

## Storage Bucket

| Bucket | 用途 | Public Read | Write | 備註 |
|---|---|---|---|---|
| `site-content` | 存放 profile 相關靜態資源（圖片縮圖等） | 是（`storage.objects` SELECT policy） | Service role only | Idempotent 建立，重複執行 migration 不會失敗 |

## RLS 策略

所有 `content_*` 資料表均已啟用 RLS，但**未建立任何 anon/authenticated 讀取 policy**。
瀏覽器不直接查詢資料庫，所有資料存取由 application code 透過 service_role key 完成。

## Schema 設計決策

- **No triggers**：`updated_at` 由應用程式維護，降低 migration 複雜度。
- **CHECK constraints**：`status`、`media_type`、`role`、`tags` 格式均有 SQL 層級約束。
- **tags 為 JSON array**：使用 `jsonb_typeof(tags) = 'array'` 確保格式正確。
- **Override 使用 nullable 欄位**：null 表示「無覆寫」，查詢時用 `COALESCE(override.col, base.col)` 合併。
- **content_attendance.shop_id 去正規化**：`shop_id` 已在 `content_profiles` 中存在，但為避免 attendance 查詢時頻繁 JOIN `content_profiles`，在此表冗餘儲存。主要查詢模式 `(attendance_date, shop_id, position)` 可完全由 `idx_attendance_date_shop_pos` 覆蓋，無需 join。

## source_hash 欄位說明

`source_hash` 用於偵測來源內容是否發生變更，決定是否需要更新該筆資料。

- **用途**：每次從來源站抓取資料時，比對新舊 `source_hash`。若相同則跳過更新，避免不必要的寫入與翻譯重新產生。
- **雜湊範圍**（`content_profiles.source_hash`）：`name`、`image`、`date`、`title`、`origin`、`age`、`height`、`weight`、`cup`、`price`、`summary`、`tags` 及關聯 media 的 `source_url` 清單。
- **雜湊範圍**（`content_profile_translations.source_hash`）：原始語言的 `title`、`summary`、`tags`。當原始內容變更時，對應翻譯標記為過期。
- **演算法**：SHA-256，使用 PostgreSQL `pgcrypto` extension 的 `digest()` 函式或應用層計算後寫入。
- **更新時機**：insert 時必定寫入；update 時僅在內容欄位實際變更後重新計算並寫入。

## content_profile_media.id 產生邏輯

`content_profile_media.id` 的產生公式為：

```
{profile_id}-{role}-{SHA-256(source_url)}
```

- `profile_id`：對應 `content_profiles.id`
- `role`：對應該 media 的角色（`gallery`、`support`、`supplemental`、`video`）
- `SHA-256(source_url)`：對 `source_url` 取 SHA-256 後的前 16 字元 hex digest

此設計確保同一 profile 下相同 role 的相同 URL 永遠產生相同的 id，支援 idempotent upsert。
