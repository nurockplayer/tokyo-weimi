#!/usr/bin/env tsx
/**
 * Offline checks for content publisher — pure builder, typed adapter, upload orchestration.
 *
 * Uses fake data throughout — no network, no env, no DB.
 */

import type {
  ContentStore,
  ProfileRow,
  MediaRow,
  AttendanceRow,
  TranslationRow,
  ProfileOverrideRow,
  SnapshotSource,
} from "./content-store/types.ts";
import type { SiteData, ContentSnapshotV1, ContentManifestV1, Profile } from "../src/types.ts";
import { buildContentSnapshot, serializeSnapshot } from "./content-publisher/build-snapshot.ts";
import { publishSnapshot } from "./content-publisher/publish-snapshot.ts";
import { assertContentSnapshotV1, assertContentManifestV1 } from "../src/content-contract.ts";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

function expectThrow(fn: () => void, expectedSubstring: string): void {
  let thrown = false;
  try {
    fn();
  } catch (err) {
    thrown = true;
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes(expectedSubstring)) {
      throw new Error(
        `Expected error containing "${expectedSubstring}", got "${msg}"`,
      );
    }
  }
  if (!thrown) {
    throw new Error(`Expected an error but none was thrown`);
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// ---------------------------------------------------------------------------
// Fake ContentStore for testing publishSnapshot
// ---------------------------------------------------------------------------

interface UploadCall {
  path: string;
  bytes: Uint8Array;
  contentType: string;
  upsert: boolean;
}

function fakeStore(uploadResults?: Array<{ failOnCall?: number; error?: string }>): {
  store: ContentStore;
  uploads: UploadCall[];
} {
  const uploads: UploadCall[] = [];
  let callIndex = 0;

  const store: ContentStore = {
    startRun: async () => { throw new Error("unexpected"); },
    completeRun: async () => { throw new Error("unexpected"); },
    failRun: async () => { throw new Error("unexpected"); },
    upsertProfiles: async () => { throw new Error("unexpected"); },
    replaceProfileMedia: async () => { throw new Error("unexpected"); },
    replaceAttendance: async () => { throw new Error("unexpected"); },
    replaceTranslations: async () => { throw new Error("unexpected"); },
    loadOverrides: async () => { throw new Error("unexpected"); },
    loadSnapshotSource: async () => { throw new Error("unexpected"); },
    uploadObject: async (path, bytes, contentType, upsert) => {
      const idx = callIndex++;
      uploads.push({ path, bytes, contentType, upsert });

      if (uploadResults) {
        for (const r of uploadResults) {
          if (r.failOnCall === idx) {
            throw new Error(r.error ?? "upload error");
          }
        }
      }
    },
  };

  return { store, uploads };
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeProfileRows(...ids: string[]): ProfileRow[] {
  return ids.map((id, i) => ({
    id,
    shop_id: "shop-a",
    source_id: `src-${id}`,
    name: `Profile ${id}`,
    image: `img-${id}-1`,
    date: "2026-07-27",
    title: `Title ${id}`,
    origin: "Japan",
    age: "20",
    height: "160",
    weight: "50",
    cup: "C",
    price: "10000",
    summary: `Summary ${id}`,
    tags: ["tag1"],
    source_hash: `hash-${id}`,
    last_seen_at: `2026-07-2${i}T00:00:00.000Z`,
  }));
}

function makeMediaRows(profileId: string, overrides?: Partial<MediaRow>): MediaRow[] {
  return [
    {
      id: `media-${profileId}-g1`,
      profile_id: profileId,
      source_url: `https://example.com/img/${profileId}/g1.jpg`,
      media_type: "image",
      image_key: `img-${profileId}-1`,
      role: "gallery",
      position: 0,
      ...overrides,
    },
    {
      id: `media-${profileId}-v1`,
      profile_id: profileId,
      source_url: `https://example.com/vid/${profileId}/v1.mp4`,
      media_type: "video",
      image_key: undefined,
      role: "video",
      position: 0,
      ...overrides,
    },
  ];
}

function makeAttendanceRows(profileIds: string[]): AttendanceRow[] {
  return profileIds.map((id, i) => ({
    profile_id: id,
    attendance_date: "2026-07-27",
    shop_id: "shop-a",
    position: i,
  }));
}

function makeTranslationRow(profileId: string, language: string, sourceHash?: string): TranslationRow {
  return {
    profile_id: profileId,
    language,
    title: `Translated ${profileId}`,
    summary: `Translated summary ${profileId}`,
    tags: ["tag-a", "tag-b"],
    source_hash: sourceHash ?? `hash-${profileId}`,
  };
}

function makeBaseline(): SiteData {
  return {
    shops: [
      {
        id: "shop-a",
        name: "Shop A",
        shortName: "A",
        sourceUrl: "https://example.com/shop-a",
        contact: {
          phone: "000-0000",
          line: "@shop-a",
          secondaryLine: "@shop-a2",
          lineQr: "",
          secondaryLineQr: "",
          area: "Tokyo",
          hours: "10:00-22:00",
        },
      },
    ],
    contact: {
      phone: "000-0000",
      line: "@shop",
      secondaryLine: "@shop2",
      lineQr: "",
      secondaryLineQr: "",
      area: "Tokyo",
      hours: "10:00-22:00",
    },
    heroImages: [],
    profiles: [],
    pricePlans: [
      { name: "Plan A", note: "", rows: ["60min/10000"] },
    ],
    hotels: [],
  };
}

function makeSnapshotSource(overrides?: Partial<SnapshotSource>): SnapshotSource {
  return {
    profiles: makeProfileRows("p1", "p2", "p3"),
    media: [
      ...makeMediaRows("p1"),
      ...makeMediaRows("p2"),
      ...makeMediaRows("p3"),
    ],
    attendance: makeAttendanceRows(["p1", "p2"]),
    translations: [
      makeTranslationRow("p1", "en"),
      makeTranslationRow("p2", "ja"),
    ],
    overrides: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Determinism
// ---------------------------------------------------------------------------

console.log("\n=== Determinism ===");

test("same input produces identical snapshot, bytes, version, and hash", () => {
  const source = makeSnapshotSource();
  const baseline = makeBaseline();
  const imageMap: Record<string, string> = { "line-qr-0": "https://example.com/qr0.png" };
  const generatedAt = "2026-07-27T12:00:00.000Z";

  const a = buildContentSnapshot({ source, baseline, baselineImageMap: imageMap, generatedAt });
  const b = buildContentSnapshot({ source, baseline, baselineImageMap: imageMap, generatedAt });

  assert(a.version === b.version, `version mismatch: ${a.version} vs ${b.version}`);
  assert(a.data.profiles.length === b.data.profiles.length, "profile count mismatch");

  const aJson = serializeSnapshot(a);
  const bJson = serializeSnapshot(b);
  assert(Buffer.from(aJson).equals(Buffer.from(bJson)), "JSON bytes differ");

  const aHash = createHash("sha256").update(aJson).digest("hex");
  const bHash = createHash("sha256").update(bJson).digest("hex");
  assert(aHash === bHash, `sha256 mismatch: ${aHash} vs ${bHash}`);
});

test("version suffix uses no-version payload contentHash prefix", () => {
  const source = makeSnapshotSource();
  const baseline = makeBaseline();
  const imageMap: Record<string, string> = {};
  const generatedAt = "2026-07-27T12:00:00.000Z";

  const result = buildContentSnapshot({ source, baseline, baselineImageMap: imageMap, generatedAt });

  // Version format: <compact-ts>-<12-char-contentHash>
  const versionParts = result.version.split("-");
  assert(versionParts.length >= 2, `version doesn't have suffix: ${result.version}`);

  // Compact timestamp: 20260727T12000000Z
  const tsPrefix = versionParts.slice(0, -1).join("-").replace(/[:-]/g, "");
  assert(tsPrefix.includes("20260727"), `timestamp prefix not found in version: ${result.version}`);

  const suffix = versionParts[versionParts.length - 1]!;
  assert(suffix.length === 12, `content hash suffix length is ${suffix.length}, expected 12`);
  assert(/^[a-f0-9]{12}$/.test(suffix), `suffix "${suffix}" is not 12 hex chars`);
});

test("version suffix is derived from no-version payload (not from final snapshot)", () => {
  const source = makeSnapshotSource();
  const baseline = makeBaseline();
  const imageMap: Record<string, string> = {};
  const generatedAt = "2026-07-27T12:00:00.000Z";

  const result = buildContentSnapshot({ source, baseline, baselineImageMap: imageMap, generatedAt });

  // Verify version suffix doesn't contain the version itself (circular dependency check)
  // The suffix is 12 hex chars from the content hash of the payload without version
  const suffix = result.version.split("-").pop()!;
  assert(suffix.length === 12, `suffix should be 12 chars, got ${suffix.length}`);
  assert(/^[a-f0-9]{12}$/.test(suffix), `suffix should be hex, got ${suffix}`);

  // Verify different data produces different version
  // (but without triggering "no gallery images" error for p4)
  const sourceP1Only = makeSnapshotSource({
    profiles: makeProfileRows("p1"),
    media: makeMediaRows("p1"),
    attendance: makeAttendanceRows(["p1"]),
  });
  const result2 = buildContentSnapshot({ source: sourceP1Only, baseline, baselineImageMap: imageMap, generatedAt });

  assert(result.version !== result2.version, "different source data should produce different version");
});

// ---------------------------------------------------------------------------
// 2. Pagination and error handling
// ---------------------------------------------------------------------------

console.log("\n=== Pagination & Error Handling ===");

test("version format match: compact timestamp + 12-char hex suffix", () => {
  const source = makeSnapshotSource();
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });
  const pattern = /^\d{8}T\d{6}Z-[a-f0-9]{12}$/;
  assert(pattern.test(result.version), `version "${result.version}" does not match pattern`);
});

test("manifest sha256 matches final snapshot bytes", () => {
  const source = makeSnapshotSource();
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });
  const bytes = serializeSnapshot(result);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const manifest: ContentManifestV1 = {
    schemaVersion: 1,
    version: result.version,
    generatedAt: result.generatedAt,
    snapshotPath: `snapshots/${result.version}.json`,
    sha256,
  };

  assertContentManifestV1(manifest);
  assert(manifest.sha256 === sha256, "manifest sha256 mismatch");
});

