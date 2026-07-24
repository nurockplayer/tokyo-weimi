import { createHash } from "node:crypto";
import type { ContentStore, MediaRow, ProfileRow, TranslationRow, AttendanceRow } from "./content-store/types.ts";
import type { RefreshResult } from "./attendance/types.ts";
import { mapRefreshResultToRows } from "./content-store/mappers.ts";
import { persistRefreshResult } from "./content-store/persist-refresh-result.ts";

// ── In-memory fake ContentStore ──────────────────────────────────────

interface FakeData {
  profiles: ProfileRow[];
  media: MediaRow[];
  attendance: AttendanceRow[];
  translations: TranslationRow[];
}

interface CallRecord {
  method: string;
  args: unknown[];
}

class FakeContentStore implements ContentStore {
  readonly data: FakeData = { profiles: [], media: [], attendance: [], translations: [] };
  readonly calls: CallRecord[] = [];
  failOnMethod?: string;
  failMessage?: string;

  #record<T>(method: string, args: unknown[], fn: () => Promise<T>): Promise<T> {
    this.calls.push({ method, args });
    if (this.failOnMethod === method) {
      throw new Error(this.failMessage ?? `${method} simulated failure`);
    }
    return fn();
  }

  async startRun(): Promise<string> {
    return this.#record("startRun", [], async () => "fake-run-id");
  }
  async completeRun(): Promise<void> {
    return this.#record("completeRun", [], async () => {});
  }
  async failRun(): Promise<void> {
    return this.#record("failRun", [], async () => {});
  }

  async upsertProfiles(rows: ProfileRow[]): Promise<void> {
    return this.#record("upsertProfiles", [{ count: rows.length }], async () => {
      this.data.profiles.push(...rows);
    });
  }
  async replaceProfileMedia(profileId: string, rows: MediaRow[]): Promise<void> {
    return this.#record("replaceProfileMedia", [profileId, { count: rows.length }], async () => {
      this.data.media = this.data.media.filter((r) => r.profile_id !== profileId);
      this.data.media.push(...rows);
    });
  }
  async replaceAttendance(date: string, rows: AttendanceRow[]): Promise<void> {
    return this.#record("replaceAttendance", [date, { count: rows.length }], async () => {
      this.data.attendance = this.data.attendance.filter((r) => r.attendance_date !== date);
      this.data.attendance.push(...rows);
    });
  }
  async upsertTranslations(rows: TranslationRow[]): Promise<void> {
    return this.#record("upsertTranslations", [{ count: rows.length }], async () => {
      this.data.translations.push(...rows);
    });
  }

  async loadOverrides(): Promise<never[]> {
    return [];
  }
  async uploadObject(): Promise<void> {
    return this.#record("uploadObject", [], async () => {});
  }
}

// ── Test helpers ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.log(`  ✗ ${label}`); }
}

function checkEqual<T>(label: string, actual: T, expected: T): void {
  const a = typeof actual === "object" ? JSON.stringify(actual) : String(actual);
  const e = typeof expected === "object" ? JSON.stringify(expected) : String(expected);
  if (a === e) { passed += 1; console.log(`  ✓ ${label}`); }
  else {
    failed += 1;
    console.log(`  ✗ ${label}`);
    console.log(`    expected: ${e}`);
    console.log(`    actual:   ${a}`);
  }
}

function sortJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, val) =>
    Array.isArray(val) ? [...val].sort((a, b) => {
      const sa = JSON.stringify(a);
      const sb = JSON.stringify(b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }) : val,
  )) as T;
}

// ── Build test RefreshResult ─────────────────────────────────────────

