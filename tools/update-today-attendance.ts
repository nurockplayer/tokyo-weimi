import { refreshAttendanceContent } from "./attendance/refresh.ts";
import { writeLegacyContent } from "./attendance/write-legacy-content.ts";

try {
  const result = await refreshAttendanceContent();
  await writeLegacyContent(result);
  console.log(JSON.stringify(result.stats, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