// ---------------------------------------------------------------------------
// 3. Overrides
// ---------------------------------------------------------------------------

console.log("\n=== Overrides ===");

test("override fields replace profile fields", () => {
  const ov: ProfileOverrideRow = {
    profile_id: "p1",
    name: "Override Name",
    title: "Override Title",
    origin: "Osaka",
    age: "25",
    height: "165",
    weight: "48",
    cup: "D",
    price: "12000",
    summary: "Override summary",
    tags: ["ov-tag1", "ov-tag2"],
    updated_at: "2026-07-27T00:00:00.000Z",
  };

  const source = makeSnapshotSource({ overrides: [ov] });
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });

  const profile = result.data.profiles.find((p) => p.id === "p1")!;
  assert(profile.name === "Override Name", `name not overridden: ${profile.name}`);
  assert(profile.title === "Override Title", `title not overridden: ${profile.title}`);
  assert(profile.origin === "Osaka", `origin not overridden: ${profile.origin}`);
  assert(profile.tags.length === 2 && profile.tags[0] === "ov-tag1", `tags not overridden: ${JSON.stringify(profile.tags)}`);
});

test("override with null fields keeps original", () => {
  const ov: ProfileOverrideRow = {
    profile_id: "p2",
    name: null,
    title: "Override Title Only",
    origin: null,
    age: null,
    height: null,
    weight: null,
    cup: null,
    price: null,
    summary: null,
    tags: null,
    updated_at: "2026-07-27T00:00:00.000Z",
  };

  const source = makeSnapshotSource({ overrides: [ov] });
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });

  const p2 = result.data.profiles.find((p) => p.id === "p2")!;
  assert(p2.title === "Override Title Only", `title should be overridden: ${p2.title}`);
  assert(p2.name === "Profile p2", `name should keep original: ${p2.name}`);
});

