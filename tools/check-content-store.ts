#!/usr/bin/env tsx
/**
 * Offline checks for ContentStore adapter.
 * Uses a fake client — no network access required.
 */

import { readContentStoreConfig } from "./content-store/supabase-client.ts";
import { SupabaseContentStore } from "./content-store/content-store.ts";
import type { SupabaseClientLike, SupabaseQueryResponse, SelectOpts } from "./content-store/types.ts";

// ─── Fake client builder ───────────────────────────────────────

interface CallLogEntry {
  table: string;
  method: string;
  args: unknown[];
}

interface FakeSelectResult {
  /** All rows the fake will return (pre-filtered). The fake applies
   *  inFilter, order, gt, rangeFrom/rangeTo locally. */
  allRows: unknown[];
}

function fakeClient(
  log: CallLogEntry[],
  initialSelectResult?: FakeSelectResult,
): SupabaseClientLike {
  let selectResult = initialSelectResult;

  function applySelectOpts(
    rows: unknown[],
    opts?: SelectOpts,
  ): unknown[] {
    let filtered = rows;

    // inFilter
    if (opts?.inFilter) {
      const col = opts.inFilter.column as keyof unknown;
      const vals = new Set(opts.inFilter.values);
      filtered = filtered.filter((r) => vals.has((r as Record<string, unknown>)[col]));
    }

    // gt (keyset cursor)
    if (opts?.gt !== undefined) {
      const col = opts.order ?? "profile_id";
      filtered = filtered.filter((r) => ((r as Record<string, string>)[col] ?? "") > opts.gt!);
    }

    // order (ascending, string compare)
    if (opts?.order) {
      const col = opts.order;
      filtered = [...filtered].sort((a, b) => {
        const av = (a as Record<string, string>)[col] ?? "";
        const bv = (b as Record<string, string>)[col] ?? "";
        return av < bv ? -1 : av > bv ? 1 : 0;
      });
    }

    // limit
    if (opts?.limit !== undefined) {
      filtered = filtered.slice(0, opts.limit);
    }

    // range
    if (opts?.rangeFrom !== undefined && opts?.rangeTo !== undefined) {
      filtered = filtered.slice(opts.rangeFrom, opts.rangeTo + 1);
    }

    return filtered;
  }

  function ok(data: unknown = null): SupabaseQueryResponse {
    return { data, error: null };
  }

  return {
    from(table: string) {
      return {
        insert(rows: unknown[], _opts?: unknown) {
          log.push({ table, method: "insert", args: [rows, _opts] });
          return { select: async () => ok(rows) };
        },
        upsert(rows: unknown[], _opts?: unknown) {
          log.push({ table, method: "upsert", args: [rows, _opts] });
          return { select: async () => ok(rows) };
        },
        delete() {
          log.push({ table, method: "delete", args: [] });
          return {
            eq(column: string, value: unknown) {
              log.push({ table, method: "delete.eq", args: [column, value] });
              return Promise.resolve(ok());
            },
            in(column: string, values: unknown[]) {
              log.push({ table, method: "delete.in", args: [column, values] });
              return Promise.resolve(ok());
            },
          };
        },
        select(columns?: string, opts?: SelectOpts) {
          log.push({ table, method: "select", args: [columns, opts] });
          if (selectResult && selectResult.allRows) {
            return Promise.resolve(ok(applySelectOpts(selectResult.allRows, opts)));
          }
          return Promise.resolve(ok(null));
        },
        update(values: Record<string, unknown>) {
          log.push({ table, method: "update", args: [values] });
          return {
            eq(column: string, value: unknown) {
              log.push({ table, method: "update.eq", args: [column, value] });
              return Promise.resolve(ok());
            },
          };
        },
      };
    },
    storage: {
      from(_bucket: string) {
        return {
          upload(_path: string, _data: Uint8Array, _opts?: unknown) {
            log.push({ table: "storage.objects", method: "upload", args: [_path, _opts] });
            return Promise.resolve(ok());
          },
        };
      },
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
    failed++;
  }
}

// ─── Tests ─────────────────────────────────────────────────────

console.log("ContentStore check\n");

// --- 1. Missing env error ---

{
  console.log("1. Missing env error — no secret leak");

  try {
    readContentStoreConfig({});
    assert("throws when both URL and key are missing", false, "no error thrown");
  } catch (err) {
    const msg = String(err);
    const hasMissing = msg.includes("SUPABASE_URL") && msg.includes("SUPABASE_SERVICE_ROLE_KEY");
    assert("lists both missing variable names", hasMissing, msg);
    assert("does not contain 'secret' or 'key' value leak", !msg.toLowerCase().includes("secret"), msg);
  }

  try {
    readContentStoreConfig({ SUPABASE_URL: "https://example.supabase.co" });
    assert("throws when key is missing", false, "no error thrown");
  } catch (err) {
    const msg = String(err);
    assert("lists SERVICE_ROLE_KEY as missing", msg.includes("SUPABASE_SERVICE_ROLE_KEY"), msg);
  }

  try {
    readContentStoreConfig({ SUPABASE_SERVICE_ROLE_KEY: "some-key" });
    assert("throws when URL is missing", false, "no error thrown");
  } catch (err) {
    const msg = String(err);
    assert("lists URL as missing", msg.includes("SUPABASE_URL"), msg);
  }

  try {
    const cfg = readContentStoreConfig({
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "key-123",
    });
    assert("returns config when all required vars present", cfg.supabaseUrl === "https://x.supabase.co", "got config");
  } catch {
    assert("returns config when all required vars present", false, "unexpected error");
  }

  const cfgWithBucket = readContentStoreConfig({
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "key-123",
    CONTENT_BUCKET: "my-bucket",
  });
  assert("uses CONTENT_BUCKET env var when set", cfgWithBucket.bucket === "my-bucket");

  const cfgDefaultBucket = readContentStoreConfig({
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "key-123",
  });
  assert("defaults bucket to 'site-content'", cfgDefaultBucket.bucket === "site-content");
}

// --- 2. replaceAttendance delete filter ---
{
  console.log("\n2. replaceAttendance — delete filter scoped to date");

  // Need to seed profiles so shop validation passes
  const profiles = [
    { id: "p1", shop_id: "shop1" },
  ];

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log, { allRows: profiles }));

  await store.replaceAttendance("2026-07-18", [
    { profile_id: "p1", attendance_date: "2026-07-18", shop_id: "shop1", position: 0 },
  ]);

  const delEq = log.filter((e) => e.method === "delete.eq");
  assert("calls delete().eq('attendance_date', '2026-07-18')", delEq.length >= 1, JSON.stringify(delEq));

  const target = delEq[0]!;
  assert(
    "delete filter column is attendance_date",
    target.args[0] === "attendance_date",
    `got: ${target.args[0]}`,
  );
  assert(
    "delete filter value is the exact date",
    target.args[1] === "2026-07-18",
    `got: ${target.args[1]}`,
  );
}

