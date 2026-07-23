// Row types mapping #79 SQL migration columns — no `any`.
// ContentStore interface — I/O only, no normalization/snapshot composition.

// --- Config ---

export interface ContentStoreConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket: string;
}

// --- Run management input types ---

export interface StartRunInput {
  sourceDate?: string;
  metadata?: Record<string, unknown>;
}

export interface CompleteRunInput {
  completedAt?: string;
  profileCount?: number;
  sourceDate?: string;
}

// --- DB row types (snake_case columns matching content_store SQL) ---

export interface ProfileRow {
  id: string;
  shop_id: string;
  source_id: string;
  name: string;
  image: string;
  date: string;
  title: string;
  origin: string;
  age: string;
  height: string;
  weight: string;
  cup: string;
  price: string;
  summary: string;
  tags: string[];
  source_hash: string;
  first_seen_at?: string;
  last_seen_at?: string;
  source_updated_at?: string | null;
}

export interface MediaRow {
  id: string;
  profile_id: string;
  source_url: string;
  media_type: "image" | "video";
  image_key?: string | null;
  role?: "gallery" | "support" | "supplemental" | "video";
  position?: number;
}

export interface AttendanceRow {
  profile_id: string;
  attendance_date: string;
  shop_id: string;
  position?: number;
}

export interface TranslationRow {
  profile_id: string;
  language: string;
  title?: string | null;
  summary?: string | null;
  tags: string[];
  source_hash: string;
}

export interface ProfileOverrideRow {
  profile_id: string;
  name?: string | null;
  title?: string | null;
  origin?: string | null;
  age?: string | null;
  height?: string | null;
  weight?: string | null;
  cup?: string | null;
  price?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  hidden?: boolean | null;
  updated_at: string;
}

// --- ContentStore interface ---

export interface ContentStore {
  startRun(input: StartRunInput): Promise<string>;
  completeRun(runId: string, input: CompleteRunInput): Promise<void>;
  failRun(runId: string, error: unknown): Promise<void>;

  upsertProfiles(rows: ProfileRow[]): Promise<void>;
  replaceProfileMedia(profileId: string, rows: MediaRow[]): Promise<void>;
  replaceAttendance(date: string, rows: AttendanceRow[]): Promise<void>;
  upsertTranslations(rows: TranslationRow[]): Promise<void>;

  loadOverrides(): Promise<ProfileOverrideRow[]>;
  uploadObject(path: string, bytes: Uint8Array, contentType: string, upsert: boolean): Promise<void>;
}

// --- Minimal Supabase client interface (injectable for tests) ---

export interface SupabaseQueryResponse {
  data: unknown;
  error: { message: string; details?: string; hint?: string; code?: string } | null;
}

/**
 * Base part of the Supabase-like client.
 * Split from the fake-hooks type so CheckContentStore can
 * return a plain object that satisfies this without declaring
 * the hook property.
 */
export interface SupabaseClientLike {
  from(table: string): {
    insert(rows: unknown[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): {
      select(): Promise<SupabaseQueryResponse>;
    };
    upsert(rows: unknown[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): {
      select(): Promise<SupabaseQueryResponse>;
    };
    delete(): {
      eq(column: string, value: unknown): Promise<SupabaseQueryResponse>;
    };
    select(columns?: string): Promise<SupabaseQueryResponse>;
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): Promise<SupabaseQueryResponse>;
    };
  };
  storage: {
    from(bucket: string): {
      upload(path: string, data: Uint8Array, opts?: { contentType?: string; upsert?: boolean }): Promise<SupabaseQueryResponse>;
    };
  };
}