test("hidden profile is excluded from snapshot", () => {
  const ov: ProfileOverrideRow = {
    profile_id: "p3",
    hidden: true,
    updated_at: "2026-07-27T00:00:00.000Z",
  };

  const source = makeSnapshotSource({ overrides: [ov] });
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });

  const p3 = result.data.profiles.find((p) => p.id === "p3");
  assert(p3 === undefined, "hidden profile p3 should not be in snapshot");

  const p1 = result.data.profiles.find((p) => p.id === "p1");
  assert(p1 !== undefined, "visible profile p1 should be in snapshot");
});

// ---------------------------------------------------------------------------
// 4. Translations
// ---------------------------------------------------------------------------

console.log("\n=== Translations ===");

test("stale translation (source_hash mismatch) is excluded", () => {
  const source = makeSnapshotSource({
    translations: [
      makeTranslationRow("p1", "en", "hash-p1"), // matching
      makeTranslationRow("p1", "ja", "stale-hash"), // non-matching
    ],
  });
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });

  assert(result.profileTranslations["en"]?.["p1"] != null, "matching translation should be included");
  assert(result.profileTranslations["ja"]?.["p1"] == null, "stale translation should be excluded");
});

test("duplicate translation row throws", () => {
  expectThrow(() => {
    const dup1 = makeTranslationRow("p1", "en");
    const dup2: TranslationRow = { ...dup1, summary: "Duplicate" };
    const source = makeSnapshotSource({ translations: [dup1, dup2] });
    const baseline = makeBaseline();
    buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });
  }, "Duplicate translation row");
});

