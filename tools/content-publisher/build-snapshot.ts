#!/usr/bin/env tsx
/**
 * Pure snapshot builder — no I/O, no env, no timestamps.
 *
 * Composes a ContentSnapshotV1 from typed DB rows, a baseline SiteData
 * fragment, and a caller-provided generatedAt.
 */

import { createHash } from "node:crypto";
import type {
  AttendanceRow,
  MediaRow,
  ProfileOverrideRow,
  ProfileRow,
  SnapshotSource,
  TranslationRow,
} from "../content-store/types.ts";
import type {
  ContentSnapshotV1,
  LanguageCode,
  Profile,
  ProfileTranslations,
  TranslatedProfileText,
  SiteData,
} from "../../src/types.ts";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface BuildSnapshotInput {
  source: SnapshotSource;
  baseline: SiteData;
  baselineImageMap: Record<string, string>;
  generatedAt: string;
}

export function buildContentSnapshot(input: BuildSnapshotInput): ContentSnapshotV1 {
  const { source, baseline, baselineImageMap, generatedAt } = input;

  // Validate and normalize generatedAt
  const generatedAtDate = new Date(generatedAt);
  if (Number.isNaN(generatedAtDate.getTime())) {
    throw new Error(`generatedAt must be a valid ISO 8601 date string, got "${generatedAt}"`);
  }
  const generatedAtUtc = generatedAtDate.toISOString();

  // --- Map overrides by profile_id ---
  const overrideMap = new Map<string, ProfileOverrideRow>();
  for (const ov of source.overrides) {
    overrideMap.set(ov.profile_id, ov);
  }

  // --- Build profile map from DB rows ---
  const attendanceProfileIds = new Set(
    source.attendance.map((a) => a.profile_id),
  );
  const attendancePosition = new Map<string, number>();
  for (const a of source.attendance) {
    attendancePosition.set(a.profile_id, a.position ?? 0);
  }

  // Filter hidden profiles, apply overrides
  const visibleProfiles: Array<{ row: ProfileRow; override?: ProfileOverrideRow }> = [];
  for (const row of source.profiles) {
    const ov = overrideMap.get(row.id);
    if (ov?.hidden === true) continue; // skip hidden
    visibleProfiles.push({ row, override: ov });
  }

  // --- Build media by profile_id ---
  const mediaByProfile = new Map<string, MediaRow[]>();
  for (const m of source.media) {
    const list = mediaByProfile.get(m.profile_id) ?? [];
    list.push(m);
    mediaByProfile.set(m.profile_id, list);
  }

  // --- Compose profiles ---
  const composedProfiles: Profile[] = [];

  // Sort: today-attendance profiles first by position then id,
  // non-today by last_seen_at desc then id
  const sortedVisible = [...visibleProfiles].sort((a, b) => {
    const aIsToday = attendanceProfileIds.has(a.row.id);
    const bIsToday = attendanceProfileIds.has(b.row.id);
    if (aIsToday !== bIsToday) return aIsToday ? -1 : 1;
    if (aIsToday && bIsToday) {
      const aPos = attendancePosition.get(a.row.id) ?? 0;
      const bPos = attendancePosition.get(b.row.id) ?? 0;
      if (aPos !== bPos) return aPos - bPos;
    }
    if (!aIsToday && !bIsToday) {
      const aLast = a.row.last_seen_at ?? "";
      const bLast = b.row.last_seen_at ?? "";
      if (aLast !== bLast) return aLast > bLast ? -1 : 1;
    }
    return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
  });

  for (const { row, override } of sortedVisible) {
    const profile = composeProfile(row, override, mediaByProfile);
    // Set isToday based on attendance
    if (attendanceProfileIds.has(row.id)) {
      profile.isToday = true;
    }
    composedProfiles.push(profile);
  }

  // --- Hero images ---
  const heroImages: string[] = [];
  // First: today visible profiles by sort order
  for (const p of composedProfiles) {
    if (heroImages.length >= 4) break;
    if (p.isToday) {
      heroImages.push(p.image);
    }
  }
  // Fill remaining with other visible profiles
  if (heroImages.length < 4) {
    for (const p of composedProfiles) {
      if (heroImages.length >= 4) break;
      if (!p.isToday) {
        heroImages.push(p.image);
      }
    }
  }

  // --- Image map ---
  const imageMap: Record<string, string> = { ...baselineImageMap };
  for (const m of source.media) {
    if (m.media_type === "image" && m.image_key) {
      imageMap[m.image_key] = m.source_url;
    }
  }

  // --- Translations — only for visible profiles ---
  const visibleProfileRows = sortedVisible.map((v) => v.row);
  const profileTranslations = buildTranslations(source.translations, visibleProfileRows);

  // --- Assemble SiteData (baseline fields + DB-driven fields) ---
  const data: SiteData = {
    shops: baseline.shops,
    contact: baseline.contact,
    heroImages,
    profiles: composedProfiles,
    pricePlans: baseline.pricePlans,
    hotels: baseline.hotels,
  };

  // --- Deterministic version (without including version) ---
  const version = computeVersion(generatedAtUtc, data, imageMap, profileTranslations);

  return {
    schemaVersion: 1,
    version,
    generatedAt: generatedAtUtc,
    data,
    imageMap,
    profileTranslations,
  };
}

