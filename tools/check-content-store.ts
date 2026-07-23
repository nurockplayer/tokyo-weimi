#!/usr/bin/env tsx
/**
 * Offline checks for ContentStore adapter.
 * Uses a fake client — no network access required.
 */

import { readContentStoreConfig } from "./content-store/supabase-client.ts";
import { SupabaseContentStore } from "./content-store/content-store.ts";
import type { SupabaseClientLike, SupabaseQueryResponse } from "./content-store/types.ts";

// ─── Fake client builder ───────────────────────────────────────

interface CallLogEntry {
  table: string;
  method: string;
  args: unknown[];
}

function fakeClient(log: CallLogEntry[]): SupabaseClientLike {
  let selectResult: unknown = null;

  function ok(data: unknown = null): SupabaseQueryResponse {
    return { data, error: null };
  }

  function chainable(table: string) {
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
        };
      },
      select(columns?: string) {
        log.push({ table, method: "select", args: [columns] });
        return Promise.resolve(ok(selectResult));
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
  }

  const tracker: Record<string, ReturnType<typeof chainable>> = {};
  return {
    from(table: string) {
      if (!tracker[table]) {
        tracker[table] = chainable(table);
      }
      // Update select result for this table — tests can set it before calling
      const ch = tracker[table] as ReturnType<typeof chainable>;
      // Re-bind select to return current selectResult
      ch.select = (columns?: string) => {
        log.push({ table, method: "select", args: [columns] });
        return Promise.resolve(ok(selectResult));
      };
      return ch;
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

  const log: CallLogEntry[] = [];
  const store = new SupabaseContentStore(fakeClient(log));

  await store.replaceAttendance("2026-07-18", [
    { profile_id: "p1", attendance_date: "2026-07-18", shop_id: "shop1", position: 0 },
  ]);

  const delEq = log.filter((e) => e.method === "delete.eq");
  assert("calls delete().eq('attendance_date', '2026-07-18')", delEq.length >= 1, JSON.stringify(delEq));

  // Verify it's the right column and value
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
    { label: "replaceAttendance", fn: () => store.replaceAttendance("2026-07-18", [{ profile_id: "p1", attendance_date: "2026-07-18", shop_id: "s1" }]) },
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

// ─── Summary ──────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log("All checks passed.");
