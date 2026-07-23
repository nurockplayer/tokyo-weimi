// Supabase client factory for Node.js tools.
// Must not be imported from browser code.
// Does not create a client at module import time.

import { createClient } from "@supabase/supabase-js";
import { SupabaseContentStore } from "./content-store.ts";
import type { ContentStore, ContentStoreConfig } from "./types.ts";

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

  return new SupabaseContentStore(client as never, config.bucket);
}