// ---------------------------------------------------------------------------
// Profile composition
// ---------------------------------------------------------------------------

function composeProfile(
  row: ProfileRow,
  override: ProfileOverrideRow | undefined,
  mediaByProfile: Map<string, MediaRow[]>,
): Profile {
  const profileMedia = mediaByProfile.get(row.id) ?? [];

  const gallery: string[] = [];
  const supportScreenshots: string[] = [];
  const supplementalMedia: string[] = [];
  const videos: string[] = [];

  for (const m of [...profileMedia].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    if (m.role === "gallery") {
      if (m.media_type === "image") {
        if (!m.image_key) {
          throw new Error(
            `Image media row ${m.id} for profile ${row.id} is missing image_key`,
          );
        }
        gallery.push(m.image_key);
      }
    } else if (m.role === "support") {
      if (m.media_type === "image") {
        if (!m.image_key) {
          throw new Error(
            `Image media row ${m.id} for profile ${row.id} is missing image_key`,
          );
        }
        supportScreenshots.push(m.image_key);
      }
    } else if (m.role === "supplemental") {
      if (m.media_type === "image") {
        if (!m.image_key) {
          throw new Error(
            `Image media row ${m.id} for profile ${row.id} is missing image_key`,
          );
        }
        supplementalMedia.push(m.image_key);
      }
    } else if (m.role === "video") {
      videos.push(m.source_url);
    }
  }

  // Validate: visible profiles must have at least one gallery image
  if (gallery.length === 0) {
    throw new Error(`Visible profile ${row.id} has no gallery images`);
  }

  // Override: non-null fields from override replace profile fields
  const name = override?.name ?? row.name;
  const title = override?.title ?? row.title;
  const origin = override?.origin ?? row.origin;
  const age = override?.age ?? row.age;
  const height = override?.height ?? row.height;
  const weight = override?.weight ?? row.weight;
  const cup = override?.cup ?? row.cup;
  const price = override?.price ?? row.price;
  const summary = override?.summary ?? row.summary;
  const tags = override?.tags ?? row.tags;

  return {
    id: row.id,
    shopId: row.shop_id,
    name,
    title,
    date: row.date,
    image: gallery[0] ?? "",
    gallery,
    supportScreenshots: supportScreenshots.length > 0 ? supportScreenshots : undefined,
    supplementalMedia: supplementalMedia.length > 0 ? supplementalMedia : undefined,
    origin,
    age,
    height,
    weight,
    cup,
    tags,
    price,
    summary,
    videos: videos.length > 0 ? videos : undefined,
    isToday: false, // set below
    lastSeen: row.last_seen_at,
  };
}

