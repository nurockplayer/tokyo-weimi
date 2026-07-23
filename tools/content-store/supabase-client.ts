// Supabase client factory for Node.js tools.
// Must not be imported from browser code.
// Does not create a client at module import time.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseContentStore } from "./content-store.ts";
import type { ContentStore, ContentStoreConfig, SupabaseClientLike, SupabaseQueryResponse } from "./types.ts";

const ENV_URL = "SUPABASE_URL";
const ENV_KEY = "SUPABASE_SERVICE_ROLE_KEY";
const ENV_BUCKET = "CONTENT_BUCKET";
const DEFAULT_BUCKET = "site-content";

/**
 * Reads ContentStoreConfig from environment variables.
 * Errors name which variables are missing without leaking secret values.
 */
export function readContentStoreConfig(
  env: NodeJS.ProcessEnv = process.env,
): ContentStoreConfig {
  const missing: string[] = [];

  const supabaseUrl = env[ENV_URL];
  if (!supabaseUrl) missing.push(ENV_URL);

  const serviceRoleKey = env[ENV_KEY];
  if (!serviceRoleKey) missing.push(ENV_KEY);

  if (missing.length > 0) {
    throw new Error(
      `ContentStore config is incomplete (missing: ${missing.join(", ")}). ` +
        `Set these environment variables before calling createSupabaseContentStore().`,
    );
  }

  const bucket = env[ENV_BUCKET] ?? DEFAULT_BUCKET;

  return {
    supabaseUrl: supabaseUrl!,
    serviceRoleKey: serviceRoleKey!,
    bucket,
  };
}

/**
 * Creates a ContentStore from config.
 * The caller controls when and how the Supabase client is instantiated.
 */
export function createSupabaseContentStore(config: ContentStoreConfig): ContentStore {
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  return new SupabaseContentStore(toSupabaseClientLike(client), config.bucket);
}

/**
 * Explicit typed bridge from the real SupabaseClient to SupabaseClientLike.
 * Every method await the Postgrest builder and re-shapes to { data, error }
 * so TypeScript can verify the boundary without an unchecked cast.
 */
function toSupabaseClientLike(client: SupabaseClient): SupabaseClientLike {
  return {
    from(table: string) {
      const qb = client.from(table);
      return {
        insert(rows: unknown[], opts?) {
          return {
            select: async () => {
              const r = await qb.insert(rows as Record<string, unknown>[], opts as never);
              return wrapResult(r);
            },
          };
        },
        upsert(rows: unknown[], opts?) {
          return {
            select: async () => {
              const r = await qb.upsert(rows as Record<string, unknown>[], opts as never);
              return wrapResult(r);
            },
          };
        },
        delete() {
          return {
            eq: async (column: string, value: unknown) => {
              const r = await qb.delete().eq(column, value as string);
              return wrapResult(r);
            },
          };
        },
        select: async (columns?) => {
          const r = await qb.select(columns);
          return wrapResult(r);
        },
        update(values) {
          return {
            eq: async (column: string, value: unknown) => {
              const r = await qb.update(values as Record<string, unknown>).eq(column, value as string);
              return wrapResult(r);
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        const sb = client.storage.from(bucket);
        return {
          upload: async (path, data, opts) => {
            const r = await sb.upload(path, data, opts);
            return wrapResult(r);
          },
        };
      },
    },
  };
}

function wrapResult(result: { data: unknown; error: unknown }): SupabaseQueryResponse {
  return { data: result.data, error: result.error as SupabaseQueryResponse["error"] };
}