// ---------------------------------------------------------------------------
// 5. Media roles
// ---------------------------------------------------------------------------

console.log("\n=== Media Roles ===");

test("media roles produce correct fields: gallery, support, supplemental, video", () => {
  // Only p1 has full media; p2/p3 get minimal gallery only
  const source = makeSnapshotSource({
    media: [
      {
        id: "m-p1-g1",
        profile_id: "p1",
        source_url: "https://example.com/g1.jpg",
        media_type: "image",
        image_key: "img-p1-g1",
        role: "gallery",
        position: 0,
      },
      {
        id: "m-p1-g2",
        profile_id: "p1",
        source_url: "https://example.com/g2.jpg",
        media_type: "image",
        image_key: "img-p1-g2",
        role: "gallery",
        position: 1,
      },
      {
        id: "m-p1-s1",
        profile_id: "p1",
        source_url: "https://example.com/s1.jpg",
        media_type: "image",
        image_key: "img-p1-s1",
        role: "support",
        position: 0,
      },
      {
        id: "m-p1-supp1",
        profile_id: "p1",
        source_url: "https://example.com/supp1.jpg",
        media_type: "image",
        image_key: "img-p1-supp1",
        role: "supplemental",
        position: 0,
      },
      {
        id: "m-p1-v1",
        profile_id: "p1",
        source_url: "https://example.com/v1.mp4",
        media_type: "video",
        role: "video",
        position: 0,
      },
      {
        id: "m-p1-v2",
        profile_id: "p1",
        source_url: "https://example.com/v2.mp4",
        media_type: "video",
        role: "video",
        position: 1,
      },
      // p2 and p3 get minimal gallery only
      {
        id: "m-p2-g1",
        profile_id: "p2",
        source_url: "https://example.com/g2.jpg",
        media_type: "image",
        image_key: "img-p2-1",
        role: "gallery",
        position: 0,
      },
      {
        id: "m-p3-g1",
        profile_id: "p3",
        source_url: "https://example.com/g3.jpg",
        media_type: "image",
        image_key: "img-p3-1",
        role: "gallery",
        position: 0,
      },
    ],
  });
  const baseline = makeBaseline();
  const result = buildContentSnapshot({
    source,
    baseline,
    baselineImageMap: {},
    generatedAt: "2026-07-27T12:00:00.000Z",
  });

  const p1 = result.data.profiles.find((p) => p.id === "p1")!;
  assert(p1.gallery[0] === "img-p1-g1", `gallery[0] should be image_key`);
  assert(p1.gallery[1] === "img-p1-g2", `gallery[1] should be image_key`);
  assert(p1.supportScreenshots?.[0] === "img-p1-s1", `supportScreenshots[0] should be image_key`);
  assert(p1.supplementalMedia?.[0] === "img-p1-supp1", `supplementalMedia[0] should be image_key`);
  assert(p1.videos?.[0] === "https://example.com/v1.mp4", `videos[0] should be source_url`);
  assert(p1.image === "img-p1-g1", `image should be gallery[0]`);
});

