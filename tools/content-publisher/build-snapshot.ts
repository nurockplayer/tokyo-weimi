#!/usr/bin/env tsx

/**
 * Deterministic ContentSnapshotV1 builder.
 *
 * Synchronous pure function: composes SnapshotSource + baseline SiteData
 * into a validated ContentSnapshotV1. No I/O, no env, no Date.now().
 */

import { createHash } from "node:crypto";
import type {
  SnapshotSource,
  ProfileRow,
  MediaRow,
  AttendanceRow,
  TranslationRow,
  ProfileOverrideRow,
} from "../content-store/types.ts";
import type {
  ContentSnapshotV1,
  SiteData,
  Profile,
  LanguageCode,
  TranslatedProfileText,
  ProfileTranslations,
} from "../../src/types.ts";
import { assertContentSnapshotV1 } from "../../src/content-contract.ts";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function validateInputs(
  source: SnapshotSource,
  baseline: SiteData,
): void {
  const shopIds = new Set(baseline.shops.map((s) => s.id));

  // Profile ids must be unique
  const profileIds = new Set<string>();
  const profileShopMap = new Map<string, string>();
  for (const p of source.profiles) {
    if (profileIds.has(p.id)) {
      throw new ValidationError(`Duplicate profile id: ${p.id}`);
    }
    profileIds.add(p.id);
    profileShopMap.set(p.id, p.shop_id);
    if (!shopIds.has(p.shop_id)) {
      throw new ValidationError(
        `Profile ${p.id} references unknown shop: ${p.shop_id}`,
      );
    }
  }

  // Media ids must be unique, profile_id must exist
  const mediaIds = new Set<string>();
  for (const m of source.media) {
    if (mediaIds.has(m.id)) {
      throw new ValidationError(`Duplicate media id: ${m.id}`);
    }
    mediaIds.add(m.id);
    if (!profileIds.has(m.profile_id)) {
      throw new ValidationError(
        `Media ${m.id} references unknown profile: ${m.profile_id}`,
      );
    }
  }

  // Attendance: profile_id must exist, no duplicate per profile,
  // and shop_id must match the referenced profile's shop_id
  const attendanceProfiles = new Set<string>();
  for (const a of source.attendance) {
    if (!profileIds.has(a.profile_id)) {
      throw new ValidationError(
        `Attendance references unknown profile: ${a.profile_id}`,
      );
    }
    if (attendanceProfiles.has(a.profile_id)) {
      throw new ValidationError(
        `Duplicate attendance for profile: ${a.profile_id}`,
      );
    }
    const profileShopId = profileShopMap.get(a.profile_id);
    if (profileShopId !== undefined && a.shop_id !== profileShopId) {
      throw new ValidationError(
        `Attendance for profile ${a.profile_id} has shop ${a.shop_id}, expected ${profileShopId}`,
      );
    }
    attendanceProfiles.add(a.profile_id);
  }

  // Override: profile_id must exist, no duplicate per profile
  const overrideProfiles = new Set<string>();
  for (const o of source.overrides) {
    if (!profileIds.has(o.profile_id)) {
      throw new ValidationError(
        `Override references unknown profile: ${o.profile_id}`,
      );
    }
    if (overrideProfiles.has(o.profile_id)) {
      throw new ValidationError(
        `Duplicate override for profile: ${o.profile_id}`,
      );
    }
    overrideProfiles.add(o.profile_id);
  }

  // Translation validation
  const VALID_LANGUAGES = new Set(["zh-Hant", "zh-Hans", "ja", "ko", "en"]);
  const translationKeys = new Set<string>();
  for (const t of source.translations) {
    if (!profileIds.has(t.profile_id)) {
      throw new ValidationError(
        `Translation references unknown profile: ${t.profile_id}`,
      );
    }
    if (!VALID_LANGUAGES.has(t.language)) {
      throw new ValidationError(
        `Translation for profile ${t.profile_id} has invalid language: ${t.language}`,
      );
    }
    const key = `${t.profile_id}\0${t.language}`;
    if (translationKeys.has(key)) {
      throw new ValidationError(
        `Duplicate translation for profile ${t.profile_id}, language ${t.language}`,
      );
    }
    translationKeys.add(key);
  }
}

