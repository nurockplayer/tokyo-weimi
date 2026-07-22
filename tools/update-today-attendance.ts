import { refreshAttendanceContent } from "./attendance/refresh.ts";
import type { RefreshResult } from "./attendance/types.ts";
import { writeLegacyContent } from "./attendance/write-legacy-content.ts";

try {
  const result: RefreshResult = await refreshAttendanceContent();
  await writeLegacyContent(result);

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
