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
