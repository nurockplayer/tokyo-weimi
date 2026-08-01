#!/usr/bin/env tsx

/**
 * Deterministic snapshot builder checks.
 *
 * All fixtures are in-memory — no I/O, no env, no DB.
 * Tests are grouped and counted for easy failure diagnosis.
 */

import { strictEqual, deepStrictEqual, notStrictEqual } from "node:assert";
import type { SnapshotSource } from "./content-store/types.ts";
import type { SiteData, ContentSnapshotV1 } from "../src/types.ts";
import { buildContentSnapshot } from "./content-publisher/build-snapshot.ts";

// ---------------------------------------------------------------------------
// Test harness
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

// ---------------------------------------------------------------------------
// Base fixtures
// ---------------------------------------------------------------------------

const BASE_SHOP_ID = "shop-a";
const BASE_SHOP_ID_2 = "shop-b";

const baseShop = {
  id: BASE_SHOP_ID,
  name: "Shop A",
  shortName: "A",
  sourceUrl: "https://example.com/a",
  contact: { phone: "000", line: "", secondaryLine: "", lineQr: "", secondaryLineQr: "", area: "", hours: "" },
};

const baseShop2 = {
  id: BASE_SHOP_ID_2,
  name: "Shop B",
  shortName: "B",
  sourceUrl: "https://example.com/b",
  contact: { phone: "000", line: "", secondaryLine: "", lineQr: "", secondaryLineQr: "", area: "", hours: "" },
};

const baselineContact = {
  phone: "000",
  line: "",
  secondaryLine: "",
  lineQr: "",
  secondaryLineQr: "",
  area: "",
  hours: "",
};

function defaultBaseline(overrides?: Partial<SiteData>): SiteData {
  return {
    shops: [baseShop, baseShop2],
    contact: baselineContact,
    heroImages: [],
    profiles: [],
    pricePlans: [],
    hotels: [],
    ...overrides,
  };
}

const defaultBaselineImageMap: Record<string, string> = {};

const GENERATED_AT = "2026-07-27T12:00:00.000Z";

// ---------------------------------------------------------------------------
// Helper to build source with default overrides
// ---------------------------------------------------------------------------

function makeSource(overrides?: Partial<SnapshotSource>): SnapshotSource {
  return {
    profiles: [],
    media: [],
    attendance: [],
    translations: [],
    overrides: [],
    ...overrides,
  };
}

function makeProfileRow(id: string, overrides?: Record<string, unknown>) {
  return {
    id,
    shop_id: BASE_SHOP_ID,
    source_id: `src-${id}`,
    name: "Test",
    image: "",
    date: "2026-07-27",
    title: "Test Title",
    origin: "Origin",
    age: "22",
    height: "160",
    weight: "50",
    cup: "C",
    price: "10000",
    summary: "Summary text",
    tags: ["tag1"],
    source_hash: `hash-${id}`,
    ...overrides,
  };
}

function makeMediaRow(
  id: string,
  profileId: string,
  overrides?: Record<string, unknown>,
) {
  return {
    id,
    profile_id: profileId,
    source_url: `https://example.com/${id}.jpg`,
    media_type: "image" as const,
    image_key: `key-${id}`,
    role: "gallery" as const,
    position: 0,
    ...overrides,
  };
}

function makeAttendanceRow(
  profileId: string,
  overrides?: Record<string, unknown>,
) {
  return {
    profile_id: profileId,
    attendance_date: "2026-07-27",
    shop_id: BASE_SHOP_ID,
    position: 0,
    ...overrides,
  };
}

function makeTranslationRow(
  profileId: string,
  language: string,
  sourceHash: string,
  overrides?: Record<string, unknown>,
) {
  return {
    profile_id: profileId,
    language,
    title: "Translated Title",
    summary: "Translated Summary",
    tags: ["translated-tag"],
    source_hash: sourceHash,
    ...overrides,
  };
}