// --- 3. Empty media rows still delete ---
{
  console.log("\n3. replaceProfileMedia — empty rows still delete");

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log));

  await store.replaceProfileMedia("pid-1", []);

  const delEq = log.filter((e) => e.method === "delete.eq");
  assert("still calls delete().eq('profile_id', 'pid-1')", delEq.length >= 1, JSON.stringify(delEq));

  const inserts = log.filter((e) => e.method === "insert");
  assert("does not insert any media rows", inserts.length === 0, `inserts: ${inserts.length}`);
}

// --- 4. Supabase error contains operation name ---
{
  console.log("\n4. Error wrapping — operation name in message");

  const errClient: SupabaseClientLike = {
    from() {
      return {
        insert() {
          return { select: async () => ({ data: null, error: { message: "violates unique constraint" } }) };
        },
        upsert() {
          return { select: async () => ({ data: null, error: { message: "deadlock detected" } }) };
        },
        delete() {
          return {
            eq() {
              return Promise.resolve({ data: null, error: { message: "permission denied" } });
            },
            in() {
              return Promise.resolve({ data: null, error: { message: "permission denied" } });
            },
          };
        },
        select() {
          return Promise.resolve({ data: null, error: { message: "relation does not exist" } });
        },
        update() {
          return {
            eq() {
              return Promise.resolve({ data: null, error: { message: "row not found" } });
            },
          };
        },
      };
    },
    storage: {
      from() {
        return {
          upload() {
            return Promise.resolve({ data: null, error: { message: "bucket not found" } });
          },
        };
      },
    },
  };
  const store = new SupabaseContentStore(errClient);

  const ops = [
    { label: "startRun", fn: () => store.startRun({}) },
    { label: "completeRun", fn: () => store.completeRun("r1", {}) },
    { label: "failRun", fn: () => store.failRun("r1", new Error("boom")) },
    { label: "upsertProfiles", fn: () => store.upsertProfiles([{ id: "p1", shop_id: "s1", source_id: "src1", name: "n", image: "i.jpg", date: "2026-07-23", title: "t", origin: "o", age: "20", height: "160", weight: "50", cup: "C", price: "10000", summary: "s", tags: [], source_hash: "h" }]) },
    { label: "replaceProfileMedia", fn: () => store.replaceProfileMedia("p1", [{ id: "m1", profile_id: "p1", source_url: "https://example.com/img.jpg", media_type: "image" }]) },
    { label: "replaceAttendance", fn: () => {
      // Separate client with enough data to pass shop validation but fail on delete
      const sepLog: CallLogEntry[] = [];
      const sepErrClient: SupabaseClientLike = {
        from() {
          return {
            insert() {
              return { select: async () => ({ data: null, error: { message: "violates unique constraint" } }) };
            },
            upsert() {
              return { select: async () => ({ data: null, error: { message: "deadlock detected" } }) };
            },
            delete() {
              return {
                eq() {
                  return Promise.resolve({ data: null, error: { message: "permission denied" } });
                },
                in() {
                  return Promise.resolve({ data: null, error: { message: "permission denied" } });
                },
              };
            },
            select() {
              return Promise.resolve({ data: null, error: null });
            },
            update() {
              return {
                eq() {
                  return Promise.resolve({ data: null, error: { message: "row not found" } });
                },
              };
            },
          };
        },
        storage: {
          from() {
            return {
              upload() {
                return Promise.resolve({ data: null, error: { message: "bucket not found" } });
              },
            };
          },
        },
      };
      const s = new SupabaseContentStore(sepErrClient);
      // shop validation passes (select returns null error), but then profile insert fails
      return s.replaceAttendance("2026-07-18", [{ profile_id: "p1", attendance_date: "2026-07-18", shop_id: "s1" }]);
    } },
    { label: "upsertTranslations", fn: () => store.upsertTranslations([{ profile_id: "p1", language: "en", tags: [], source_hash: "h" }]) },
    { label: "loadOverrides", fn: () => store.loadOverrides() },
    { label: "uploadObject", fn: () => store.uploadObject("path", new Uint8Array(), "image/png", false) },
  ];

  for (const op of ops) {
    try {
      await op.fn();
      assert(`${op.label}: operation name in error`, false, "no error thrown");
    } catch (err) {
      const msg = String(err);
      assert(`${op.label}: wraps with 'ContentStore.${op.label}'`, msg.includes(`ContentStore.${op.label}`), msg);
    }
  }
}

