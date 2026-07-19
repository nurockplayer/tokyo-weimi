import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  nameKey,
  buildExistingByName,
  vipProfileIdFromUrl,
  vipWpId,
  resolveVipProfileId,
} from "../tools/profile-identity.ts";

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

// === vipProfileIdFromUrl / vipWpId ===

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

describe("vipWpId", () => {
  it("produces hex-only ID with vip- prefix", () => {
    const url = "https://vip6969.com/wp-content/uploads/2026/07/test.jpg";
    assert.match(vipWpId(url), /^vip-[0-9a-f]{12}$/);
  });

  it("same url -> same wpId", () => {
    const url = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    assert.equal(vipWpId(url), vipWpId(url));
  });

  it("harmonized with vipProfileIdFromUrl (same hash source)", () => {
    const url = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    const expectedProfileId = `ikebukuro-vip-girl-${vipWpId(url).replace("vip-", "")}`;
    assert.equal(vipProfileIdFromUrl(url), expectedProfileId);
  });
});

// === resolveVipProfileId — full resolver ===

describe("resolveVipProfileId — full matching rules", () => {
  // Build a baseline matching the real PR scenario:
  //   - 妮娜: unique name → one existing ID
  //   - 小奈斯 + 小安妮: same prefix name, different images → two distinct existing IDs
  //   - 西川口: duplicate name (2nd entry already corrected to -2)
  const baselineProfiles = [
    { shopId: "ikebukuro-vip", name: "妮娜", id: "ikebukuro-vip-girl-vip-a", image: "img-a" },
    { shopId: "ikebukuro-vip", name: "小奈斯", id: "ikebukuro-vip-girl-vip-b", image: "img-b" },
    { shopId: "ikebukuro-vip", name: "小安妮", id: "ikebukuro-vip-girl-vip-c", image: "img-c" },
    { shopId: "ikebukuro-vip", name: "西川口", id: "ikebukuro-vip-girl-vip-d", image: "img-d" },
    { shopId: "ikebukuro-vip", name: "西川口", id: "ikebukuro-vip-girl-vip-d-2", image: "img-d2" },
  ];

  const byName = buildExistingByName(baselineProfiles);
  const byId = new Map(baselineProfiles.map((p) => [p.id, { image: p.image }]));

  it("unique existing name preserves its existing ID", () => {
    const id = resolveVipProfileId("妮娜", "", byName, byId, "https://vip6969.com/img/nina.jpg");
    assert.equal(id, "ikebukuro-vip-girl-vip-a");
  });

  it("same-name duplicate with matching primary image retains its existing ID", () => {
    // 小奈斯's card image matches the baseline → should reuse ikebukuro-vip-girl-vip-b
    const id = resolveVipProfileId("小奈斯", "img-b", byName, byId, "https://vip6969.com/img/nice.jpg");
    assert.equal(id, "ikebukuro-vip-girl-vip-b");
  });

  it("two same-name dupes with distinct images retain both distinct existing IDs", () => {
    const id1 = resolveVipProfileId("西川口", "img-d", byName, byId, "https://vip6969.com/img/d.jpg");
    const id2 = resolveVipProfileId("西川口", "img-d2", byName, byId, "https://vip6969.com/img/d2.jpg");
    assert.equal(id1, "ikebukuro-vip-girl-vip-d");
    assert.equal(id2, "ikebukuro-vip-girl-vip-d-2");
    assert.notEqual(id1, id2);
  });

  it("unmatched same-name duplicate receives a deterministic new ID", () => {
    // Build a local baseline where 小安妮 has TWO existing entries (same name,
    // different images) — that forces the resolver past the unique-name shortcut.
    const localByName = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "小安妮", id: "ikebukuro-vip-girl-anne-a" },
      { shopId: "ikebukuro-vip", name: "小安妮", id: "ikebukuro-vip-girl-anne-b" },
    ]);
    const localById = new Map([
      ["ikebukuro-vip-girl-anne-a", { image: "img-a" }],
      ["ikebukuro-vip-girl-anne-b", { image: "img-b" }],
    ]);
    // Pass img-z which matches neither → should fall through to fresh ID
    const url = "https://vip6969.com/wp-content/uploads/2026/07/new-card.jpg";
    const id = resolveVipProfileId("小安妮", "img-z", localByName, localById, url);
    assert.equal(id, vipProfileIdFromUrl(url));
  });

  it("rerunning same fixture produces identical assignments", () => {
    const cards: Array<{ name: string; imageId: string; url: string }> = [
      { name: "妮娜", imageId: "", url: "https://vip6969.com/img/nina.jpg" },
      { name: "小奈斯", imageId: "img-b", url: "https://vip6969.com/img/nice.jpg" },
      { name: "小安妮", imageId: "img-c", url: "https://vip6969.com/img/anne.jpg" },
    ];
    const run1 = cards.map((c) => resolveVipProfileId(c.name, c.imageId, byName, byId, c.url));
    const run2 = cards.map((c) => resolveVipProfileId(c.name, c.imageId, byName, byId, c.url));
    assert.deepEqual(run1, run2);
  });

  it("reversing card order produces identical card-to-ID assignments", () => {
    const cards = [
      { name: "小安妮", imageId: "img-c", url: "https://vip6969.com/img/anne.jpg" },
      { name: "小奈斯", imageId: "img-b", url: "https://vip6969.com/img/nice.jpg" },
    ];
    const fwd = cards.map((c) => resolveVipProfileId(c.name, c.imageId, byName, byId, c.url));
    const rev = cards.slice().reverse().map((c) =>
      resolveVipProfileId(c.name, c.imageId, byName, byId, c.url),
    );
    // Forward: 小安妮→c, 小奈斯→b; Reverse: 小奈斯→b, 小安妮→c
    assert.notDeepEqual(fwd, rev, "reversed order should produce reversed ID list");
    assert.deepEqual(fwd.slice().reverse(), rev,
      "card-to-ID assignment should match after reversing list order");
  });

  it("names sharing same first UTF-8 bytes do not collide", () => {
    // 小奈斯 = 小奈斯, 小安妮 = 小安妮
    // Both start with 小(U+5C0F) → UTF-8 E5 B0 8F. Under the old
    // Buffer(name).hex.slice(0,8) approach they both got "e5b08fe5".
    const id1 = resolveVipProfileId("小奈斯", "img-b", byName, byId, "https://vip6969.com/img/nice.jpg");
    const id2 = resolveVipProfileId("小安妮", "img-c", byName, byId, "https://vip6969.com/img/anne.jpg");
    assert.notEqual(id1, id2,
      "小奈斯 and 小安妮 must resolve to different IDs (old code collided on \"e5b08fe5\")");
  });

  it("all resolved profile IDs contain no duplicates", () => {
    const cards = [
      ["妮娜", "", "https://vip6969.com/img/nina.jpg"],
      ["小奈斯", "img-b", "https://vip6969.com/img/nice.jpg"],
      ["小安妮", "img-c", "https://vip6969.com/img/anne.jpg"],
      ["西川口", "img-d", "https://vip6969.com/img/d.jpg"],
      ["西川口", "img-d2", "https://vip6969.com/img/d2.jpg"],
      ["小骚逼", "", "https://vip6969.com/img/sao.jpg"],
      ["全新名字", "", "https://vip6969.com/img/brand-new.jpg"],
    ] as const;

    const ids = cards.map(([name, imageId, url]) =>
      resolveVipProfileId(name, imageId, byName, byId, url),
    );
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, "All resolved IDs must be unique");
  });

  it("unknown name with unknown image gets deterministic ID from URL", () => {
    const url = "https://vip6969.com/wp-content/uploads/2026/07/brand-new.jpg";
    const id = resolveVipProfileId("全新名字", "", byName, byId, url);
    assert.equal(id, vipProfileIdFromUrl(url));
  });

  it("same-name-and-same-card reappears with same ID", () => {
    // 小奈斯 with image img-b matched once, second call must give same result
    const a = resolveVipProfileId("小奈斯", "img-b", byName, byId, "https://vip6969.com/img/nice.jpg");
    const b = resolveVipProfileId("小奈斯", "img-b", byName, byId, "https://vip6969.com/img/nice.jpg");
    assert.equal(a, b);
  });
});
