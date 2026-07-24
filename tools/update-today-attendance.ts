import { refreshAttendanceContent } from "./attendance/refresh.ts";
import type { RefreshResult } from "./attendance/types.ts";
import { writeLegacyContent } from "./attendance/write-legacy-content.ts";
import { createSupabaseContentStore, readContentStoreConfig } from "./content-store/supabase-client.ts";
import { persistRefreshResult } from "./content-store/persist-refresh-result.ts";

try {
  const result: RefreshResult = await refreshAttendanceContent();
  await writeLegacyContent(result);

  if (process.env.CONTENT_STORE_ENABLED === "true") {
    const store = createSupabaseContentStore(readContentStoreConfig());
    const runId = await store.startRun({
      sourceDate: result.jstDate,
      metadata: { mode: "legacy-dual-write" },
    });
    try {
      await persistRefreshResult(store, result);
      await store.completeRun(runId, {
        profileCount: result.siteData.profiles.length,
      });
    } catch (error) {
      await store.failRun(runId, error);
      throw error;
    }
  }

  console.log(
    JSON.stringify(
      {
        todayProfiles: result.profiles.length,
        preservedProfiles: result.siteData.profiles.length - result.profiles.length,
        totalProfiles: result.siteData.profiles.length,
        images: Object.keys(result.imageMap).length,
        localImages: Object.keys(result.localImageMap).length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Attendance update failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
