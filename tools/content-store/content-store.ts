import type {
  AttendanceRow,
  ContentStore,
  MediaRow,
  ProfileOverrideRow,
  ProfileRow,
  SupabaseClientLike,
  TranslationRow,
  SelectOpts,
} from "./types.ts";

const CHUNK_SIZE = 200;
const PAGE_SIZE = 1000;

function* chunk<T>(arr: T[]): Generator<T[]> {
  for (let i = 0; i < arr.length; i += CHUNK_SIZE) {
    yield arr.slice(i, i + CHUNK_SIZE);
  }
}

async function withError<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`ContentStore.${operation} failed: ${err.message}`);
    }
    throw new Error(`ContentStore.${operation} failed: ${String(err)}`);
  }
}

function hasError(
  resp: { data: unknown; error: unknown },
): resp is { data: unknown; error: { message: string } } {
  return resp.error != null;
}

/** Materialize default values for optional media fields so heterogeneous
 * batches do not silently coerce missing columns to null. */
function materializeMediaRow(row: MediaRow): MediaRow {
  return {
    role: "gallery",
    position: 0,
    ...row,
  };
}

/** Materialize default position for attendance rows. */
function materializeAttendanceRow(row: AttendanceRow): AttendanceRow {
  return {
    position: 0,
    ...row,
  };
}

/** Strip optional-first-run timestamps that callers may omit so
 * PostgREST does not null them.  first_seen_at is never overwritten
 * on existing rows; we remove it from the upsert payload so the DB
 * keeps the original value via DEFAULT or on-conflict do-nothing. */
function normalizeProfileRow(row: ProfileRow): Record<string, unknown> {
  const out = { ...row, updated_at: new Date().toISOString() } as Record<string, unknown>;
  // Remove optional fields when undefined so PostgREST uses the
  // column default rather than inserting null.
  if (out.first_seen_at === undefined) delete out.first_seen_at;
  if (out.last_seen_at === undefined) delete out.last_seen_at;
  if (out.source_updated_at === undefined) delete out.source_updated_at;
  return out;
}

function normalizeTranslationRow(row: TranslationRow): Record<string, unknown> {
  const out = { ...row, updated_at: new Date().toISOString() } as Record<string, unknown>;
  if (out.title === undefined) out.title = null;
  if (out.summary === undefined) out.summary = null;
  return out;
}

export class SupabaseContentStore implements ContentStore {
  readonly #client: SupabaseClientLike;
  readonly #bucket: string;

  constructor(client: SupabaseClientLike, bucket: string = "site-content") {
    this.#client = client;
    this.#bucket = bucket;
  }

  // --- Run lifecycle ---

  async startRun(input: {
    sourceDate?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    return withError("startRun", async () => {
      const resp = await this.#client
        .from("content_scrape_runs")
        .insert([{
          status: "running",
          source_date: input.sourceDate ?? null,
          metadata: input.metadata ?? {},
        }])
        .select();

      if (hasError(resp)) throw new Error(resp.error.message);

      const rows = resp.data as Array<{ id: string }> | null;
      if (!rows || rows.length === 0) {
        throw new Error("insert returned no rows");
      }
      return rows[0]!.id;
    });
  }

  async completeRun(
    runId: string,
    input: {
      completedAt?: string;
      profileCount?: number;
      sourceDate?: string;
    },
  ): Promise<void> {
    return withError("completeRun", async () => {
      const updates: Record<string, unknown> = {
        status: "succeeded",
        completed_at: input.completedAt ?? new Date().toISOString(),
      };
      if (input.profileCount !== undefined) updates.profile_count = input.profileCount;
      if (input.sourceDate !== undefined) updates.source_date = input.sourceDate;

      const resp = await this.#client
        .from("content_scrape_runs")
        .update(updates)
        .eq("id", runId);

      if (hasError(resp)) throw new Error(resp.error.message);
    });
  }

  async failRun(runId: string, error: unknown): Promise<void> {
    return withError("failRun", async () => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const resp = await this.#client
        .from("content_scrape_runs")
        .update({ status: "failed", error_message: errorMessage })
        .eq("id", runId);

      if (hasError(resp)) throw new Error(resp.error.message);
    });
  }

  // --- Profile CRUD ---

  async upsertProfiles(rows: ProfileRow[]): Promise<void> {
    return withError("upsertProfiles", async () => {
      for (const batch of chunk(rows)) {
        const resp = await this.#client
          .from("content_profiles")
          .upsert(
            batch.map(normalizeProfileRow),
            { onConflict: "shop_id,source_id", ignoreDuplicates: false },
          )
          .select();
        if (hasError(resp)) throw new Error(resp.error.message);
      }
    });
  }

