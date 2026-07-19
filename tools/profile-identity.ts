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
 * Generate a stable profile ID for a VIP card from its normalised name
 * and canonical primary image URL.  Same name + same URL → same ID.
 * Different names sharing the same image URL produce different IDs.
 */
export function vipProfileIdFromUrl(name: string, canonicalUrl: string): string {
  const hash = crypto.createHash("sha256").update(`${name}\x00${canonicalUrl}`).digest("hex").slice(0, 12);
  return `ikebukuro-vip-girl-${hash}`;
}

/**
 * Generate a collision-resistant wpId for a VIP source profile.
 * Combines normalised name and canonical primary image URL so that
 * different-name profiles sharing the same image still get distinct wpIds.
 *
 * This is the single place where VIP wpIds are produced — both the
 * production updater and tests go through this function.
 */
export function vipWpId(name: string, canonicalUrl: string): string {
  return `vip-${crypto.createHash("sha256").update(`${name}\x00${canonicalUrl}`).digest("hex").slice(0, 12)}`;
}

/**
 * Resolve a stable profile ID for a VIP card using the full matching
 * rule set:
 *
 *  1. If a baseline profile has the same primary image → reuse its ID.
 *  2. If the baseline has exactly one profile with this name AND the
 *     current source also has exactly one card with this name → unique-
 *     name fallback, reuse the existing ID.
 *  3. Otherwise → generate a fresh deterministic ID from the canonical
 *     primary image URL.
 *
 * `currentNameCount` is the number of cards in the current source that
 * share this normalised name.  This prevents a single-baseline entry
 * from being reused for multiple current cards with the same name.
 *
 * `existingByName` must be built from the same baseline using
 * `buildExistingByName`.
 */
export function resolveVipProfileId(
  name: string,
  primaryImageId: string,
  currentNameCount: number,
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

  // Priority 2: unique name both in baseline AND in current source
  if (nameIds && nameIds.size === 1 && currentNameCount === 1) {
    return nameIds.values().next().value!;
  }

  // Priority 3: fresh deterministic ID from name + canonical URL
  return vipProfileIdFromUrl(name, canonicalUrl);
}
