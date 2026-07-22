#!/usr/bin/env tsx

/**
 * Reads the current site-data.json, image-map.json, and profile-translations.json,
 * wraps them into a temporary ContentSnapshotV1, and validates it against the
 * content contract assertions.
 *
 * Exits with code 0 on success (with brief statistics),
 * and code 1 on validation failure.
 */

import { assertContentSnapshotV1 } from "../src/content-contract.ts";

// Dynamic imports because JSON import assertions don't work in tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "..");

function loadJson<T = unknown>(relativePath: string): T {
  const raw = readFileSync(resolve(root, relativePath), "utf-8");
  return JSON.parse(raw) as T;
}

const siteData = loadJson("src/content/site-data.json");
const imageMap = loadJson<Record<string, string>>("src/content/image-map.json");
const profileTranslations = loadJson("src/content/profile-translations.json");

const snapshot = {
  schemaVersion: 1 as const,
  version: "2026-07-18T000000Z-check",
  generatedAt: new Date().toISOString(),
  data: siteData,
  imageMap,
  profileTranslations,
};

try {
  assertContentSnapshotV1(snapshot);
} catch (err) {
  console.error("Contract check FAILED:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const profileCount = Array.isArray((snapshot.data as Record<string, unknown>).profiles)
  ? ((snapshot.data as Record<string, unknown>).profiles as unknown[]).length
  : 0;
const imageMapCount = Object.keys(snapshot.imageMap).length;
const translationLangCount = Object.keys(snapshot.profileTranslations).length;
let translationEntryCount = 0;
for (const lang of Object.values(snapshot.profileTranslations)) {
  if (typeof lang === "object" && lang !== null) {
    translationEntryCount += Object.keys(lang as Record<string, unknown>).length;
  }
}

console.log("Contract check PASSED");
console.log(`  profiles:          ${profileCount}`);
console.log(`  image map entries: ${imageMapCount}`);
console.log(`  translation langs: ${translationLangCount}`);
console.log(`  translation entries: ${translationEntryCount}`);