test("gallery image with no image_key throws", () => {
  expectThrow(() => {
    const source = makeSnapshotSource({
      media: [{
        id: "m-bad",
        profile_id: "p1",
        source_url: "https://example.com/no-key.jpg",
        media_type: "image",
        image_key: undefined,
        role: "gallery",
        position: 0,
      }],
    });
    const baseline = makeBaseline();
    buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });
  }, "missing image_key");
});

test("visible profile with no gallery throws", () => {
  expectThrow(() => {
    const source = makeSnapshotSource({
      media: [], // no media at all
    });
    const baseline = makeBaseline();
    buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });
  }, "no gallery images");
});

// ---------------------------------------------------------------------------
// 6. Attendance and sorting
// ---------------------------------------------------------------------------

console.log("\n=== Attendance & Sorting ===");

test("today profiles have isToday: true and sort first", () => {
  const source = makeSnapshotSource({
    attendance: makeAttendanceRows(["p1", "p2"]),
  });
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });

  const p1 = result.data.profiles.find((p) => p.id === "p1")!;
  const p2 = result.data.profiles.find((p) => p.id === "p2")!;
  const p3 = result.data.profiles.find((p) => p.id === "p3")!;

  assert(p1.isToday === true, "p1 should be today");
  assert(p2.isToday === true, "p2 should be today");
  assert(p3.isToday === false, "p3 should not be today");

  // p1 and p2 should sort before p3
  const p1Idx = result.data.profiles.indexOf(p1);
  const p2Idx = result.data.profiles.indexOf(p2);
  const p3Idx = result.data.profiles.indexOf(p3);
  assert(p1Idx < p3Idx, "today profiles should sort before non-today");
  assert(p2Idx < p3Idx, "today profiles should sort before non-today");
});

test("heroImages selection", () => {
  // Create 6 profiles, 3 today, 3 non-today
  const profiles = makeProfileRows("p1", "p2", "p3", "p4", "p5", "p6");
  const media = profiles.flatMap((p) => makeMediaRows(p.id));
  const attendance = makeAttendanceRows(["p1", "p2", "p3"]);

  const source = makeSnapshotSource({ profiles, media, attendance, translations: [], overrides: [] });
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });

  assert(result.data.heroImages.length === 4, `heroImages should have 4 entries, got ${result.data.heroImages.length}`);
  assert(result.data.heroImages[0] === "img-p1-1", `hero[0] should be p1's image`);
  assert(result.data.heroImages[1] === "img-p2-1", `hero[1] should be p2's image`);
  assert(result.data.heroImages[2] === "img-p3-1", `hero[2] should be p3's image`);
  // 4th should be a non-today profile
  const fourthHero = result.data.heroImages[3]!;
  assert(fourthHero.startsWith("img-p"), `4th hero should be a profile image, got ${fourthHero}`);
});

// ---------------------------------------------------------------------------
// 7. Image map
// ---------------------------------------------------------------------------

console.log("\n=== Image Map ===");

test("snapshot imageMap merges baseline with DB media", () => {
  const baselineImageMap: Record<string, string> = {
    "existing-key": "https://example.com/existing.jpg",
    "line-qr-0": "https://example.com/qr0.png",
  };

  const source = makeSnapshotSource();
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap, generatedAt: "2026-07-27T12:00:00.000Z" });

  assert(result.imageMap["existing-key"] === "https://example.com/existing.jpg", "baseline key lost");
  assert(result.imageMap["img-p1-1"] === "https://example.com/img/p1/g1.jpg", "DB image key missing");
});

// ---------------------------------------------------------------------------
// 8. publishSnapshot upload orchestration
// ---------------------------------------------------------------------------

console.log("\n=== Upload Orchestration ===");

test("immutable snapshot uploads before current.json", async () => {
  const { store, uploads } = fakeStore();
  const source = makeSnapshotSource();
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });

  await publishSnapshot(store, result);

  assert(uploads.length === 2, `expected 2 uploads, got ${uploads.length}`);
  assert(uploads[0]!.path.startsWith("snapshots/"), `first upload should be snapshot, got ${uploads[0]!.path}`);
  assert(uploads[0]!.upsert === false, `snapshot upload should have upsert=false, got ${uploads[0]!.upsert}`);
  assert(uploads[1]!.path === "current.json", `second upload should be current.json, got ${uploads[1]!.path}`);
  assert(uploads[1]!.upsert === true, `current.json upload should have upsert=true, got ${uploads[1]!.upsert}`);
});