// --- 5. Chunking — 450 rows split into batches ---
{
  console.log("\n5. Chunking — 450 rows split into multiple batches");

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log));

  const rows: import("./content-store/types.ts").ProfileRow[] = [];
  for (let i = 0; i < 450; i++) {
    rows.push({
      id: `p${i}`,
      shop_id: "shop1",
      source_id: `src${i}`,
      name: `name${i}`,
      image: `img${i}.jpg`,
      date: "2026-07-23",
      title: `title${i}`,
      origin: "origin",
      age: "20",
      height: "160",
      weight: "50",
      cup: "C",
      price: "10000",
      summary: "summary",
      tags: [],
      source_hash: `hash${i}`,
    });
  }

  await store.upsertProfiles(rows);

  const upsertCalls = log.filter((e) => e.method === "upsert");
  assert(`upsert called ${upsertCalls.length} times for 450 rows`, upsertCalls.length === 3, JSON.stringify(upsertCalls.map((c) => (c.args[0] as unknown[]).length)));

  const firstBatch = upsertCalls[0]!.args[0] as unknown[];
  const lastBatch = upsertCalls[2]!.args[0] as unknown[];
  assert("first batch has 200 rows", firstBatch.length === 200, `got ${firstBatch.length}`);
  assert("last batch has 50 rows", lastBatch.length === 50, `got ${lastBatch.length}`);
}

// --- 6. Scope validation — replaceProfileMedia rejects mismatched rows ---
{
  console.log("\n6. replaceProfileMedia — rejects mismatched profile_id");

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log));

  try {
    await store.replaceProfileMedia("pid-1", [
      { id: "m1", profile_id: "pid-2", source_url: "https://example.com/img.jpg", media_type: "image" },
    ]);
    assert("throws when profile_id does not match parameter", false, "no error thrown");
  } catch (err) {
    const msg = String(err);
    assert("error message mentions mismatched profile_id", msg.includes("profile_id"), msg);
    assert("error still contains operation name", msg.includes("ContentStore.replaceProfileMedia"), msg);
  }

  const anyClientCall = log.filter((e) => e.method !== "select");
  assert("no client calls made (no delete/insert) for mismatch", anyClientCall.length === 0, JSON.stringify(log));
}