  async replaceProfileMedia(profileId: string, rows: MediaRow[]): Promise<void> {
    return withError("replaceProfileMedia", async () => {
      for (const row of rows) {
        if (row.profile_id !== profileId) {
          throw new Error(
            `row profile_id "${row.profile_id}" does not match parameter "${profileId}"`,
          );
        }
      }

      const delResp = await this.#client
        .from("content_profile_media")
        .delete()
        .eq("profile_id", profileId);
      if (hasError(delResp)) throw new Error(delResp.error.message);

      if (rows.length === 0) return;

      for (const batch of chunk(rows)) {
        const insResp = await this.#client
          .from("content_profile_media")
          .insert(batch.map(materializeMediaRow))
          .select();
        if (hasError(insResp)) throw new Error(insResp.error.message);
      }
    });
  }

  // --- Attendance ---

  async replaceAttendance(date: string, rows: AttendanceRow[]): Promise<void> {
    return withError("replaceAttendance", async () => {
      for (const row of rows) {
        if (row.attendance_date !== date) {
          throw new Error(
            `row attendance_date "${row.attendance_date}" does not match parameter "${date}"`,
          );
        }
      }

      // Validate shop_id invariant: batch-fetch profile → shop_id mapping
      if (rows.length > 0) {
        const profileIds = [...new Set(rows.map((r) => r.profile_id))];
        for (const batch of chunk(profileIds)) {
          const mapResp = await this.#client
            .from("content_profiles")
            .select("id,shop_id", { inFilter: { column: "id", values: batch } });

          if (hasError(mapResp)) throw new Error(mapResp.error.message);

          const profileShops = (mapResp.data as Array<{ id: string; shop_id: string }>) ?? [];
          if (profileShops.length !== batch.length) {
            const found = new Set(profileShops.map((p) => p.id));
            const missing = batch.filter((id) => !found.has(id));
            throw new Error(
              `profiles not found: ${missing.join(", ")}`,
            );
          }

          const shopById = new Map(profileShops.map((p) => [p.id, p.shop_id]));
          for (const row of rows) {
            const expectedShop = shopById.get(row.profile_id);
            if (expectedShop !== row.shop_id) {
              throw new Error(
                `attendance row shop_id "${row.shop_id}" does not match profile "${row.profile_id}" shop "${expectedShop}"`,
              );
            }
          }
        }
      }

      const delResp = await this.#client
        .from("content_attendance")
        .delete()
        .eq("attendance_date", date);
      if (hasError(delResp)) throw new Error(delResp.error.message);

      if (rows.length === 0) return;

      for (const batch of chunk(rows)) {
        const insResp = await this.#client
          .from("content_attendance")
          .insert(batch.map(materializeAttendanceRow))
          .select();
        if (hasError(insResp)) throw new Error(insResp.error.message);
      }
    });
  }

  // --- Translations ---

  async upsertTranslations(rows: TranslationRow[]): Promise<void> {
    return withError("upsertTranslations", async () => {
      for (const batch of chunk(rows)) {
        const resp = await this.#client
          .from("content_profile_translations")
          .upsert(
            batch.map(normalizeTranslationRow),
            { onConflict: "profile_id,language", ignoreDuplicates: false },
          )
          .select();
        if (hasError(resp)) throw new Error(resp.error.message);
      }
    });
  }

  // --- Overrides ---

  async loadOverrides(): Promise<ProfileOverrideRow[]> {
    return withError("loadOverrides", async () => {
      const all: ProfileOverrideRow[] = [];
      let cursor: string | undefined;

      while (true) {
        const selectOpts: SelectOpts = {
          order: "profile_id",
          limit: PAGE_SIZE,
        };
        if (cursor) {
          selectOpts.gt = cursor;
        }

        const resp = await this.#client
          .from("content_profile_overrides")
          .select("*", selectOpts);

        if (hasError(resp)) throw new Error(resp.error.message);

        const page = (resp.data as ProfileOverrideRow[]) ?? [];
        if (page.length === 0) break;

        all.push(...page);
        if (page.length < PAGE_SIZE) break;

        cursor = page[page.length - 1]!.profile_id;
      }

      return all;
    });
  }

  // --- Storage ---

  async uploadObject(
    path: string,
    bytes: Uint8Array,
    contentType: string,
    upsert: boolean,
  ): Promise<void> {
    return withError("uploadObject", async () => {
      const resp = await this.#client.storage
        .from(this.#bucket)
        .upload(path, bytes, { contentType, upsert });
      if (hasError(resp)) throw new Error(resp.error.message);
    });
  }
}
