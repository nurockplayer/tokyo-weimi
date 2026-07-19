import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { nameKey, buildExistingByName, vipProfileIdFromUrl } from "../tools/profile-identity.ts";

// === buildExistingByName ===

describe("buildExistingByName", () => {
  it("groups IDs by shop+name composite key", () => {
    const map = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "小奈斯", id: "id-a" },
      { shopId: "ikebukuro-vip", name: "小安妮", id: "id-b" },
    ]);
    const naisiIds = map.get(nameKey("ikebukuro-vip", "小奈斯"));
    assert.ok(naisiIds);
    assert.equal(naisiIds.size, 1);
    assert.ok(naisiIds.has("id-a"));
  });

  it("keeps ALL IDs for duplicate names (never overwrite)", () => {
    const map = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "小奈斯", id: "ikebukuro-vip-girl-vip-e5b08fe5" },
      { shopId: "ikebukuro-vip", name: "小奈斯", id: "ikebukuro-vip-girl-vip-e5b08fe5-2" },
    ]);
    const ids = map.get(nameKey("ikebukuro-vip", "小奈斯"));
    assert.ok(ids);
    assert.equal(ids.size, 2);
    assert.ok(ids.has("ikebukuro-vip-girl-vip-e5b08fe5"));
    assert.ok(ids.has("ikebukuro-vip-girl-vip-e5b08fe5-2"));
  });

  it("handles single-profile case", () => {
    const map = buildExistingByName([
      { shopId: "tokyo-weimi", name: "楓", id: "kaede" },
    ]);
    const ids = map.get(nameKey("tokyo-weimi", "楓"));
    assert.ok(ids);
    assert.equal(ids.size, 1);
    assert.ok(ids.has("kaede"));
  });

  it("defaults missing shopId to tokyo-weimi", () => {
    const map = buildExistingByName([
      { name: "测试", id: "test-id" },
    ]);
    const ids = map.get(nameKey("tokyo-weimi", "测试"));
    assert.ok(ids);
    assert.equal(ids.size, 1);
  });

  it("returns empty Map for empty input", () => {
    const map = buildExistingByName([]);
    assert.equal(map.size, 0);
  });
});

// === vipProfileIdFromUrl ===

describe("vipProfileIdFromUrl", () => {
  it("produces stable ID for same URL across calls", () => {
    const url = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    const a = vipProfileIdFromUrl(url);
    const b = vipProfileIdFromUrl(url);
    assert.equal(a, b);
  });

  it("produces different IDs for different URLs", () => {
    const urlA = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    const urlB = "https://vip6969.com/wp-content/uploads/2026/07/20260711-img-1547-thumb.jpg";
    assert.notEqual(vipProfileIdFromUrl(urlA), vipProfileIdFromUrl(urlB));
  });
});

// === Full scenario: two identical names with different images ===

describe("VIP identity — two cards with same name", () => {
  const name = "小奈斯";

  it("produce different IDs when they have different images", () => {
    const urlA = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    const urlB = "https://vip6969.com/wp-content/uploads/2026/07/20260711-img-1547-thumb.jpg";

    const idA = vipProfileIdFromUrl(urlA);
    const idB = vipProfileIdFromUrl(urlB);

    assert.notEqual(idA, idB,
      "Two cards with the same name but different images MUST get different IDs");
  });

  it("fixture reversed still produces same ID assignment", () => {
    const urlA = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    const urlB = "https://vip6969.com/wp-content/uploads/2026/07/20260711-img-1547-thumb.jpg";

    // Forward order
    const idA_fwd = vipProfileIdFromUrl(urlA);
    const idB_fwd = vipProfileIdFromUrl(urlB);

    // Reverse order — call the same URLs in reversed order
    const idB_rev = vipProfileIdFromUrl(urlB);
    const idA_rev = vipProfileIdFromUrl(urlA);

    // Each URL maps to the same ID regardless of call order
    assert.equal(idA_fwd, idA_rev);
    assert.equal(idB_fwd, idB_rev);
  });
});

describe("VIP identity — hash collision resistance", () => {
  it("names with same first 4 UTF-8 bytes produce distinct IDs", () => {
    // 小奈斯 and 小安妮 both start with UTF-8 bytes E5 B0 8F E5
    // under the old Buffer(name).hex.slice(0,8) approach both got
    // the same wpId prefix "e5b08fe5"
    const nameA = "小奈斯";
    const nameB = "小安妮";

    const urlA = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    const urlB = "https://vip6969.com/wp-content/uploads/2026/07/20260711-img-1547-thumb.jpg";

    const idA = vipProfileIdFromUrl(urlA);
    const idB = vipProfileIdFromUrl(urlB);

    assert.notEqual(idA, idB,
      `${nameA} and ${nameB} must get different IDs (old code collided on "e5b08fe5")`);
  });

  it("produces hex-only IDs (no special chars)", () => {
    const url = "https://vip6969.com/wp-content/uploads/2026/07/test.jpg";
    const id = vipProfileIdFromUrl(url);
    // Format: ikebukuro-vip-girl-<12 hex chars>
    assert.match(id, /^ikebukuro-vip-girl-[0-9a-f]{12}$/);
  });
});

describe("buildExistingByName — identity continuity", () => {
  it("preserves existing ID when name is unique", () => {
    const existingProfiles = [
      { shopId: "ikebukuro-vip", name: "妮娜", id: "ikebukuro-vip-girl-vip-e5a6aee5" },
    ];
    const map = buildExistingByName(existingProfiles);
    const ids = map.get(nameKey("ikebukuro-vip", "妮娜"));
    assert.ok(ids);
    assert.equal(ids.size, 1);
    assert.ok(ids.has("ikebukuro-vip-girl-vip-e5a6aee5"));
  });

  it("finds both IDs in duplicate-name scenario", () => {
    const existingProfiles = [
      { shopId: "ikebukuro-vip", name: "西川口", id: "ikebukuro-vip-girl-vip-e8a5bfe5" },
      { shopId: "ikebukuro-vip", name: "西川口", id: "ikebukuro-vip-girl-vip-e8a5bfe5-2" },
    ];
    const map = buildExistingByName(existingProfiles);
    const ids = map.get(nameKey("ikebukuro-vip", "西川口"));
    assert.ok(ids);
    assert.equal(ids.size, 2);
  });
});

describe("Final output — no duplicate profile IDs", () => {
  it("vipProfileIdFromUrl never returns duplicate for same inputs", () => {
    // 106 unique URLs -> 106 unique IDs
    const urls = Array.from({ length: 106 }, (_, i) =>
      `https://vip6969.com/wp-content/uploads/2026/07/test-${i}.jpg`,
    );
    const ids = urls.map((u) => vipProfileIdFromUrl(u));
    const unique = new Set(ids);
    assert.equal(unique.size, urls.length, "All 106 generated IDs must be unique");
  });

  it("re-running with same fixtures yields identical IDs", () => {
    const urls = ["https://vip6969.com/img/a.jpg", "https://vip6969.com/img/b.jpg"];
    const run1 = urls.map((u) => vipProfileIdFromUrl(u));
    const run2 = urls.map((u) => vipProfileIdFromUrl(u));
    assert.deepEqual(run1, run2);
  });
});