function buildTestResult(): RefreshResult {
  return {
    profiles: [
      {
        id: "yuna", shopId: "tokyo-weimi", name: "柚菜",
        title: "日本人・推薦女孩", date: "2026-07-24",
        image: "img-profile-1",
        gallery: ["img-profile-1", "img-gallery-2"],
        supportScreenshots: ["img-support-1"],
        videos: ["https://example.com/video1.mp4"],
        origin: "東京", age: "22", height: "160", weight: "50", cup: "C-cup",
        tags: ["日本人", "推薦"], price: "60 分鐘 20,000",
        summary: "可愛活潑的女孩",
        isToday: true, lastSeen: "2026-07-24",
      },
      {
        id: "noa", shopId: "hikari888", name: "乃亞",
        title: "中國・人氣女孩", date: "2026-07-23",
        image: "img-noa-main",
        gallery: ["img-noa-main"],
        origin: "中國", age: "20", height: "165", weight: "48", cup: "D-cup",
        tags: ["中國", "推薦"], price: "60 分鐘 18,000",
        summary: "性感迷人",
        isToday: false, lastSeen: "2026-07-23",
      },
    ],
    siteData: {
      shops: [], contact: { phone: "", line: "", secondaryLine: "", lineQr: "", secondaryLineQr: "", area: "", hours: "" },
      heroImages: [], pricePlans: [], hotels: [],
      profiles: [
        {
          id: "yuna", shopId: "tokyo-weimi", name: "柚菜",
          title: "日本人・推薦女孩", date: "2026-07-24",
          image: "img-profile-1",
          gallery: ["img-profile-1", "img-gallery-2"],
          supportScreenshots: ["img-support-1"],
          videos: ["https://example.com/video1.mp4"],
          origin: "東京", age: "22", height: "160", weight: "50", cup: "C-cup",
          tags: ["日本人", "推薦"], price: "60 分鐘 20,000",
          summary: "可愛活潑的女孩",
          isToday: true, lastSeen: "2026-07-24",
        },
        {
          id: "noa", shopId: "hikari888", name: "乃亞",
          title: "中國・人氣女孩", date: "2026-07-23",
          image: "img-noa-main",
          gallery: ["img-noa-main"],
          origin: "中國", age: "20", height: "165", weight: "48", cup: "D-cup",
          tags: ["中國", "推薦"], price: "60 分鐘 18,000",
          summary: "性感迷人",
          isToday: false, lastSeen: "2026-07-23",
        },
      ],
    },
    imageMap: {
      "img-profile-1": "https://example.com/uploads/2026/07/profile-1.jpg",
      "img-gallery-2": "https://example.com/uploads/2026/07/gallery-2.jpg",
      "img-support-1": "https://example.com/uploads/2026/07/support-1.jpg",
      "img-noa-main": "https://example.com/uploads/2026/07/noa-main.jpg",
    },
    profileTranslations: {
      "zh-Hant": {},
      "zh-Hans": { "yuna": { title: "日本人・推荐女孩", tags: ["日本人", "推荐"], summary: "可爱活泼的女孩" } },
      ja: {}, ko: {}, en: {},
    },
    localImageMap: {},
    jstDate: "2026-07-24",
  };
}

// ── Check 1: Deterministic mapping ───────────────────────────────────

function checkDeterministicMapping(): void {
  console.log("[Deterministic mapping]");
  const result = buildTestResult();
  const r1 = mapRefreshResultToRows(result);
  const r2 = mapRefreshResultToRows(result);

  check("same profile count", r1.profiles.length === r2.profiles.length);
  check("same attendance count", r1.attendance.length === r2.attendance.length);
  check("same translation count", r1.translations.length === r2.translations.length);
  checkEqual("profiles identical", sortJson(r1.profiles), sortJson(r2.profiles));
  checkEqual("attendance identical", sortJson(r1.attendance), sortJson(r2.attendance));
  checkEqual("translations identical", sortJson(r1.translations), sortJson(r2.translations));

  const flat1 = [...r1.mediaByProfile.values()].flat();
  const flat2 = [...r2.mediaByProfile.values()].flat();
  checkEqual("media identical", sortJson(flat1), sortJson(flat2));
  check("source_hash consistent", r1.profiles[0]!.source_hash === r2.profiles[0]!.source_hash);
  check("media_id consistent", flat1[0]!.id === flat2[0]!.id);
}

// ── Check 2: Attendance only for today profiles ──────────────────────

function checkAttendanceFilter(): void {
  console.log("\n[Attendance filter]");
  const { attendance } = mapRefreshResultToRows(buildTestResult());
  check("only today profiles", attendance.length === 1);
  checkEqual("attendance profile", attendance[0]!.profile_id, "yuna");
  checkEqual("attendance date", attendance[0]!.attendance_date, "2026-07-24");
  checkEqual("position = 0", attendance[0]!.position, 0);
}

// ── Check 3: Media roles & positions ─────────────────────────────────