// ---------------------------------------------------------------------------
// Media reconstruction helpers
// ---------------------------------------------------------------------------

function buildProfileMedia(
  profileId: string,
  media: MediaRow[],
): {
  gallery: string[];
  supportScreenshots: string[];
  supplementalMedia: string[];
  videos: string[];
} {
  const sorted = [...media].sort((a, b) => {
    const pa = a.position ?? 0;
    const pb = b.position ?? 0;
    return pa - pb || a.id.localeCompare(b.id);
  });

  const gallery: string[] = [];
  const supportScreenshots: string[] = [];
  const supplementalMedia: string[] = [];
  const videos: string[] = [];

  for (const m of sorted) {
    if (m.media_type === "image" && m.role === "gallery") {
      if (!m.image_key) {
        throw new ValidationError(
          `Profile ${profileId} media ${m.id}: missing image_key for gallery role`,
        );
      }
      gallery.push(m.image_key);
    } else if (m.media_type === "image" && m.role === "support") {
      if (!m.image_key) {
        throw new ValidationError(
          `Profile ${profileId} media ${m.id}: missing image_key for support role`,
        );
      }
      supportScreenshots.push(m.image_key);
    } else if (m.media_type === "image" && m.role === "supplemental") {
      if (!m.image_key) {
        throw new ValidationError(
          `Profile ${profileId} media ${m.id}: missing image_key for supplemental role`,
        );
      }
      supplementalMedia.push(m.image_key);
    } else if (m.media_type === "video" && m.role === "video") {
      videos.push(m.source_url);
    } else {
      throw new ValidationError(
        `Profile ${profileId} media ${m.id}: unsupported combination media_type=${m.media_type} role=${m.role ?? "undefined"}`,
      );
    }
  }

  return { gallery, supportScreenshots, supplementalMedia, videos };
}

// ---------------------------------------------------------------------------
// Image map construction
// ---------------------------------------------------------------------------

