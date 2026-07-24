import type { ContentStore } from "./types.ts";
import type { RefreshResult } from "../attendance/types.ts";
import { mapRefreshResultToRows } from "./mappers.ts";

/**
 * Persist a RefreshResult into the ContentStore in strict order:
 *
 * 1. upsertProfiles
 * 2. replaceProfileMedia (per profile)
 * 3. replaceAttendance
 * 4. upsertTranslations
 *
 * This function does NOT call startRun() / completeRun() / failRun().
 * The caller is responsible for run lifecycle management.
 */
export async function persistRefreshResult(
  store: ContentStore,
  result: RefreshResult,
): Promise<void> {
  const mapping = mapRefreshResultToRows(result);

  // 1. Upsert all profiles.
  await store.upsertProfiles(mapping.profiles);

  // 2. Replace media for each profile.
  for (const [profileId, rows] of mapping.mediaByProfile) {
    await store.replaceProfileMedia(profileId, rows);
  }

  // 3. Replace attendance for today's date.
  await store.replaceAttendance(mapping.attendance[0]?.attendance_date ?? result.jstDate, mapping.attendance);

  // 4. Upsert translations.
  await store.upsertTranslations(mapping.translations);
}
