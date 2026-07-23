import type {
  AttendanceRow,
  ContentStore,
  MediaRow,
  ProfileOverrideRow,
  ProfileRow,
  SupabaseClientLike,
  TranslationRow,
} from "./types.ts";

const CHUNK_SIZE = 200;
const OVERRIDE_PAGE_SIZE = 1000;

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
      const now = new Date().toISOString();
      for (const batch of chunk(rows)) {
        const resp = await this.#client
          .from("content_profiles")
          .upsert(
            batch.map((r) => ({ ...r, updated_at: now })),
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
      const now = new Date().toISOString();
      for (const batch of chunk(rows)) {
        const resp = await this.#client
          .from("content_profile_translations")
          .upsert(
            batch.map((r) => ({ ...r, updated_at: now })),
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
      const pageSize = OVERRIDE_PAGE_SIZE;
      let start = 0;

      while (true) {
        const resp = await this.#client
          .from("content_profile_overrides")
          .select("*", { rangeFrom: start, rangeTo: start + pageSize - 1 });

        if (hasError(resp)) throw new Error(resp.error.message);

        const page = (resp.data as ProfileOverrideRow[]) ?? [];
        all.push(...page);

        if (page.length < pageSize) break;
        start += pageSize;
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
