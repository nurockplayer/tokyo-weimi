import { createHash } from "node:crypto";
import type { Profile } from "../../src/types.ts";
import type { RefreshResult } from "../attendance/types.ts";
import type { AttendanceRow, MediaRow, ProfileRow, TranslationRow } from "./types.ts";

const CONTENT_FIELDS: (keyof Profile)[] = [
  "title",
  "tags",
  "summary",
  "name",
  "origin",
  "age",
  "height",
  "weight",
  "cup",
  "price",
];

/**
 * Deterministic SHA-256 hash of profile fields that affect translation / content.
 * Same field values always produce the same hash.
 */
export function computeSourceHash(profile: Profile): string {
  const canonical: Record<string, unknown> = {};
  for (const key of CONTENT_FIELDS) {
    canonical[key] = profile[key];
  }
  const hash = createHash("sha256");
  hash.update(JSON.stringify(canonical), "utf-8");
  return hash.digest("hex");
}

/**
 * Deterministic SHA-256 media ID from profile id, role, and source URL.
 */
export function computeMediaId(profileId: string, role: string, sourceUrl: string): string {
  const hash = createHash("sha256");
  hash.update(`${profileId}\0${role}\0${sourceUrl}`, "utf-8");
  return hash.digest("hex");
}

function extractSourceId(profileId: string): string {
  // Profile IDs following "{shopId}-girl-{wpId}" contain a stable source
  // identifier in the wpId portion.
  const match = profileId.match(/^[^-]+-girl-(.+)$/);
  if (match) return match[1]!;
  // Fallback: profile id is the only stable identifier we have.
  return profileId;
}

function resolveImageUrl(imageId: string, imageMap: Record<string, string>): string {
  const url = imageMap[imageId];
  if (!url) {
    throw new Error(`Image URL not found in image map for image ID: "${imageId}"`);
  }
  return url;
}

export interface MappingResult {
  profiles: ProfileRow[];
  mediaByProfile: Map<string, MediaRow[]>;
  attendance: AttendanceRow[];
  translations: TranslationRow[];
}

/**
 * Map a RefreshResult to DB rows without any I/O.
 *
 * - Profiles get a deterministic source_hash.
 * - Image IDs are resolved through the result's imageMap (throws on miss).
 * - Media IDs are deterministic from profileId + role + sourceUrl.
 * - Attendance rows only for profiles where isToday !== false.
 * - Translation rows skip zh-Hant entries that carry no content.
 */
export function mapRefreshResultToRows(result: RefreshResult): MappingResult {
  const profiles: ProfileRow[] = [];
  const mediaByProfile = new Map<string, MediaRow[]>();
  const attendance: AttendanceRow[] = [];
  const translations: TranslationRow[] = [];
  const sourceHashByProfileId = new Map<string, string>();

  const { jstDate } = result;

  // Compute today profile positions from siteData.profiles display order.
  const todayPosition = new Map<string, number>();
  for (const p of result.siteData.profiles) {
    if (p.isToday !== false) {
      todayPosition.set(p.id, todayPosition.size);
    }
  }

  for (const profile of result.siteData.profiles) {
    const sourceHash = computeSourceHash(profile);
    sourceHashByProfileId.set(profile.id, sourceHash);

    profiles.push({
      id: profile.id,
      shop_id: profile.shopId,
      source_id: extractSourceId(profile.id),
      name: profile.name,
      image: profile.image,
      date: profile.date,
      title: profile.title,
      origin: profile.origin,
      age: profile.age,
      height: profile.height,
      weight: profile.weight,
      cup: profile.cup,
      price: profile.price,
      summary: profile.summary,
      tags: profile.tags,
      source_hash: sourceHash,
      last_seen_at: profile.lastSeen ?? jstDate,
      source_updated_at: profile.date || null,
    });

    // --- Media rows ---

    const mediaRows: MediaRow[] = [];

    const galleryImages = profile.gallery ?? [];
    if (galleryImages.length > 0) {
      for (const [idx, imageId] of galleryImages.entries()) {
        const sourceUrl = resolveImageUrl(imageId, result.imageMap);
        mediaRows.push({
          id: computeMediaId(profile.id, "gallery", sourceUrl),
          profile_id: profile.id,
          source_url: sourceUrl,
          media_type: "image",
          image_key: imageId,
          role: "gallery",
          position: idx,
        });
      }
    } else if (profile.image) {
      const sourceUrl = resolveImageUrl(profile.image, result.imageMap);
      mediaRows.push({
        id: computeMediaId(profile.id, "gallery", sourceUrl),
        profile_id: profile.id,
        source_url: sourceUrl,
        media_type: "image",
        image_key: profile.image,
        role: "gallery",
        position: 0,
      });
    }

    for (const [idx, imageId] of (profile.supportScreenshots ?? []).entries()) {
      const sourceUrl = resolveImageUrl(imageId, result.imageMap);
      mediaRows.push({
        id: computeMediaId(profile.id, "support", sourceUrl),
        profile_id: profile.id,
        source_url: sourceUrl,
        media_type: "image",
        image_key: imageId,
        role: "support",
        position: idx,
      });
    }

    for (const [idx, imageId] of (profile.supplementalMedia ?? []).entries()) {
      const sourceUrl = resolveImageUrl(imageId, result.imageMap);
      mediaRows.push({
        id: computeMediaId(profile.id, "supplemental", sourceUrl),
        profile_id: profile.id,
        source_url: sourceUrl,
        media_type: "image",
        image_key: imageId,
        role: "supplemental",
        position: idx,
      });
    }

    for (const [idx, videoUrl] of (profile.videos ?? []).entries()) {
      mediaRows.push({
        id: computeMediaId(profile.id, "video", videoUrl),
        profile_id: profile.id,
        source_url: videoUrl,
        media_type: "video",
        role: "video",
        position: idx,
      });
    }

    mediaByProfile.set(profile.id, mediaRows);

    // --- Attendance (only for profiles where isToday !== false) ---

    if (profile.isToday !== false) {
      attendance.push({
        profile_id: profile.id,
        attendance_date: jstDate,
        shop_id: profile.shopId,
        position: todayPosition.get(profile.id) ?? 0,
      });
    }

    // --- Translations ---

    for (const [language, langEntries] of Object.entries(result.profileTranslations)) {
      const text = langEntries[profile.id];
      if (!text) continue;

      // Skip zh-Hant entries without actual content.
      if (
        language === "zh-Hant" &&
        !text.title &&
        !text.summary &&
        (!text.tags || text.tags.length === 0)
      ) {
        continue;
      }

      translations.push({
        profile_id: profile.id,
        language,
        title: text.title ?? null,
        summary: text.summary ?? null,
        tags: text.tags ?? [],
        source_hash: sourceHashByProfileId.get(profile.id) ?? sourceHash,
      });
    }
  }

  return { profiles, mediaByProfile, attendance, translations };
}
