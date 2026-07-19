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
  it("same name + same URL → same ID", () => {
    const url = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    const a = vipProfileIdFromUrl("小奈斯", url);
    const b = vipProfileIdFromUrl("小奈斯", url);
    assert.equal(a, b);
  });

  it("different names, same URL → different IDs", () => {
    const url = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    const idA = vipProfileIdFromUrl("小奈斯", url);
    const idB = vipProfileIdFromUrl("小安妮", url);
    assert.notEqual(idA, idB,
      "different names sharing the same image URL must get different fallback IDs");
  });

  it("different URLs → different IDs (same name)", () => {
    const urlA = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    const urlB = "https://vip6969.com/wp-content/uploads/2026/07/20260711-img-1547-thumb.jpg";
    assert.notEqual(vipProfileIdFromUrl("小奈斯", urlA), vipProfileIdFromUrl("小奈斯", urlB));
  });

  it("reversing order preserves same-card-to-ID mapping", () => {
    const url = "https://vip6969.com/img/shared.jpg";
    // Forward
    const fwd = [
      vipProfileIdFromUrl("名字A", url),
      vipProfileIdFromUrl("名字B", url),
    ];
    // Reverse order of calls
    const rev = [
      vipProfileIdFromUrl("名字B", url),
      vipProfileIdFromUrl("名字A", url),
    ];
    assert.equal(fwd[0], rev[1], "名字A→url must be same regardless of call order");
    assert.equal(fwd[1], rev[0], "名字B→url must be same regardless of call order");
  });
});

describe("vipWpId", () => {
  it("produces hex-only ID with vip- prefix", () => {
    assert.match(vipWpId("小奈斯", "https://vip6969.com/wp-content/uploads/2026/07/test.jpg"), /^vip-[0-9a-f]{12}$/);
  });

  it("same name + same url -> same wpId", () => {
    const url = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    assert.equal(vipWpId("小奈斯", url), vipWpId("小奈斯", url));
  });

  it("different names same url -> different wpId", () => {
    const url = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    assert.notEqual(vipWpId("小奈斯", url), vipWpId("小安妮", url));
  });

  it("harmonized with vipProfileIdFromUrl (same hash source)", () => {
    const url = "https://vip6969.com/wp-content/uploads/2026/07/20260714-img-1663-thumb.jpg";
    const name = "小奈斯";
    const expectedProfileId = `ikebukuro-vip-girl-${vipWpId(name, url).replace("vip-", "")}`;
    assert.equal(vipProfileIdFromUrl(name, url), expectedProfileId);
  });
});

// === resolveVipProfileId — full resolver ===

