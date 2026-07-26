#!/usr/bin/env tsx
/**
 * Atomic snapshot publisher — validates, serializes, uploads immutable object,
 * then updates current.json manifest last.
 */

import { createHash } from "node:crypto";
import type { ContentStore } from "../content-store/types.ts";
import type { ContentSnapshotV1, ContentManifestV1 } from "../../src/types.ts";
import { assertContentSnapshotV1, assertContentManifestV1 } from "../../src/content-contract.ts";
import { serializeSnapshot } from "./build-snapshot.ts";

const SNAPSHOT_CONTENT_TYPE = "application/json; charset=utf-8";
const SNAPSHOT_DIR = "snapshots";
const CURRENT_PATH = "current.json";

export async function publishSnapshot(
  store: ContentStore,
  snapshot: ContentSnapshotV1,
): Promise<ContentManifestV1> {
  // Step 1: validate snapshot
  assertContentSnapshotV1(snapshot);

  // Step 2: deterministic JSON bytes
  const bytes = serializeSnapshot(snapshot);

  // Step 3: compute artifact sha256 and build manifest
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const snapshotPath = `${SNAPSHOT_DIR}/${snapshot.version}.json`;

  const manifest: ContentManifestV1 = {
    schemaVersion: 1,
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    snapshotPath,
    sha256,
  };

  // Step 4: validate manifest before any upload
  assertContentManifestV1(manifest);

  // Step 5: upload immutable snapshot (upsert=false)
  await store.uploadObject(snapshotPath, bytes, SNAPSHOT_CONTENT_TYPE, false);

  // Step 6: upload current.json last (upsert=true)
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  await store.uploadObject(CURRENT_PATH, manifestBytes, SNAPSHOT_CONTENT_TYPE, true);

  return manifest;
}