// --- 7. Scope validation — replaceAttendance rejects mismatched dates ---
{
  console.log("\n7. replaceAttendance — rejects mismatched attendance_date");

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log));

  try {
    await store.replaceAttendance("2026-07-18", [
      { profile_id: "p1", attendance_date: "2026-07-19", shop_id: "s1" },
    ]);
    assert("throws when attendance_date does not match parameter", false, "no error thrown");
  } catch (err) {
    const msg = String(err);
    assert("error message mentions mismatched attendance_date", msg.includes("attendance_date"), msg);
    assert("error still contains operation name", msg.includes("ContentStore.replaceAttendance"), msg);
  }

  const anyClientCall = log.filter((e) => e.method !== "select");
  assert("no client calls made (no delete/insert) for mismatch", anyClientCall.length === 0, JSON.stringify(log));
}

// --- 8. Valid rows still work ---
{
  console.log("\n8. Valid rows still work");

  const log: CallLogEntry[] = [];

  {
    const store = new SupabaseContentStore(fakeClient(log));
    await store.replaceProfileMedia("pid-1", [
      { id: "m1", profile_id: "pid-1", source_url: "https://example.com/img.jpg", media_type: "image" },
      { id: "m2", profile_id: "pid-1", source_url: "https://example.com/img2.jpg", media_type: "image" },
    ]);
    const deletes = log.filter((e) => e.method === "delete.eq");
    const inserts = log.filter((e) => e.method === "insert");
    assert("valid media rows: delete called", deletes.length === 1, JSON.stringify(deletes));
    assert("valid media rows: insert called", inserts.length >= 1, JSON.stringify(inserts));
  }
}

// --- 9. Empty rows still delete after scope validation (media) ---
{
  console.log("\n9. Empty media rows still delete");

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log));
  await store.replaceProfileMedia("pid-1", []);
  const deletes = log.filter((e) => e.method === "delete.eq");
  const inserts = log.filter((e) => e.method === "insert");
  assert("empty media rows: delete still called", deletes.length >= 1, JSON.stringify(deletes));
  assert("empty media rows: no insert", inserts.length === 0, JSON.stringify(inserts));
}

// --- 10. Defaults materialized on heterogeneous media rows ---
{
  console.log("\n10. Defaults materialized on heterogeneous media rows");

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log));

  await store.replaceProfileMedia("pid-1", [
    { id: "m1", profile_id: "pid-1", source_url: "https://example.com/img.jpg", media_type: "image" },
    { id: "m2", profile_id: "pid-1", source_url: "https://example.com/img2.jpg", media_type: "image", role: "support", position: 3 },
  ]);

  const insertCalls = log.filter((e) => e.method === "insert");
  assert("media insert was called", insertCalls.length >= 1, JSON.stringify(insertCalls));

  const insertedRows = insertCalls[0]!.args[0] as Record<string, unknown>[];
  assert("first row has default role='gallery'", insertedRows[0]?.role === "gallery", JSON.stringify(insertedRows[0]));
  assert("first row has default position=0", insertedRows[0]?.position === 0, JSON.stringify(insertedRows[0]));
  assert("second row preserves explicit role='support'", insertedRows[1]?.role === "support", JSON.stringify(insertedRows[1]));
  assert("second row preserves explicit position=3", insertedRows[1]?.position === 3, JSON.stringify(insertedRows[1]));
}

// --- 11. Defaults materialized on attendance insert ---
{
  console.log("\n11. Defaults materialized on attendance rows");

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log, { allRows: [
    { id: "p1", shop_id: "s1" },
    { id: "p2", shop_id: "s1" },
  ] }));

  await store.replaceAttendance("2026-07-18", [
    { profile_id: "p1", attendance_date: "2026-07-18", shop_id: "s1" },
    { profile_id: "p2", attendance_date: "2026-07-18", shop_id: "s1", position: 5 },
  ]);

  const insertCalls = log.filter((e) => e.method === "insert");
  const insertedRows = insertCalls[0]!.args[0] as Record<string, unknown>[];

  assert("first row has default position=0", insertedRows[0]?.position === 0, JSON.stringify(insertedRows[0]));
  assert("second row preserves explicit position=5", insertedRows[1]?.position === 5, JSON.stringify(insertedRows[1]));
}