// ---------------------------------------------------------------------------
// Translation building
// ---------------------------------------------------------------------------

function buildTranslations(
  translationRows: TranslationRow[],
  profileRows: ProfileRow[],
): ProfileTranslations {
  // Build source_hash map
  const hashById = new Map<string, string>();
  for (const p of profileRows) {
    hashById.set(p.id, p.source_hash);
  }

  // Group valid translations by (profile_id, language)
  const seen = new Set<string>();
  const langBuckets: Record<string, Record<string, TranslatedProfileText>> = {};
  const LANGUAGES: LanguageCode[] = ["zh-Hant", "zh-Hans", "ja", "ko", "en"];
  for (const lang of LANGUAGES) {
    langBuckets[lang] = {};
  }

  for (const t of translationRows) {
    const profileHash = hashById.get(t.profile_id);
    // Only accept translations matching the profile's current source_hash
    if (t.source_hash !== profileHash) continue;

    const key = `${t.profile_id}\0${t.language}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate translation row for (profile_id="${t.profile_id}", language="${t.language}")`,
      );
    }
    seen.add(key);

    if (!langBuckets[t.language]) {
      // Unknown language — skip (shouldn't happen with valid data)
      continue;
    }

    if (!langBuckets[t.language]![t.profile_id]) {
      // Only set if fields have content
      const hasContent =
        (t.title && t.title.length > 0) ||
        (t.summary && t.summary.length > 0) ||
        (t.tags && t.tags.length > 0);

      if (hasContent) {
        langBuckets[t.language]![t.profile_id] = {
          title: t.title ?? "",
          tags: t.tags ?? [],
          summary: t.summary ?? "",
        };
      }
    }
  }

  return langBuckets as ProfileTranslations;
}

// ---------------------------------------------------------------------------
// Deterministic version computation
// ---------------------------------------------------------------------------

function computeVersion(
  generatedAtUtc: string,
  data: SiteData,
  imageMap: Record<string, string>,
  profileTranslations: ProfileTranslations,
): string {
  // Build payload without version — this avoids circular dependency
  const payload = {
    schemaVersion: 1,
    generatedAt: generatedAtUtc,
    data,
    imageMap,
    profileTranslations,
  };

  // Deterministic JSON with sorted keys at every level
  const json = deterministicStringify(payload);
  const contentHash = createHash("sha256").update(json, "utf-8").digest("hex");
  const compactTs = generatedAtUtc
    .replace(/[:-]/g, "")
    .replace(/\.\d+Z$/, "Z")
    .replace(/\.\d{3}/, "");

  return `${compactTs}-${contentHash.slice(0, 12)}`;
}

// ---------------------------------------------------------------------------
// Deterministic JSON stringification (keys in insertion order, but we
// control insertion order via explicit payload construction)
// ---------------------------------------------------------------------------

function deterministicStringify(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    const items = value.map(deterministicStringify);
    return `[${items.join(",")}]`;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Sort keys deterministically, strip undefined values
    const keys = Object.keys(obj).sort();
    const pairs: string[] = [];
    for (const k of keys) {
      const v = deterministicStringify(obj[k]);
      if (v === "") continue; // skip undefined values — serialized form omits them
      pairs.push(`${JSON.stringify(k)}:${v}`);
    }
    return `{${pairs.join(",")}}`;
  }

  return "null";
}

// ---------------------------------------------------------------------------
// Deterministic JSON bytes for publishing (stable key order)
// ---------------------------------------------------------------------------

export function serializeSnapshot(snapshot: ContentSnapshotV1): Uint8Array {
  const obj: Record<string, unknown> = {
    schemaVersion: snapshot.schemaVersion,
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    data: snapshot.data,
    imageMap: snapshot.imageMap,
    profileTranslations: snapshot.profileTranslations,
  };
  const json = deterministicStringify(obj);
  return new TextEncoder().encode(json);
}