function buildImageMap(
  baselineImageMap: Record<string, string>,
  media: MediaRow[],
): Record<string, string> {
  const result: Record<string, string> = { ...baselineImageMap };

  for (const m of media) {
    if (m.media_type !== "image" || !m.image_key) continue;
    const existing = result[m.image_key];
    if (existing !== undefined && existing !== m.source_url) {
      throw new ValidationError(
        `Image key conflict: "${m.image_key}" maps to both "${existing}" and "${m.source_url}"`,
      );
    }
    result[m.image_key] = m.source_url;
  }

  // Sort keys lexicographically for deterministic output
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(result).sort()) {
    sorted[key] = result[key]!;
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// Profile mapping
// ---------------------------------------------------------------------------

function mapProfile(
  row: ProfileRow,
  isToday: boolean,
  media: MediaRow[],
): Profile {
  const reconstructed = buildProfileMedia(row.id, media);

  const profile: Profile = {
    id: row.id,
    shopId: row.shop_id,
    name: row.name,
    title: row.title,
    date: row.date,
    image: "", // will be set after gallery is known
    gallery: reconstructed.gallery,
    origin: row.origin,
    age: row.age,
    height: row.height,
    weight: row.weight,
    cup: row.cup,
    tags: row.tags,
    price: row.price,
    summary: row.summary,
    isToday,
  };

  if (reconstructed.supportScreenshots.length > 0) {
    profile.supportScreenshots = reconstructed.supportScreenshots;
  }
  if (reconstructed.supplementalMedia.length > 0) {
    profile.supplementalMedia = reconstructed.supplementalMedia;
  }
  if (reconstructed.videos.length > 0) {
    profile.videos = reconstructed.videos;
  }
  if (row.last_seen_at) {
    profile.lastSeen = row.last_seen_at;
  }

  return profile;
}

// ---------------------------------------------------------------------------
// Override application
// ---------------------------------------------------------------------------

function applyOverrides(
  profiles: Profile[],
  overrides: ProfileOverrideRow[],
): Profile[] {
  const overrideMap = new Map<string, ProfileOverrideRow>();
  for (const o of overrides) {
    overrideMap.set(o.profile_id, o);
  }

  return profiles.filter((p) => {
    const o = overrideMap.get(p.id);
    if (o?.hidden === true) return false;
    return true;
  }).map((p) => {
    const o = overrideMap.get(p.id);
    if (!o) return p;

    const updated = { ...p };
    if (o.name !== null && o.name !== undefined) updated.name = o.name;
    if (o.title !== null && o.title !== undefined) updated.title = o.title;
    if (o.origin !== null && o.origin !== undefined) updated.origin = o.origin;
    if (o.age !== null && o.age !== undefined) updated.age = o.age;
    if (o.height !== null && o.height !== undefined) updated.height = o.height;
    if (o.weight !== null && o.weight !== undefined) updated.weight = o.weight;
    if (o.cup !== null && o.cup !== undefined) updated.cup = o.cup;
    if (o.price !== null && o.price !== undefined) updated.price = o.price;
    if (o.summary !== null && o.summary !== undefined) updated.summary = o.summary;
    if (o.tags !== null && o.tags !== undefined) updated.tags = o.tags;

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Profile ordering
// ---------------------------------------------------------------------------

function sortProfiles(
  profiles: Profile[],
  attendance: AttendanceRow[],
): { todayProfiles: Profile[]; nonTodayProfiles: Profile[]; allProfiles: Profile[] } {
  const attendanceMap = new Map<string, AttendanceRow>();
  for (const a of attendance) {
    attendanceMap.set(a.profile_id, a);
  }

  const todayProfiles = profiles
    .filter((p) => attendanceMap.has(p.id))
    .sort((a, b) => {
      const pa = attendanceMap.get(a.id)?.position ?? 0;
      const pb = attendanceMap.get(b.id)?.position ?? 0;
      return pa - pb || a.id.localeCompare(b.id);
    })
    .map((p) => ({ ...p, isToday: true }));

  const nonTodayProfiles = profiles
    .filter((p) => !attendanceMap.has(p.id))
    .sort((a, b) => {
      const la = a.lastSeen;
      const lb = b.lastSeen;
      if (la && lb) return lb.localeCompare(la);
      if (la) return -1;
      if (lb) return 1;
      return a.id.localeCompare(b.id);
    })
    .map((p) => ({ ...p, isToday: false }));

  return {
    todayProfiles,
    nonTodayProfiles,
    allProfiles: [...todayProfiles, ...nonTodayProfiles],
  };
}

// ---------------------------------------------------------------------------
// Hero images
// ---------------------------------------------------------------------------

function buildHeroImages(
  todayProfiles: Profile[],
  nonTodayProfiles: Profile[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const candidates = [...todayProfiles, ...nonTodayProfiles];
  for (const p of candidates) {
    if (result.length >= 4) break;
    if (p.image && !seen.has(p.image)) {
      seen.add(p.image);
      result.push(p.image);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Translation reconstruction
// ---------------------------------------------------------------------------

function buildProfileTranslations(
  profiles: Profile[],
  translations: TranslationRow[],
  profileRows: ProfileRow[],
): ProfileTranslations {
  // Build source_hash lookup for profiles
  const profileHashMap = new Map<string, string>();
  for (const row of profileRows) {
    profileHashMap.set(row.id, row.source_hash);
  }

  // Build set of visible profile ids
  const visibleIds = new Set(profiles.map((p) => p.id));

  const LANGUAGE_ORDER: LanguageCode[] = ["zh-Hant", "zh-Hans", "ja", "ko", "en"];

  // Filter valid translations
  const validTranslations: TranslationRow[] = [];
  for (const t of translations) {
    if (!visibleIds.has(t.profile_id)) continue;
    const sourceHash = profileHashMap.get(t.profile_id);
    if (!sourceHash || t.source_hash !== sourceHash) continue;
    validTranslations.push(t);
  }

  // Group by language
  const buckets: Record<string, Map<string, TranslatedProfileText>> = {};
  for (const lang of LANGUAGE_ORDER) {
    buckets[lang] = new Map();
  }

  for (const t of validTranslations) {
    const bucket = buckets[t.language];
    if (!bucket) continue; // shouldn't happen due to validation
    bucket.set(t.profile_id, {
      title: t.title ?? "",
      summary: t.summary ?? "",
      tags: t.tags,
    });
  }

  // Build final translations with lexicographically sorted profile ids
  const result: Record<string, Record<string, TranslatedProfileText>> = {};
  for (const lang of LANGUAGE_ORDER) {
    const bucket = buckets[lang]!;
    const sorted: Record<string, TranslatedProfileText> = {};
    for (const pid of [...bucket.keys()].sort()) {
      sorted[pid] = bucket.get(pid)!;
    }
    result[lang] = sorted;
  }

  return result as ProfileTranslations;
}

// ---------------------------------------------------------------------------
// Version / hash helpers
// ---------------------------------------------------------------------------

function toCompactTimestamp(iso: string): string {
  return iso.replace(/[-:.]/g, "");
}

function computeSha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf-8").digest("hex");
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

export function buildContentSnapshot(input: {
  source: SnapshotSource;
  baseline: SiteData;
  baselineImageMap: Record<string, string>;
  generatedAt: string;
}): ContentSnapshotV1 {
  const { source, baseline, baselineImageMap, generatedAt } = input;

  // Validate generatedAt
  const parsed = Date.parse(generatedAt);
  if (Number.isNaN(parsed)) {
    throw new ValidationError(`Invalid generatedAt: "${generatedAt}" is not parseable`);
  }
  const normalizedGeneratedAt = new Date(parsed).toISOString();

  // 1. Validate inputs
  validateInputs(source, baseline);

  // 2. Group media by profile_id
  const mediaByProfile = new Map<string, MediaRow[]>();
  for (const m of source.media) {
    const list = mediaByProfile.get(m.profile_id);
    if (list) {
      list.push(m);
    } else {
      mediaByProfile.set(m.profile_id, [m]);
    }
  }

  // 3. Build all profiles (pre-override, pre-sort)
  const rawProfiles: Profile[] = [];
  for (const row of source.profiles) {
    rawProfiles.push(
      mapProfile(row, false, mediaByProfile.get(row.id) ?? []),
    );
  }

  // 4. Apply overrides (includes hidden filtering)
  const visibleRawProfiles = applyOverrides(rawProfiles, source.overrides);

  // Check visible profiles have gallery
  for (const p of visibleRawProfiles) {
    if (p.gallery.length === 0) {
      throw new ValidationError(
        `Profile ${p.id} is visible but has no gallery`,
      );
    }
  }

  // 5. Set image = gallery[0]
  const profilesWithImage = visibleRawProfiles.map((p) => ({
    ...p,
    image: p.gallery[0]!,
  }));

  // 6. Sort profiles (today / non-today)
  const { todayProfiles, nonTodayProfiles, allProfiles } = sortProfiles(
    profilesWithImage,
    source.attendance,
  );

  // 7. Build hero images
  const heroImages = buildHeroImages(todayProfiles, nonTodayProfiles);

  // 8. Build image map
  const imageMap = buildImageMap(baselineImageMap, source.media);

  // 9. Build profile translations
  const profileTranslations = buildProfileTranslations(
    allProfiles,
    source.translations,
    source.profiles,
  );

  // 10. Construct data (static baseline arrays preserved in order)
  const data: SiteData = {
    shops: baseline.shops,
    contact: baseline.contact,
    heroImages,
    profiles: allProfiles,
    pricePlans: baseline.pricePlans,
    hotels: baseline.hotels,
  };

  // 11. Version computation
  const compactTs = toCompactTimestamp(normalizedGeneratedAt);

  // Internal payload for hash (deterministic key order, no version)
  const internalPayload = {
    schemaVersion: 1 as const,
    generatedAt: normalizedGeneratedAt,
    data,
    imageMap,
    profileTranslations,
  };

  const contentHash = computeSha256Hex(JSON.stringify(internalPayload));
  const version = `${compactTs}-${contentHash.slice(0, 12)}`;

  // 12. Final snapshot (deterministic key order)
  const snapshot: ContentSnapshotV1 = {
    schemaVersion: 1,
    version,
    generatedAt: normalizedGeneratedAt,
    data,
    imageMap,
    profileTranslations,
  };

  // 13. Validate before returning
  assertContentSnapshotV1(snapshot);

  return snapshot;
}