// --- 12. updated_at advanced on profile and translation upsert ---
{
  console.log("\n12. updated_at advanced on profile / translation upsert");

  {
    const log: CallLogEntry[] = [];
    const store = new SupabaseContentStore(fakeClient(log));

    await store.upsertProfiles([{
      id: "p1", shop_id: "s1", source_id: "src1",
      name: "n", image: "i.jpg", date: "2026-07-23",
      title: "t", origin: "o", age: "20", height: "160",
      weight: "50", cup: "C", price: "10000",
      summary: "s", tags: [], source_hash: "h",
    }]);

    const upsertRows = (log.find((e) => e.method === "upsert")?.args[0] as Record<string, unknown>[]);
    assert("upsertProfiles rows include updated_at", upsertRows?.[0]?.updated_at != null, JSON.stringify(upsertRows?.[0]));
  }

  {
    const log: CallLogEntry[] = [];
    const store = new SupabaseContentStore(fakeClient(log));

    await store.upsertTranslations([{
      profile_id: "p1", language: "en", tags: [], source_hash: "h",
    }]);

    const upsertRows = (log.find((e) => e.method === "upsert")?.args[0] as Record<string, unknown>[]);
    assert("upsertTranslations rows include updated_at", upsertRows?.[0]?.updated_at != null, JSON.stringify(upsertRows?.[0]));
  }
}

// --- 13. Override keyset pagination ---
{
  console.log("\n13. loadOverrides — keyset pagination");

  // Build rows with ordered profile_ids
  const allRows = Array.from({ length: 2501 }, (_, i) => ({
    profile_id: `p${String(i).padStart(4, "0")}`,
    updated_at: new Date().toISOString(),
    name: `name${i}`,
  }));

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log, { allRows }));

  const result = await store.loadOverrides();

  const selectCalls = log.filter((e) => e.method === "select");
  assert("loadOverrides makes multiple selects for 2501 rows", selectCalls.length >= 3, `got ${selectCalls.length}`);
  assert("loadOverrides returns all 2501 rows", result.length === 2501, `got ${result.length}`);

  // Verify ordering params
  const firstCall = selectCalls[0]!;
  assert("first select sends order=profile_id", (firstCall.args[1] as SelectOpts)?.order === "profile_id", JSON.stringify(firstCall.args[1]));
  assert("first select sends limit=1000", (firstCall.args[1] as SelectOpts)?.limit === 1000, JSON.stringify(firstCall.args[1]));
  assert("first select has no gt cursor", (firstCall.args[1] as SelectOpts)?.gt === undefined, JSON.stringify(firstCall.args[1]));

  if (selectCalls.length >= 2) {
    const secondCall = selectCalls[1]!;
    assert("second select has gt cursor", (secondCall.args[1] as SelectOpts)?.gt != null, JSON.stringify(secondCall.args[1]));
  }

  // Verify no duplicates or gaps
  const ids = new Set(result.map((r) => r.profile_id));
  assert("no duplicate profile_ids in result", ids.size === result.length, `got ${result.length} ids but set size ${ids.size}`);
  assert("profile_id order is ascending", result.every((r, i) => i === 0 || r.profile_id > result[i - 1]!.profile_id), "not sorted");
}

// --- 14. startRun — insert.select() ---
{
  console.log("\n14. startRun — insert.select()");

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log));

  await store.startRun({ sourceDate: "2026-07-24" });

  const inserts = log.filter((e) => e.method === "insert");
  assert("startRun called insert", inserts.length >= 1, JSON.stringify(inserts));
  assert("startRun completed without throwing", true, "");
}

