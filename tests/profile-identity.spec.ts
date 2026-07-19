import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
  // Baseline:
  //   妮娜: unique name → one existing ID
  //   小奈斯 + 小安妮: same prefix name, different images → two distinct existing IDs
  //   西川口: duplicate name (2nd entry with -2 suffix)
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
    // 妮娜 has 1 baseline entry and 1 current card
    const id = resolveVipProfileId("妮娜", "", 1, byName, byId, "https://vip6969.com/img/nina.jpg");
    assert.equal(id, "ikebukuro-vip-girl-vip-a");
  });

  it("same-name duplicate with matching primary image retains its existing ID", () => {
    const id = resolveVipProfileId("小奈斯", "img-b", 1, byName, byId, "https://vip6969.com/img/nice.jpg");
    assert.equal(id, "ikebukuro-vip-girl-vip-b");
  });

  it("two same-name dupes with distinct images retain both distinct existing IDs", () => {
    const id1 = resolveVipProfileId("西川口", "img-d", 2, byName, byId, "https://vip6969.com/img/d.jpg");
    const id2 = resolveVipProfileId("西川口", "img-d2", 2, byName, byId, "https://vip6969.com/img/d2.jpg");
    assert.equal(id1, "ikebukuro-vip-girl-vip-d");
    assert.equal(id2, "ikebukuro-vip-girl-vip-d-2");
    assert.notEqual(id1, id2);
  });

  it("unmatched same-name duplicate receives a deterministic new ID", () => {
    const localByName = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "小安妮", id: "ikebukuro-vip-girl-anne-a" },
      { shopId: "ikebukuro-vip", name: "小安妮", id: "ikebukuro-vip-girl-anne-b" },
    ]);
    const localById = new Map([
      ["ikebukuro-vip-girl-anne-a", { image: "img-a" }],
      ["ikebukuro-vip-girl-anne-b", { image: "img-b" }],
    ]);
    // currentNameCount=2 prevents unique-name fallback
    const url = "https://vip6969.com/wp-content/uploads/2026/07/new-card.jpg";
    const id = resolveVipProfileId("小安妮", "img-z", 2, localByName, localById, url);
    assert.equal(id, vipProfileIdFromUrl(url));
  });

  // === New tests for one-baseline-to-multiple-current ===

  it("baseline has 1 X, current has 2 X, one image matches", () => {
    // Baseline: one profile named "yoyo" with image "old-img"
    // Current: two cards named "yoyo", one with "old-img", one with "new-img"
    const localByName = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "yoyo", id: "ikebukuro-vip-girl-yoyo-old" },
    ]);
    const localById = new Map([
      ["ikebukuro-vip-girl-yoyo-old", { image: "old-img" }],
    ]);

    // Card with matching image keeps old ID
    const idMatch = resolveVipProfileId("yoyo", "old-img", 2, localByName, localById, "https://vip6969.com/img/old.jpg");
    assert.equal(idMatch, "ikebukuro-vip-girl-yoyo-old");

    // Card with non-matching image gets its own URL-based ID (not reused)
    const urlNew = "https://vip6969.com/img/new.jpg";
    const idNoMatch = resolveVipProfileId("yoyo", "new-img", 2, localByName, localById, urlNew);
    assert.equal(idNoMatch, vipProfileIdFromUrl(urlNew));
    assert.notEqual(idNoMatch, "ikebukuro-vip-girl-yoyo-old",
      "second X card must not reuse the sole baseline ID");
  });

  it("baseline has 1 X, current has 2 X, neither image matches", () => {
    const localByName = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "yoyo", id: "ikebukuro-vip-girl-yoyo-old" },
    ]);
    const localById = new Map([
      ["ikebukuro-vip-girl-yoyo-old", { image: "old-img" }],
    ]);

    const urlA = "https://vip6969.com/img/a.jpg";
    const urlB = "https://vip6969.com/img/b.jpg";
    const idA = resolveVipProfileId("yoyo", "img-a", 2, localByName, localById, urlA);
    const idB = resolveVipProfileId("yoyo", "img-b", 2, localByName, localById, urlB);

    assert.equal(idA, vipProfileIdFromUrl(urlA));
    assert.equal(idB, vipProfileIdFromUrl(urlB));
    assert.notEqual(idA, idB, "both cards must get distinct IDs");
    assert.notEqual(idA, "ikebukuro-vip-girl-yoyo-old",
      "baseline ID must not be reused when no image matches");
  });

  it("baseline and current each have 1 X: unique-name fallback keeps old ID", () => {
    const localByName = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "yoyo", id: "ikebukuro-vip-girl-yoyo-old" },
    ]);
    const localById = new Map([
      ["ikebukuro-vip-girl-yoyo-old", { image: "old-img" }],
    ]);
    // currentNameCount=1 allows unique-name fallback even without image match
    const id = resolveVipProfileId("yoyo", "new-img", 1, localByName, localById, "https://vip6969.com/img/whatever.jpg");
    assert.equal(id, "ikebukuro-vip-girl-yoyo-old");
  });

  it("reverse input order preserves each card-to-ID assignment", () => {
    const localByName = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "yoyo", id: "ikebukuro-vip-girl-yoyo-old" },
    ]);
    const localById = new Map([
      ["ikebukuro-vip-girl-yoyo-old", { image: "old-img" }],
    ]);

    const cards = [
      { name: "yoyo", imageId: "old-img", url: "https://vip6969.com/img/a.jpg" },
      { name: "yoyo", imageId: "new-img", url: "https://vip6969.com/img/b.jpg" },
    ];

    // Forward
    const fwd = cards.map((c) =>
      resolveVipProfileId(c.name, c.imageId, 2, localByName, localById, c.url),
    );
    // Reversed
    const rev = cards.slice().reverse().map((c) =>
      resolveVipProfileId(c.name, c.imageId, 2, localByName, localById, c.url),
    );

    // Card-to-ID mapping must match after reversing list order
    // Forward: card0→fwd[0]=old, card1→fwd[1]=URL-based
    // Reverse: card1→rev[0]=URL-based, card0→rev[1]=old
    assert.equal(fwd[0], rev[1], "card0 must get same ID both orders");
    assert.equal(fwd[1], rev[0], "card1 must get same ID both orders");
  });

  it("final output contains no duplicate IDs", () => {
    const cards: Array<[string, string, string]> = [
      ["妮娜", "", "https://vip6969.com/img/nina.jpg"],
      ["小奈斯", "img-b", "https://vip6969.com/img/nice.jpg"],
      ["小安妮", "img-c", "https://vip6969.com/img/anne.jpg"],
      ["西川口", "img-d", "https://vip6969.com/img/d.jpg"],
      ["西川口", "img-d2", "https://vip6969.com/img/d2.jpg"],
      ["小骚逼", "", "https://vip6969.com/img/sao.jpg"],
      ["全新名字", "", "https://vip6969.com/img/brand-new.jpg"],
    ];

    const ids = cards.map(([name, imageId, url]) =>
      resolveVipProfileId(name, imageId, 1, byName, byId, url),
    );
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, "All resolved IDs must be unique");
  });

  it("unknown name with unknown image gets deterministic ID from URL", () => {
    const url = "https://vip6969.com/wp-content/uploads/2026/07/brand-new.jpg";
    const id = resolveVipProfileId("全新名字", "", 1, byName, byId, url);
    assert.equal(id, vipProfileIdFromUrl(url));
  });

  it("same-name-and-same-card reappears with same ID", () => {
    const a = resolveVipProfileId("小奈斯", "img-b", 1, byName, byId, "https://vip6969.com/img/nice.jpg");
    const b = resolveVipProfileId("小奈斯", "img-b", 1, byName, byId, "https://vip6969.com/img/nice.jpg");
    assert.equal(a, b);
  });
});