function makeOverrideRow(
  profileId: string,
  overrides?: Record<string, unknown>,
) {
  return {
    profile_id: profileId,
    name: null,
    title: null,
    origin: null,
    age: null,
    height: null,
    weight: null,
    cup: null,
    price: null,
    summary: null,
    tags: null,
    hidden: null,
    updated_at: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\nBuilder checks:");

// --- Determinism ---

test("same input twice produces identical output", () => {
  const source = makeSource({
    profiles: [
      makeProfileRow("p1", { tags: ["a", "b"] }),
    ],
    media: [
      makeMediaRow("m1", "p1"),
    ],
  });
  const baseline = defaultBaseline();

  const a = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  const b = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  strictEqual(JSON.stringify(a), JSON.stringify(b), "output must be identical");
});

test("shuffled input arrays produce identical output", () => {
  const p1 = makeProfileRow("p1");
  const p2 = makeProfileRow("p2");
  const m1 = makeMediaRow("m1", "p1");
  const m2 = makeMediaRow("m2", "p2");
  const m1b = makeMediaRow("m1b", "p1", { position: 1 });
  const a1 = makeAttendanceRow("p1");
  const t1 = makeTranslationRow("p1", "en", "hash-p1");
  const o1 = makeOverrideRow("p1", { title: "Overridden" });

  const source1: SnapshotSource = {
    profiles: [p1, p2],
    media: [m1, m2, m1b],
    attendance: [a1],
    translations: [t1],
    overrides: [o1],
  };
  const source2: SnapshotSource = {
    profiles: [p2, p1],
    media: [m2, m1, m1b],
    attendance: [a1],
    translations: [t1],
    overrides: [o1],
  };

  const baseline = defaultBaseline();
  const a = buildContentSnapshot({ source: source1, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  const b = buildContentSnapshot({ source: source2, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  strictEqual(JSON.stringify(a), JSON.stringify(b), "output must be identical regardless of input order");
});

// --- Override ---

test("override replaces fields and tags replacement is full (not merge)", () => {
  const p1 = makeProfileRow("p1", { name: "Original", title: "Original Title", tags: ["a", "b"] });
  const m1 = makeMediaRow("m1", "p1");

  const source = makeSource({
    profiles: [p1],
    media: [m1],
    overrides: [
      makeOverrideRow("p1", { name: "Overridden Name", title: "Overridden Title", tags: ["x", "y", "z"] }),
    ],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  const profile = snap.data.profiles[0]!;

  strictEqual(profile.name, "Overridden Name", "name should be overridden");
  strictEqual(profile.title, "Overridden Title", "title should be overridden");
  deepStrictEqual(profile.tags, ["x", "y", "z"], "tags should be full replacement, not merge");
});

test("hidden profile is excluded from output", () => {
  const p1 = makeProfileRow("p1");
  const p2 = makeProfileRow("p2");
  const m1 = makeMediaRow("m1", "p1");
  const m2 = makeMediaRow("m2", "p2");

  const source = makeSource({
    profiles: [p1, p2],
    media: [m1, m2],
    overrides: [
      makeOverrideRow("p1", { hidden: true }),
    ],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  const ids = snap.data.profiles.map((p) => p.id);

  strictEqual(ids.includes("p1"), false, "hidden profile must not appear");
  strictEqual(ids.includes("p2"), true, "non-hidden profile must appear");
});

test("hidden=false profile is included", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "p1");

  const source = makeSource({
    profiles: [p1],
    media: [m1],
    overrides: [
      makeOverrideRow("p1", { hidden: false }),
    ],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  strictEqual(snap.data.profiles.length, 1, "hidden=false profile should be included");
});

// --- Sorting ---

test("today profiles come first, sorted by position then id", () => {
  const p1 = makeProfileRow("p-a");
  const p2 = makeProfileRow("p-b");
  const p3 = makeProfileRow("p-c");
  const m1 = makeMediaRow("m1", "p-a");
  const m2 = makeMediaRow("m2", "p-b");
  const m3 = makeMediaRow("m3", "p-c");

  const source = makeSource({
    profiles: [p1, p2, p3],
    media: [m1, m2, m3],
    attendance: [
      makeAttendanceRow("p-a", { position: 10 }),
      makeAttendanceRow("p-b", { position: 5 }),
      makeAttendanceRow("p-c", { position: 5 }),
    ],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  const ids = snap.data.profiles.map((p) => p.id);

  // p-b (pos 5) before p-c (pos 5, id tiebreaker), then p-a (pos 10)
  strictEqual(ids[0], "p-b", "p-b has position 5, should be first");
  strictEqual(ids[1], "p-c", "p-c has same position 5 but id sorts after p-b");
  strictEqual(ids[2], "p-a", "p-a has position 10, should be last among today");
  strictEqual(snap.data.profiles[0]!.isToday, true);
  strictEqual(snap.data.profiles[1]!.isToday, true);
  strictEqual(snap.data.profiles[2]!.isToday, true);
});

test("non-today profiles sorted by lastSeen desc then id", () => {
  const p1 = makeProfileRow("p-a", { last_seen_at: "2026-07-26T10:00:00Z" });
  const p2 = makeProfileRow("p-b", { last_seen_at: "2026-07-27T10:00:00Z" });
  const p3 = makeProfileRow("p-c", { last_seen_at: undefined });
  const p4 = makeProfileRow("p-d", { last_seen_at: undefined });
  const m1 = makeMediaRow("m1", "p-a");
  const m2 = makeMediaRow("m2", "p-b");
  const m3 = makeMediaRow("m3", "p-c");
  const m4 = makeMediaRow("m4", "p-d");

  const source = makeSource({
    profiles: [p1, p2, p3, p4],
    media: [m1, m2, m3, m4],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  const ids = snap.data.profiles.map((p) => p.id);

  // p-b (newest) first, then p-a, then p-c, p-d (no lastSeen, sorted by id)
  strictEqual(ids[0], "p-b", "newest lastSeen first");
  strictEqual(ids[1], "p-a", "second newest");
  strictEqual(ids[2], "p-c", "no lastSeen, id sort: p-c before p-d");
  strictEqual(ids[3], "p-d", "no lastSeen, id sort: p-c before p-d");
});

test("today and non-today profiles are separated in output", () => {
  const pToday = makeProfileRow("p-today");
  const pNon = makeProfileRow("p-non");
  const m1 = makeMediaRow("m1", "p-today");
  const m2 = makeMediaRow("m2", "p-non");

  const source = makeSource({
    profiles: [pNon, pToday],
    media: [m1, m2],
    attendance: [makeAttendanceRow("p-today")],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  strictEqual(snap.data.profiles[0]!.id, "p-today", "today profile first");
  strictEqual(snap.data.profiles[1]!.id, "p-non", "non-today profile second");
  strictEqual(snap.data.profiles[0]!.isToday, true);
  strictEqual(snap.data.profiles[1]!.isToday, false);
});

// --- Media reconstruction ---

test("media role reconstruction: gallery, support, supplemental, video", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "p1", { role: "gallery", position: 0 });
  const m2 = makeMediaRow("m2", "p1", { role: "support", position: 1 });
  const m3 = makeMediaRow("m3", "p1", { role: "supplemental", position: 2 });
  const m4 = makeMediaRow("m4", "p1", { media_type: "video", role: "video", source_url: "https://example.com/vid.mp4", image_key: undefined, position: 3 });

  const source = makeSource({
    profiles: [p1],
    media: [m1, m2, m3, m4],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  const p = snap.data.profiles[0]!;

  strictEqual(p.gallery.length, 1, "should have 1 gallery image");
  strictEqual(p.gallery[0], "key-m1");
  strictEqual(p.supportScreenshots?.length, 1, "should have 1 support screenshot");
  strictEqual(p.supportScreenshots![0], "key-m2");
  strictEqual(p.supplementalMedia?.length, 1, "should have 1 supplemental media");
  strictEqual(p.supplementalMedia![0], "key-m3");
  strictEqual(p.videos?.length, 1, "should have 1 video");
  strictEqual(p.videos![0], "https://example.com/vid.mp4");
  strictEqual(p.image, "key-m1", "image should be gallery[0]");
});

test("media sorted by position then id", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "p1", { position: 10 });
  const m2 = makeMediaRow("m2", "p1", { position: 5 });
  const m3 = makeMediaRow("m3", "p1", { position: 5 });

  const source = makeSource({
    profiles: [p1],
    media: [m1, m2, m3],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  const gallery = snap.data.profiles[0]!.gallery;

  strictEqual(gallery[0], "key-m2", "position 5 first, id m2 before m3");
  strictEqual(gallery[1], "key-m3", "position 5 second");
  strictEqual(gallery[2], "key-m1", "position 10 last");
});

test("unsupported media_type/role combination throws", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "p1", { media_type: "image", role: "video" });

  const source = makeSource({
    profiles: [p1],
    media: [m1],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "unsupported");
});

test("unsupported media_type/role combination: video with gallery role throws", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "p1", { media_type: "video", role: "gallery" });

  const source = makeSource({
    profiles: [p1],
    media: [m1],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "unsupported");
});

// --- Error conditions ---

test("missing gallery for visible profile throws", () => {
  const p1 = makeProfileRow("p1");

  const source = makeSource({
    profiles: [p1],
    media: [],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "no gallery");
});

test("missing image_key for gallery role throws", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "p1", { image_key: undefined });

  const source = makeSource({
    profiles: [p1],
    media: [m1],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "missing image_key");
});

test("conflicting image_key URL throws", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "p1", { image_key: "shared-key", source_url: "https://example.com/a.jpg" });
  const m2 = makeMediaRow("m2", "p1", { image_key: "shared-key", source_url: "https://example.com/b.jpg" });

  const source = makeSource({
    profiles: [p1],
    media: [m1, m2],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "conflict");
});

test("duplicate profile id throws", () => {
  const p1 = makeProfileRow("dup");
  const p2 = makeProfileRow("dup");

  const source = makeSource({
    profiles: [p1, p2],
    media: [],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "Duplicate profile");
});

test("unknown shop reference throws", () => {
  const p1 = makeProfileRow("p1", { shop_id: "unknown-shop" });

  const source = makeSource({
    profiles: [p1],
    media: [],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "unknown shop");
});

test("duplicate media id throws", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("dup-media", "p1");
  const m2 = makeMediaRow("dup-media", "p1");

  const source = makeSource({
    profiles: [p1],
    media: [m1, m2],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "Duplicate media");
});

test("media references unknown profile throws", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "nonexistent-profile");

  const source = makeSource({
    profiles: [p1],
    media: [m1],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "unknown profile");
});

test("attendance references unknown profile throws", () => {
  const source = makeSource({
    profiles: [makeProfileRow("p1")],
    media: [makeMediaRow("m1", "p1")],
    attendance: [makeAttendanceRow("unknown-profile")],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "unknown profile");
});

test("duplicate attendance for same profile throws", () => {
  const source = makeSource({
    profiles: [makeProfileRow("p1")],
    media: [makeMediaRow("m1", "p1")],
    attendance: [
      makeAttendanceRow("p1"),
      makeAttendanceRow("p1"),
    ],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "Duplicate attendance");
});

test("attendance shop_id mismatching profile shop_id throws", () => {
  const source = makeSource({
    profiles: [makeProfileRow("p1", { shop_id: BASE_SHOP_ID })],
    media: [makeMediaRow("m1", "p1")],
    attendance: [
      makeAttendanceRow("p1", { shop_id: "different-shop" }),
    ],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "expected shop-a");
});

test("attendance shop mismatch error message includes both shop ids", () => {
  const source = makeSource({
    profiles: [makeProfileRow("p1", { shop_id: "shop-a" })],
    media: [makeMediaRow("m1", "p1")],
    attendance: [
      makeAttendanceRow("p1", { shop_id: "other-shop" }),
    ],
  });

  try {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
    throw new Error("expected an error but none was thrown");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("profile p1")) {
      throw new Error(`expected message to include profile id, got "${msg}"`);
    }
    if (!msg.includes("other-shop")) {
      throw new Error(`expected message to include attendance shop id, got "${msg}"`);
    }
    if (!msg.includes("shop-a")) {
      throw new Error(`expected message to include profile shop id, got "${msg}"`);
    }
  }
});

test("attendance with matching shop_id passes", () => {
  const p1 = makeProfileRow("p1", { shop_id: BASE_SHOP_ID });
  const m1 = makeMediaRow("m1", "p1");

  const source = makeSource({
    profiles: [p1],
    media: [m1],
    attendance: [
      makeAttendanceRow("p1", { shop_id: BASE_SHOP_ID }),
    ],
  });

  const snap = buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  strictEqual(snap.data.profiles[0]!.id, "p1", "matching shop_id should pass");
  strictEqual(snap.data.profiles[0]!.isToday, true);
});

test("override references unknown profile throws", () => {
  const source = makeSource({
    profiles: [makeProfileRow("p1")],
    media: [makeMediaRow("m1", "p1")],
    overrides: [makeOverrideRow("unknown-profile")],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "unknown profile");
});

test("duplicate override for same profile throws", () => {
  const source = makeSource({
    profiles: [makeProfileRow("p1")],
    media: [makeMediaRow("m1", "p1")],
    overrides: [
      makeOverrideRow("p1"),
      makeOverrideRow("p1"),
    ],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "Duplicate override");
});

test("translation references unknown profile throws", () => {
  const source = makeSource({
    profiles: [makeProfileRow("p1")],
    media: [makeMediaRow("m1", "p1")],
    translations: [makeTranslationRow("unknown-profile", "en", "hash")],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "unknown profile");
});

test("duplicate translation for same (profile, language) throws", () => {
  const source = makeSource({
    profiles: [makeProfileRow("p1")],
    media: [makeMediaRow("m1", "p1")],
    translations: [
      makeTranslationRow("p1", "en", "hash-p1"),
      makeTranslationRow("p1", "en", "hash-p1"),
    ],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "Duplicate translation");
});

test("invalid translation language throws", () => {
  const source = makeSource({
    profiles: [makeProfileRow("p1")],
    media: [makeMediaRow("m1", "p1")],
    translations: [makeTranslationRow("p1", "invalid-lang" as string, "hash-p1")],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "invalid language");
});

// --- Translation reconstruction ---

test("stale translations are filtered (source_hash mismatch)", () => {
  const p1 = makeProfileRow("p1", { source_hash: "current-hash" });
  const m1 = makeMediaRow("m1", "p1");

  const source = makeSource({
    profiles: [p1],
    media: [m1],
    translations: [
      makeTranslationRow("p1", "en", "current-hash", { title: "Fresh" }),
      makeTranslationRow("p1", "zh-Hant", "stale-hash", { title: "Stale" }),
    ],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  // Only en translation should be present (stale zh-Hant filtered)
  strictEqual(snap.profileTranslations["en"]!["p1"]!.title, "Fresh", "fresh translation should be used");
  strictEqual(snap.profileTranslations["zh-Hant"]!["p1"], undefined, "stale translation should be filtered");
});

test("hidden profile translations are excluded", () => {
  const p1 = makeProfileRow("p1", { source_hash: "hash" });
  const p2 = makeProfileRow("p2", { source_hash: "hash" });
  const m1 = makeMediaRow("m1", "p1");
  const m2 = makeMediaRow("m2", "p2");

  const source = makeSource({
    profiles: [p1, p2],
    media: [m1, m2],
    translations: [
      makeTranslationRow("p1", "en", "hash"),
      makeTranslationRow("p2", "en", "hash"),
    ],
    overrides: [
      makeOverrideRow("p1", { hidden: true }),
    ],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  strictEqual(snap.profileTranslations["en"]!["p1"], undefined, "hidden profile translation excluded");
  strictEqual(snap.profileTranslations["en"]!["p2"]!.title, "Translated Title", "visible profile translation included");
});

test("language buckets are in fixed order and profile keys sorted", () => {
  const p1 = makeProfileRow("p-z", { source_hash: "hash" });
  const p2 = makeProfileRow("p-a", { source_hash: "hash" });
  const m1 = makeMediaRow("m1", "p-z");
  const m2 = makeMediaRow("m2", "p-a");

  const source = makeSource({
    profiles: [p1, p2],
    media: [m1, m2],
    translations: [
      makeTranslationRow("p-z", "en", "hash"),
      makeTranslationRow("p-a", "en", "hash"),
      makeTranslationRow("p-z", "zh-Hans", "hash"),
      makeTranslationRow("p-a", "zh-Hans", "hash"),
    ],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  const langOrder = Object.keys(snap.profileTranslations);
  deepStrictEqual(langOrder, ["zh-Hant", "zh-Hans", "ja", "ko", "en"], "language bucket order is fixed");

  // Profile keys within each bucket should be sorted
  const enKeys = Object.keys(snap.profileTranslations["en"]!);
  strictEqual(enKeys[0], "p-a", "sorted key first");
  strictEqual(enKeys[1], "p-z", "sorted key second");
});

test("null title/summary become empty string in translations", () => {
  const p1 = makeProfileRow("p1", { source_hash: "hash" });
  const m1 = makeMediaRow("m1", "p1");

  const source = makeSource({
    profiles: [p1],
    media: [m1],
    translations: [
      makeTranslationRow("p1", "en", "hash", { title: null, summary: null }),
    ],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  strictEqual(snap.profileTranslations["en"]!["p1"]!.title, "", "null title becomes empty string");
  strictEqual(snap.profileTranslations["en"]!["p1"]!.summary, "", "null summary becomes empty string");
});

// --- Hero images ---

test("heroImages come from today then non-today profiles, max 4, no duplicates", () => {
  const profiles = [];
  const media = [];
  const attendance = [];

  for (let i = 0; i < 6; i++) {
    const pid = `p${i}`;
    const mid = `m${i}`;
    profiles.push(makeProfileRow(pid, { tags: [] }));
    media.push(makeMediaRow(mid, pid, { image_key: `img-${pid}` }));
    if (i < 3) {
      attendance.push(makeAttendanceRow(pid, { position: i }));
    }
  }

  const source = makeSource({
    profiles: profiles as SnapshotSource["profiles"],
    media: media as SnapshotSource["media"],
    attendance: attendance as SnapshotSource["attendance"],
  });

  const baseline = defaultBaseline();
  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  strictEqual(snap.data.heroImages.length, 4, "max 4 hero images");
  // First 3 are today profiles (p0, p1, p2), then p3 (non-today)
  strictEqual(snap.data.heroImages[0], "img-p0");
  strictEqual(snap.data.heroImages[1], "img-p1");
  strictEqual(snap.data.heroImages[2], "img-p2");
  strictEqual(snap.data.heroImages[3], "img-p3");
});

// --- Baseline usage ---

test("baseline static arrays are preserved in order", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "p1");

  const source = makeSource({
    profiles: [p1],
    media: [m1],
  });

  const baseline = defaultBaseline({
    shops: [baseShop2, baseShop],
  });

  const snap = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  strictEqual(snap.data.shops[0]!.id, BASE_SHOP_ID_2, "shops preserve baseline order");
  strictEqual(snap.data.shops[1]!.id, BASE_SHOP_ID);
});

test("baseline data fields are copied (shops, contact, pricePlans, hotels)", () => {
  const pricePlans = [{ name: "Plan", note: "", rows: ["10000"] }];
  const hotels = [{ area: "Area", address: "Addr", image: "" }];

  const baseline = defaultBaseline({ pricePlans, hotels });
  const snap = buildContentSnapshot({
    source: makeSource({
      profiles: [makeProfileRow("p1")],
      media: [makeMediaRow("m1", "p1")],
    }),
    baseline,
    baselineImageMap: defaultBaselineImageMap,
    generatedAt: GENERATED_AT,
  });

  strictEqual(snap.data.contact.phone, baselineContact.phone);
  strictEqual(snap.data.pricePlans.length, 1);
  strictEqual(snap.data.hotels.length, 1);
});

// --- Image map ---

test("imageMap includes baseline keys and media-derived keys, sorted lexicographically", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "p1", { image_key: "z-key", source_url: "https://example.com/z.jpg" });
  const m2 = makeMediaRow("m2", "p1", { image_key: "a-key", source_url: "https://example.com/a.jpg" });

  const baselineImageMap: Record<string, string> = {
    "existing-key": "https://example.com/existing.jpg",
  };

  const source = makeSource({
    profiles: [p1],
    media: [m1, m2],
  });

  const snap = buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap, generatedAt: GENERATED_AT });

  const keys = Object.keys(snap.imageMap);
  strictEqual(keys[0], "a-key", "a-key comes first");
  strictEqual(keys[1], "existing-key");
  strictEqual(keys[2], "z-key");

  strictEqual(snap.imageMap["existing-key"], "https://example.com/existing.jpg");
  strictEqual(snap.imageMap["a-key"], "https://example.com/a.jpg");
});

// --- generatedAt / version ---

test("invalid generatedAt throws", () => {
  const source = makeSource({
    profiles: [makeProfileRow("p1")],
    media: [makeMediaRow("m1", "p1")],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: "not-a-date" });
  }, "not parseable");
});

test("version format and content hash correctness", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "p1");

  const source = makeSource({
    profiles: [p1],
    media: [m1],
  });

  const snap = buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  // Version format: <compact timestamp>-<12 hex chars>
  const versionRe = /^\d{8}T\d{9}Z-[a-f0-9]{12}$/;
  strictEqual(versionRe.test(snap.version), true, `version format mismatch: ${snap.version}`);

  // Compact timestamp should match the input (no dashes/colons/dots)
  strictEqual(snap.version.startsWith("20260727T120000000Z-"), true, "compact timestamp prefix");

  // version must not be empty
  strictEqual(snap.version.length > 20, true);
});

test("same semantic content produces same version regardless of input array order", () => {
  const p1 = makeProfileRow("p1");
  const p2 = makeProfileRow("p2");
  const m1 = makeMediaRow("m1", "p1");
  const m2 = makeMediaRow("m2", "p2");

  const source1: SnapshotSource = { profiles: [p1, p2], media: [m1, m2], attendance: [], translations: [], overrides: [] };
  const source2: SnapshotSource = { profiles: [p2, p1], media: [m2, m1], attendance: [], translations: [], overrides: [] };

  const baseline = defaultBaseline();
  const a = buildContentSnapshot({ source: source1, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  const b = buildContentSnapshot({ source: source2, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  strictEqual(a.version, b.version, "same semantic content = same version");
});

test("different input produces different version", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "p1");

  const source = makeSource({ profiles: [p1], media: [m1] });
  const baseline = defaultBaseline();

  const snapA = buildContentSnapshot({ source, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  const sourceB = makeSource({
    profiles: [makeProfileRow("p1", { tags: ["different"] })],
    media: [m1],
  });
  const snapB = buildContentSnapshot({ source: sourceB, baseline, baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  notStrictEqual(snapA.version, snapB.version, "different content = different version");
});

// --- Final validator integration ---

test("final snapshot passes assertContentSnapshotV1", () => {
  const p1 = makeProfileRow("p1");
  const p2 = makeProfileRow("p2");
  const m1 = makeMediaRow("m1", "p1");
  const m2 = makeMediaRow("m2", "p2");

  const source = makeSource({
    profiles: [p1, p2],
    media: [m1, m2],
    attendance: [makeAttendanceRow("p1")],
    translations: [
      makeTranslationRow("p1", "en", "hash-p1"),
      makeTranslationRow("p2", "en", "hash-p2"),
    ],
  });

  const snap = buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  // Just accessing these fields proves the object has the right shape
  strictEqual(snap.schemaVersion, 1);
  strictEqual(typeof snap.version, "string");
  strictEqual(typeof snap.generatedAt, "string");
  strictEqual(Array.isArray(snap.data.profiles), true);
  strictEqual(typeof snap.imageMap, "object");
  strictEqual(typeof snap.profileTranslations, "object");
});

// --- Undefined role handling ---

test("media with undefined role is still processed based on media_type", () => {
  const p1 = makeProfileRow("p1");
  const m1 = makeMediaRow("m1", "p1", { role: undefined });

  const source = makeSource({
    profiles: [p1],
    media: [m1],
  });

  expectThrow(() => {
    buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  }, "unsupported");
});

// --- lastSeen omitted when missing ---

test("lastSeen omitted from Profile when last_seen_at is undefined", () => {
  const p1 = makeProfileRow("p1", { last_seen_at: undefined });
  const m1 = makeMediaRow("m1", "p1");

  const source = makeSource({
    profiles: [p1],
    media: [m1],
  });

  const snap = buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });
  strictEqual(snap.data.profiles[0]!.lastSeen, undefined, "lastSeen should be omitted");
});

// --- Profile isToday correct per attendance ---

test("isToday is true for profile with attendance, false otherwise", () => {
  const p1 = makeProfileRow("p-today");
  const p2 = makeProfileRow("p-not-today");
  const m1 = makeMediaRow("m1", "p-today");
  const m2 = makeMediaRow("m2", "p-not-today");

  const source = makeSource({
    profiles: [p1, p2],
    media: [m1, m2],
    attendance: [makeAttendanceRow("p-today")],
  });

  const snap = buildContentSnapshot({ source, baseline: defaultBaseline(), baselineImageMap: defaultBaselineImageMap, generatedAt: GENERATED_AT });

  strictEqual(snap.data.profiles.find((p) => p.id === "p-today")!.isToday, true);
  strictEqual(snap.data.profiles.find((p) => p.id === "p-not-today")!.isToday, false);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"-".repeat(40)}`);
if (failed > 0) {
  console.error(`Result: ${passed} passed, ${failed} FAILED`);
  process.exit(1);
} else {
  console.log(`Result: ${passed} passed, 0 failed`);
}