// --- 15. Heterogeneous profile timestamps ---
{
  console.log("\n15. Heterogeneous profile timestamps");

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log));

  // One row with first_seen_at, one without
  await store.upsertProfiles([
    {
      id: "p1", shop_id: "s1", source_id: "src1",
      name: "n", image: "i.jpg", date: "2026-07-23",
      title: "t", origin: "o", age: "20", height: "160",
      weight: "50", cup: "C", price: "10000",
      summary: "s", tags: [], source_hash: "h",
      first_seen_at: "2026-01-01T00:00:00Z",
      last_seen_at: "2026-07-23T00:00:00Z",
    },
    {
      id: "p2", shop_id: "s1", source_id: "src2",
      name: "n2", image: "i2.jpg", date: "2026-07-23",
      title: "t2", origin: "o2", age: "22", height: "165",
      weight: "52", cup: "D", price: "12000",
      summary: "s2", tags: [], source_hash: "h2",
      // no first_seen_at, no last_seen_at
    },
  ]);

  const upsertCall = log.find((e) => e.method === "upsert");
  const upsertRows = upsertCall!.args[0] as Record<string, unknown>[];
  assert("first row preserves first_seen_at", upsertRows[0]?.first_seen_at != null, JSON.stringify(upsertRows[0]));
  assert("first row preserves last_seen_at", upsertRows[0]?.last_seen_at != null, JSON.stringify(upsertRows[0]));
  assert("second row omits first_seen_at (key not present)", !("first_seen_at" in upsertRows[1]!), JSON.stringify(upsertRows[1]));
  assert("second row omits last_seen_at (key not present)", !("last_seen_at" in upsertRows[1]!), JSON.stringify(upsertRows[1]));
  assert("both rows have updated_at", upsertRows[0]?.updated_at != null && upsertRows[1]?.updated_at != null, "");
}

// --- 16. Attendance shop invariant validation ---
{
  console.log("\n16. Attendance shop invariant");

  // Setup: profile rows that will be returned by the fake select
  const profiles: Array<{ id: string; shop_id: string }> = [
    { id: "p1", shop_id: "shop-a" },
    { id: "p2", shop_id: "shop-a" },
  ];

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log, { allRows: profiles }));

  // Row with mismatched shop_id should fail before any delete
  try {
    await store.replaceAttendance("2026-07-18", [
      { profile_id: "p1", attendance_date: "2026-07-18", shop_id: "shop-b" },
    ]);
    assert("throws when shop_id does not match profile", false, "no error thrown");
  } catch (err) {
    const msg = String(err);
    assert("error mentions shop_id mismatch", msg.includes("shop_id"), msg);
    assert("error mentions profile shop", msg.includes("shop-a"), msg);
    assert("error still contains operation name", msg.includes("ContentStore.replaceAttendance"), msg);
  }

  // Verify no delete or insert happened
  const anyDestructive = log.filter((e) => e.method.startsWith("delete") || e.method.startsWith("insert"));
  assert("no destructive calls for mismatched shop", anyDestructive.length === 0, JSON.stringify(log));
}

// --- 17. Attendance shop — missing profile ---
{
  console.log("\n17. Attendance shop — missing profile rejects");

  const allRows: Array<{ id: string; shop_id: string }> = [{ id: "p1", shop_id: "shop-a" }];
  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log, { allRows }));

  try {
    await store.replaceAttendance("2026-07-18", [
      { profile_id: "p999", attendance_date: "2026-07-18", shop_id: "shop-x" },
    ]);
    assert("throws when profile not found", false, "no error thrown");
  } catch (err) {
    const msg = String(err);
    assert("error mentions profile not found", msg.includes("not found"), msg);
  }

  const anyDestructive = log.filter((e) => e.method.startsWith("delete") || e.method.startsWith("insert"));
  assert("no destructive calls for missing profile", anyDestructive.length === 0, JSON.stringify(log));
}

// --- 18. Attendance shop — valid rows still pass ---
{
  console.log("\n18. Attendance shop — valid rows still proceed");

  const profiles: Array<{ id: string; shop_id: string }> = [
    { id: "p1", shop_id: "shop-a" },
    { id: "p2", shop_id: "shop-a" },
  ];

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log, { allRows: profiles }));

  await store.replaceAttendance("2026-07-18", [
    { profile_id: "p1", attendance_date: "2026-07-18", shop_id: "shop-a" },
    { profile_id: "p2", attendance_date: "2026-07-18", shop_id: "shop-a" },
  ]);

  const deletes = log.filter((e) => e.method === "delete.eq");
  const inserts = log.filter((e) => e.method === "insert");
  assert("valid attendance: delete called", deletes.length >= 1, JSON.stringify(deletes));
  assert("valid attendance: insert called", inserts.length >= 1, JSON.stringify(inserts));
}

// --- 19. Attendance shop — empty rows still only delete ---
{
  console.log("\n19. Attendance shop — empty rows still delete only");

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log));

  await store.replaceAttendance("2026-07-18", []);

  const deletes = log.filter((e) => e.method === "delete.eq");
  const inserts = log.filter((e) => e.method === "insert");
  assert("empty attendance: delete called", deletes.length >= 1, JSON.stringify(deletes));
  assert("empty attendance: no insert", inserts.length === 0, JSON.stringify(inserts));
}

// ─── Summary ──────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All checks passed.");
