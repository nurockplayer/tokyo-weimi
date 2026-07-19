import crypto from "node:crypto";

/**
 * Build a shop+name composite key used in existingByName lookups.
 */
export function nameKey(shopId: string, name: string): string {
  return `${shopId}:${name}`;
}

/**
 * Build a multi-map from shop+name keys to the set of profile IDs
 * sharing that name.  Unlike a 1:1 Map, this preserves every ID for
 * duplicate-name disambiguation.
 */
export function buildExistingByName(
  profiles: ReadonlyArray<{ shopId?: string; name: string; id: string }>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const profile of profiles) {
    const key = nameKey(profile.shopId || "tokyo-weimi", profile.name);
    const ids = map.get(key);
    if (ids) {
      ids.add(profile.id);
    } else {
      map.set(key, new Set([profile.id]));
    }
  }
  return map;
}

/**
 * Generate a stable profile ID for a VIP card from its canonical
 * primary image URL.  Same URL → same ID, every time.
 */
export function vipProfileIdFromUrl(canonicalUrl: string): string {
  const hash = crypto.createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 12);
  return `ikebukuro-vip-girl-${hash}`;
}

/**
 * Generate a collision-resistant wpId for a VIP source profile.
 * Uses the canonical primary image URL as a stable discriminator
 * (VIP cards have no individual detail page URL).
 *
 * This is the single place where VIP wpIds are produced — both the
 * production updater and tests go through this function.
 */
export function vipWpId(canonicalUrl: string): string {
  return `vip-${crypto.createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 12)}`;
}

/**
 * Resolve a stable profile ID for a VIP card using the full matching
 * rule set:
 *
 *  1. If a baseline profile has the same primary image → reuse its ID.
 *  2. If exactly one baseline profile shares this name → reuse its ID.
 *  3. Otherwise → generate a fresh deterministic ID from the canonical
 *     primary image URL.
 *
 * `existingByName` must be built from the same baseline using
 * `buildExistingByName`.
 */
export function resolveVipProfileId(
  name: string,
  primaryImageId: string,
  existingByName: Map<string, Set<string>>,
  existingById: Map<string, { image: string }>,
  canonicalUrl: string,
): string {
  const key = nameKey("ikebukuro-vip", name);
  const nameIds = existingByName.get(key);

  // Priority 1: same primary image → backward compat
  if (primaryImageId && nameIds) {
    for (const eid of nameIds) {
      const existing = existingById.get(eid);
      if (existing && existing.image === primaryImageId) return eid;
    }
  }

  // Priority 2: unique name → reuse existing ID
  if (nameIds && nameIds.size === 1) {
    return nameIds.values().next().value!;
  }

  // Priority 3: fresh deterministic ID from canonical URL
  return vipProfileIdFromUrl(canonicalUrl);
}