describe("resolveVipProfileId — full matching rules", () => {
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
    const url = "https://vip6969.com/wp-content/uploads/2026/07/new-card.jpg";
    const id = resolveVipProfileId("小安妮", "img-z", 2, localByName, localById, url);
    assert.equal(id, vipProfileIdFromUrl("小安妮", url));
  });

  it("baseline has 1 X, current has 2 X, one image matches", () => {
    const localByName = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "yoyo", id: "ikebukuro-vip-girl-yoyo-old" },
    ]);
    const localById = new Map([
      ["ikebukuro-vip-girl-yoyo-old", { image: "old-img" }],
    ]);

    const idMatch = resolveVipProfileId("yoyo", "old-img", 2, localByName, localById, "https://vip6969.com/img/old.jpg");
    assert.equal(idMatch, "ikebukuro-vip-girl-yoyo-old");

    const urlNew = "https://vip6969.com/img/new.jpg";
    const idNoMatch = resolveVipProfileId("yoyo", "new-img", 2, localByName, localById, urlNew);
    assert.equal(idNoMatch, vipProfileIdFromUrl("yoyo", urlNew));
    assert.notEqual(idNoMatch, "ikebukuro-vip-girl-yoyo-old");
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

    assert.equal(idA, vipProfileIdFromUrl("yoyo", urlA));
    assert.equal(idB, vipProfileIdFromUrl("yoyo", urlB));
    assert.notEqual(idA, idB, "both cards must get distinct IDs");
    assert.notEqual(idA, "ikebukuro-vip-girl-yoyo-old");
  });

  it("baseline and current each have 1 X: unique-name fallback keeps old ID", () => {
    const localByName = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "yoyo", id: "ikebukuro-vip-girl-yoyo-old" },
    ]);
    const localById = new Map([
      ["ikebukuro-vip-girl-yoyo-old", { image: "old-img" }],
    ]);
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

    const fwd = cards.map((c) =>
      resolveVipProfileId(c.name, c.imageId, 2, localByName, localById, c.url),
    );
    const rev = cards.slice().reverse().map((c) =>
      resolveVipProfileId(c.name, c.imageId, 2, localByName, localById, c.url),
    );

    assert.equal(fwd[0], rev[1]);
    assert.equal(fwd[1], rev[0]);
  });

  // === Same-image-different-name ===

  it("same image URL, different names → different fallback IDs", () => {
    const localByName = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "阿花", id: "ikebukuro-vip-girl-ahua" },
    ]);
    const localById = new Map([
      ["ikebukuro-vip-girl-ahua", { image: "img-orig" }],
    ]);

    // Two new cards with different names but the same image URL
    const sharedUrl = "https://vip6969.com/img/shared-selfie.jpg";
    const id1 = resolveVipProfileId("小璇", "", 2, localByName, localById, sharedUrl);
    const id2 = resolveVipProfileId("小彤", "", 2, localByName, localById, sharedUrl);

    assert.notEqual(id1, id2,
      "two different-name cards sharing the same image URL must get distinct fallback IDs");
  });

  it("same-image same-name remains deterministic", () => {
    const localByName = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "阿花", id: "ikebukuro-vip-girl-ahua" },
    ]);
    const localById = new Map([
      ["ikebukuro-vip-girl-ahua", { image: "img-orig" }],
    ]);

    const sharedUrl = "https://vip6969.com/img/shared-selfie.jpg";
    const a = resolveVipProfileId("小璇", "", 2, localByName, localById, sharedUrl);
    const b = resolveVipProfileId("小璇", "", 2, localByName, localById, sharedUrl);
    assert.equal(a, b);
  });

  it("existing different-name profiles sharing an image keep legacy IDs", () => {
    // Baseline: two different-name profiles happen to use the same image
    // (this is the scenario where image-only fallback would collide)
    const localByName2 = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "阿花", id: "ikebukuro-vip-girl-ahua" },
      { shopId: "ikebukuro-vip", name: "小草", id: "ikebukuro-vip-girl-xiaocao" },
    ]);
    const localById2 = new Map([
      ["ikebukuro-vip-girl-ahua", { image: "img-shared" }],
      ["ikebukuro-vip-girl-xiaocao", { image: "img-shared" }],
    ]);

    // Exact image match should find the correct baseline ID (priority 1)
    const idA = resolveVipProfileId("阿花", "img-shared", 1, localByName2, localById2, "https://vip6969.com/img/shared.jpg");
    const idB = resolveVipProfileId("小草", "img-shared", 1, localByName2, localById2, "https://vip6969.com/img/shared.jpg");

    assert.equal(idA, "ikebukuro-vip-girl-ahua");
    assert.equal(idB, "ikebukuro-vip-girl-xiaocao");
  });

  it("reverse same-image different-name order preserves mapping", () => {
    const localByName = buildExistingByName([
      { shopId: "ikebukuro-vip", name: "阿花", id: "ikebukuro-vip-girl-ahua" },
    ]);
    const localById = new Map([
      ["ikebukuro-vip-girl-ahua", { image: "img-orig" }],
    ]);

    const sharedUrl = "https://vip6969.com/img/shared-selfie.jpg";
    const names = ["小璇", "小彤"];

    const fwd = names.map((n) => resolveVipProfileId(n, "", 2, localByName, localById, sharedUrl));
    const rev = names.slice().reverse().map((n) => resolveVipProfileId(n, "", 2, localByName, localById, sharedUrl));

    assert.equal(fwd[0], rev[1], "小璇 → sharedUrl must be same regardless of call order");
    assert.equal(fwd[1], rev[0], "小彤 → sharedUrl must be same regardless of call order");
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
    assert.equal(id, vipProfileIdFromUrl("全新名字", url));
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