// === Translation key integrity (no network) ===

describe("translation keys after ID rename", () => {
  const oldKey = "ikebukuro-vip-girl-vip-e5b08fe5";
  const newKey = "ikebukuro-vip-girl-vip-e5b08fe5-2";

  it("old key still has translation entries (used by 小奈斯)", () => {
    const trans: Record<string, Record<string, unknown>> = JSON.parse(
      readFileSync("src/content/profile-translations.json", "utf8"),
    );
    for (const lang of ["zh-Hans", "ja", "ko", "en"]) {
      assert.ok(trans[lang]?.[oldKey], `Old key ${oldKey} must still have ${lang} translation`);
    }
  });

  it("new key (-2) has translation entries (for 小安妮)", () => {
    const trans: Record<string, Record<string, unknown>> = JSON.parse(
      readFileSync("src/content/profile-translations.json", "utf8"),
    );
    for (const lang of ["zh-Hans", "ja", "ko", "en"]) {
      assert.ok(trans[lang]?.[newKey], `New key ${newKey} must have ${lang} translation`);
    }
  });

  it("new key translation content matches old key content", () => {
    const trans: Record<string, Record<string, { title: string; tags: string[]; summary: string }>> = JSON.parse(
      readFileSync("src/content/profile-translations.json", "utf8"),
    );
    for (const lang of ["zh-Hans", "ja", "ko", "en"]) {
      const oldVal = trans[lang]?.[oldKey];
      const newVal = trans[lang]?.[newKey];
      assert.ok(oldVal, `old key must have ${lang} entry`);
      assert.ok(newVal, `new key must have ${lang} entry`);
      assert.equal(newVal.title, oldVal.title, `${lang} title must match`);
      assert.deepEqual(newVal.tags, oldVal.tags, `${lang} tags must match`);
      assert.equal(newVal.summary, oldVal.summary, `${lang} summary must match`);
    }
  });
});