test("snapshot upload fails, current.json is NOT uploaded", async () => {
  const { store, uploads } = fakeStore([
    { failOnCall: 0, error: "storage quota exceeded" },
  ]);
  const source = makeSnapshotSource();
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });

  try {
    await publishSnapshot(store, result);
    assert(false, "expected publishSnapshot to throw");
  } catch {
    // expected
  }

  assert(uploads.length === 1, `expected 1 upload (snapshot), got ${uploads.length}`);
  assert(uploads[0]!.path.startsWith("snapshots/"), `upload should be snapshot`);
  // current.json should not have been uploaded
  const currentUpload = uploads.find((u) => u.path === "current.json");
  assert(currentUpload === undefined, "current.json should not be uploaded on snapshot failure");
});

test("current.json upload failure still records the snapshot upload", async () => {
  const { store, uploads } = fakeStore([
    { failOnCall: 1, error: "current.json upload failed" },
  ]);
  const source = makeSnapshotSource();
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });

  try {
    await publishSnapshot(store, result);
    assert(false, "expected publishSnapshot to throw");
  } catch {
    // expected
  }

  assert(uploads.length === 2, `expected 2 uploads (snapshot + failed current), got ${uploads.length}`);
  assert(uploads[0]!.path.startsWith("snapshots/"), `first upload should be snapshot`);
  assert(uploads[1]!.path === "current.json", `second upload should be current.json`);
  // Snapshot should have been uploaded exactly once
  const snapshotUploads = uploads.filter((u) => u.path.startsWith("snapshots/"));
  assert(snapshotUploads.length === 1, "immutable snapshot should have been uploaded exactly once");
});

test("invalid snapshot throws before any upload", async () => {
  const { store, uploads } = fakeStore();
  const invalidSnapshot = {
    schemaVersion: 1,
    version: "test",
    generatedAt: "invalid-date",
    data: makeBaseline(),
    imageMap: {},
    profileTranslations: { "zh-Hant": {}, "zh-Hans": {}, ja: {}, ko: {}, en: {} },
  } as unknown as ContentSnapshotV1;

  try {
    await publishSnapshot(store, invalidSnapshot);
    assert(false, "expected publishSnapshot to throw for invalid snapshot");
  } catch {
    // expected
  }

  assert(uploads.length === 0, "no uploads should happen for invalid snapshot");
});

test("publishSnapshot returns valid manifest", async () => {
  const { store } = fakeStore();
  const source = makeSnapshotSource();
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });

  const manifest = await publishSnapshot(store, result);

  assert(manifest.schemaVersion === 1, `schemaVersion should be 1`);
  assert(manifest.version === result.version, `version mismatch`);
  assert(manifest.snapshotPath === `snapshots/${result.version}.json`, `snapshotPath mismatch`);
  assert(manifest.sha256.length === 64, `sha256 should be 64 hex chars`);
  assert(/^[a-f0-9]{64}$/.test(manifest.sha256), `sha256 not hex: ${manifest.sha256}`);

  // Verify the sha256 matches actual bytes
  const bytes = serializeSnapshot(result);
  const expectedSha = createHash("sha256").update(bytes).digest("hex");
  assert(manifest.sha256 === expectedSha, `sha256 mismatch: ${manifest.sha256} vs ${expectedSha}`);
});

// ---------------------------------------------------------------------------
// 9. Validator guards
// ---------------------------------------------------------------------------

console.log("\n=== Validator Guards ===");

test("assertContentSnapshotV1 passes valid snapshot", () => {
  const source = makeSnapshotSource();
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });
  assertContentSnapshotV1(result);
});

test("serialized and deserialized snapshot still passes validator", () => {
  const source = makeSnapshotSource();
  const baseline = makeBaseline();
  const result = buildContentSnapshot({ source, baseline, baselineImageMap: {}, generatedAt: "2026-07-27T12:00:00.000Z" });
  const bytes = serializeSnapshot(result);
  const json = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(json) as ContentSnapshotV1;
  assertContentSnapshotV1(parsed);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"=".repeat(50)}`);
if (failed > 0) {
  console.error(`Result: ${passed} passed, ${failed} FAILED`);
  process.exit(1);
} else {
  console.log(`Result: ${passed} passed, 0 failed`);
}