function checkMediaRoles(): void {
  console.log("\n[Media roles & positions]");
  const { mediaByProfile } = mapRefreshResultToRows(buildTestResult());
  const rows = mediaByProfile.get("yuna")!;

  const gallery = rows.filter((r) => r.role === "gallery");
  const supports = rows.filter((r) => r.role === "support");
  const videos = rows.filter((r) => r.role === "video");

  checkEqual("gallery count", gallery.length, 2);
  checkEqual("support count", supports.length, 1);
  checkEqual("video count", videos.length, 1);
  checkEqual("gallery[0].position", gallery[0]!.position, 0);
  checkEqual("gallery[1].position", gallery[1]!.position, 1);
  checkEqual("support[0].position", supports[0]!.position, 0);
  checkEqual("videos[0].position", videos[0]!.position, 0);
  checkEqual("gallery media_type", gallery[0]!.media_type, "image");
  checkEqual("video media_type", videos[0]!.media_type, "video");
}

// ── Check 4: Missing imageMap URL throws ────────────────────────────

function checkMissingImageUrl(): void {
  console.log("\n[Missing imageMap URL]");
  const result = buildTestResult();
  delete result.imageMap["img-gallery-2"];
  try {
    mapRefreshResultToRows(result);
    check("throws error", false);
  } catch (err) {
    check("throws error", true);
    checkEqual("mentions missing ID", (err as Error).message.includes("img-gallery-2"), true);
  }
}

// ── Check 5: Persistence call order & no lifecycle calls ─────────────

async function checkPersistenceOrder(): Promise<void> {
  console.log("\n[Persistence call order]");
  const store = new FakeContentStore();
  await persistRefreshResult(store, buildTestResult());

  const methods = store.calls.map((c) => c.method);
  const profIdx = methods.indexOf("upsertProfiles");
  const mediaIdxs = methods.map((m, i) => (m === "replaceProfileMedia" ? i : -1)).filter((i) => i >= 0);
  const attIdx = methods.indexOf("replaceAttendance");
  const transIdx = methods.indexOf("upsertTranslations");

  check("upsertProfiles called", profIdx >= 0);
  check("replaceProfileMedia ×2", mediaIdxs.length === 2);
  check("replaceAttendance called", attIdx >= 0);
  check("upsertTranslations called", transIdx >= 0);
  check("profiles before media", profIdx < mediaIdxs[0]!);
  check("media before attendance", mediaIdxs.every((i) => i < attIdx));
  check("attendance before translations", attIdx < transIdx);

  const lifecycleCalls = methods.filter((m) => ["startRun", "completeRun", "failRun"].includes(m));
  checkEqual("no run lifecycle calls", lifecycleCalls.length, 0);
}

// ── Check 6: Intermediate failure rethrows ───────────────────────────

async function checkFailureRethrow(): Promise<void> {
  console.log("\n[Failure rethrow]");
  const store = new FakeContentStore();
  store.failOnMethod = "upsertProfiles";

  try {
    await persistRefreshResult(store, buildTestResult());
    check("rethrows error", false);
  } catch (err) {
    check("rethrows error", true);
  }
}

// ── Check 7: source_hash determinism (standalone) ────────────────────

function checkHashDeterminism(): void {
  console.log("\n[Source hash determinism]");
  const result = buildTestResult();
  const { profiles } = mapRefreshResultToRows(result);
  for (const p of profiles) {
    check(`valid hex hash for ${p.id}`, /^[a-f0-9]{64}$/.test(p.source_hash));
  }
}

// ── Check 8: Empty today set produces no attendance ──────────────────

function checkNoTodayProfiles(): void {
  console.log("\n[No today profiles → empty attendance]");
  const result = buildTestResult();
  // Make both profiles non-today
  result.siteData.profiles = result.siteData.profiles.map((p) => ({ ...p, isToday: false }));
  const { attendance } = mapRefreshResultToRows(result);
  checkEqual("no attendance rows", attendance.length, 0);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== content:check-persist ===\n");
  checkDeterministicMapping();
  checkAttendanceFilter();
  checkMediaRoles();
  checkMissingImageUrl();
  checkHashDeterminism();
  checkNoTodayProfiles();
  await checkPersistenceOrder();
  await checkFailureRethrow();

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
