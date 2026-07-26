// Supabase client factory for Node.js tools.
// Must not be imported from browser code.
// Does not create a client at module import time.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseContentStore } from "./content-store.ts";
import type {
  ContentStore,
  ContentStoreConfig,
  SupabaseInsertOpts,
  SupabaseClientLike,
  SupabaseQueryResponse,
  SupabaseUpsertOpts,
  SelectOpts,
} from "./types.ts";

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
 *
 * Each method forward-delegates to the real Postgrest builder.  Insert/upsert
 * options are split into SupabaseInsertOpts / SupabaseUpsertOpts so the
 * callers are type-checked against the SupabaseClientLike interface, while
 * the inner adapter maps them to the Postgrest API shape.
 *
 * `.select()` is actually chained onto the insert/upsert builder so the
 * return value includes the inserted/upserted rows.
 */
function toSupabaseClientLike(client: SupabaseClient): SupabaseClientLike {
  return {
    from(table: string) {
      const qb = client.from(table);
      return {
        insert(rows: unknown[], opts?: SupabaseInsertOpts) {
          return {
            select: async () => {
              const builder = qb.insert(rows as Record<string, unknown>[], {
                defaultToNull: opts?.defaultToNull,
                count: opts?.count,
              });
              const result = await builder.select();
              return wrapResult(result);
            },
          };
        },
        upsert(rows: unknown[], opts?: SupabaseUpsertOpts) {
          return {
            select: async () => {
              const builder = qb.upsert(rows as Record<string, unknown>[], {
                onConflict: opts?.onConflict,
                ignoreDuplicates: opts?.ignoreDuplicates,
                defaultToNull: opts?.defaultToNull,
                count: opts?.count,
              });
              const result = await builder.select();
              return wrapResult(result);
            },
          };
        },
        delete() {
          const base = qb.delete();
          return {
            eq: async (column: string, value: unknown) => {
              const result = await base.eq(column, value as string);
              return wrapResult(result);
            },
            in: async (column: string, values: unknown[]) => {
              const result = await base.in(column, values as string[]);
              return wrapResult(result);
            },
          };
        },
        select: async (columns?: string, opts?: SelectOpts) => {
          let query = qb.select(columns ?? "*");
          if (opts?.order) {
            const orders = Array.isArray(opts.order) ? opts.order : [opts.order];
            for (const col of orders) {
              query = query.order(col, { ascending: true });
            }
          }
          if (opts?.limit) {
            query = query.limit(opts.limit);
          }
          if (opts?.gt) {
            query = query.gt(opts.gt.column, opts.gt.value as string);
          }
          if (opts?.eq) {
            query = query.eq(opts.eq.column, opts.eq.value as string);
          }
          if (opts?.inFilter) {
            query = query.in(opts.inFilter.column, opts.inFilter.values as string[]);
          }
          if (opts?.rangeFrom !== undefined && opts?.rangeTo !== undefined) {
            query = query.range(opts.rangeFrom, opts.rangeTo);
          }
          const result = await query;
          return wrapResult(result);
        },
        update(values) {
          return {
            eq: async (column: string, value: unknown) => {
              const result = await qb.update(values as Record<string, unknown>).eq(column, value as string);
              return wrapResult(result);
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
            const result = await sb.upload(path, data, opts);
            return wrapResult(result);
          },
        };
      },
    },
  };
}

function wrapResult(result: { data: unknown; error: unknown }): SupabaseQueryResponse {
  return { data: result.data, error: result.error as SupabaseQueryResponse["error"] };
}
