#!/usr/bin/env tsx

/**
 * Failure-case tests for content-contract assertions.
 *
 * Uses plain try/catch — no test framework required.
 */

import { assertContentSnapshotV1, assertContentManifestV1 } from "../src/content-contract.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

function expectThrow(fn: () => void, expectedSubstring: string): void {
  let thrown = false;
  try {
    fn();
  } catch (err) {
    thrown = true;
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes(expectedSubstring)) {
      throw new Error(
        `Expected error containing "${expectedSubstring}", got "${msg}"`,
      );
    }
  }
  if (!thrown) {
    throw new Error(`Expected an error but none was thrown`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyTranslations(): Record<string, Record<string, unknown>> {
  return {
    "zh-Hant": {},
    "zh-Hans": {},
    ja: {},
    ko: {},
    en: {},
  };
}

function translationsWith(lang: string, key: string, value: unknown): Record<string, Record<string, unknown>> {
  const t = emptyTranslations();
  t[lang] = { [key]: value };
  return t;
}

function validManifest(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    version: "v1",
    generatedAt: "2026-07-18T00:00:00.000Z",
    snapshotPath: "snapshots/test.json",
    sha256: "a".repeat(64),
    ...overrides,
  };
}

function baseData(): Record<string, unknown> {
  return {
    shops: [
      { id: "shop-a", name: "Shop A" },
    ],
    contact: { phone: "000", line: "", secondaryLine: "", lineQr: "", secondaryLineQr: "", area: "", hours: "" },
    heroImages: [],
    profiles: [
      { id: "p1", shopId: "shop-a", name: "", title: "", date: "", image: "img1", gallery: ["img1"], origin: "", age: "", height: "", weight: "", cup: "", tags: [], price: "", summary: "" },
    ],
    pricePlans: [],
    hotels: [],
  };
}

function validSnapshot(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    version: "v1",
    generatedAt: "2026-07-18T00:00:00.000Z",
    data: baseData(),
    imageMap: { img1: "https://example.com/img1.jpg" },
    profileTranslations: emptyTranslations(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Snapshot failure cases
// ---------------------------------------------------------------------------

console.log("\nSnapshot failure cases:");

test("duplicate profile ids", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      data: {
        ...baseData(),
        profiles: [
          { id: "dup", shopId: "shop-a", name: "", title: "", date: "", image: "img1", gallery: ["img1"], origin: "", age: "", height: "", weight: "", cup: "", tags: [], price: "", summary: "" },
          { id: "dup", shopId: "shop-a", name: "", title: "", date: "", image: "img1", gallery: ["img1"], origin: "", age: "", height: "", weight: "", cup: "", tags: [], price: "", summary: "" },
        ],
      },
    });
    assertContentSnapshotV1(snap);
  }, "duplicate id");
});

test("profile references missing image id", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      data: {
        ...baseData(),
        profiles: [
          { id: "p1", shopId: "shop-a", name: "", title: "", date: "", image: "missing-img", gallery: ["missing-img"], origin: "", age: "", height: "", weight: "", cup: "", tags: [], price: "", summary: "" },
        ],
      },
    });
    assertContentSnapshotV1(snap);
  }, "references missing image id");
});

test("translation references missing profile id", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      profileTranslations: translationsWith("en", "non-existent-profile", { title: "T", tags: ["t"], summary: "S" }),
    });
    assertContentSnapshotV1(snap);
  }, "references missing profile");
});

test("translation tags not a string array", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      profileTranslations: translationsWith("en", "p1", { title: "T", tags: [123], summary: "S" }),
    });
    assertContentSnapshotV1(snap);
  }, "must be a string");
});

test("invalid generatedAt", () => {
  expectThrow(() => {
    const snap = validSnapshot({ generatedAt: "not-a-date" });
    assertContentSnapshotV1(snap);
  }, "must be a valid date string");
});

test("shops not an array", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      data: {
        ...baseData(),
        shops: "not-an-array",
      },
    });
    assertContentSnapshotV1(snap);
  }, "shops must be an array");
});

test("shop missing id", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      data: {
        ...baseData(),
        shops: [{ name: "No Id" }],
      },
    });
    assertContentSnapshotV1(snap);
  }, "shops[0].id must be a string");
});

test("shop missing name", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      data: {
        ...baseData(),
        shops: [{ id: "shop-a" }],
      },
    });
    assertContentSnapshotV1(snap);
  }, "shops[0].name must be a string");
});

test("contact not an object", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      data: {
        ...baseData(),
        contact: "not-an-object",
      },
    });
    assertContentSnapshotV1(snap);
  }, "contact must be an object");
});

test("contact missing phone", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      data: {
        ...baseData(),
        contact: { line: "", lineQr: "", area: "", hours: "" },
      },
    });
    assertContentSnapshotV1(snap);
  }, "contact.phone must be a string");
});

test("contact missing line", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      data: {
        ...baseData(),
        contact: { phone: "000", lineQr: "", area: "", hours: "" },
      },
    });
    assertContentSnapshotV1(snap);
  }, "contact.line must be a string");
});

test("missing language bucket in translations", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      profileTranslations: {},
    });
    assertContentSnapshotV1(snap);
  }, "zh-Hant must exist");
});

test("hotels not an array", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      data: {
        ...baseData(),
        hotels: "not-an-array",
      },
    });
    assertContentSnapshotV1(snap);
  }, "hotels must be an array");
});

test("pricePlans not an array", () => {
  expectThrow(() => {
    const snap = validSnapshot({
      data: {
        ...baseData(),
        pricePlans: "not-an-array",
      },
    });
    assertContentSnapshotV1(snap);
  }, "pricePlans must be an array");
});

// ---------------------------------------------------------------------------
// Manifest failure cases
// ---------------------------------------------------------------------------

console.log("\nManifest failure cases:");

test("snapshotPath contains ..", () => {
  expectThrow(() => {
    const m = validManifest({ snapshotPath: "snapshots/../etc/passwd" });
    assertContentManifestV1(m);
  }, 'must not contain ".."');
});

test("non-64-char sha256", () => {
  expectThrow(() => {
    const m = validManifest({ sha256: "short" });
    assertContentManifestV1(m);
  }, "must be 64 lowercase hex characters");
});

test("invalid manifest generatedAt", () => {
  expectThrow(() => {
    const m = validManifest({ generatedAt: "bad-date" });
    assertContentManifestV1(m);
  }, "must be a valid date string");
});

// ---------------------------------------------------------------------------
// Valid cases (confidence checks)
// ---------------------------------------------------------------------------

console.log("\nValid confidence checks:");

test("valid manifest passes", () => {
  assertContentManifestV1(validManifest());
});

test("valid snapshot passes", () => {
  assertContentSnapshotV1(validSnapshot());
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"-".repeat(40)}`);
if (failed > 0) {
  console.error(`Result: ${passed} passed, ${failed} FAILED`);
  process.exit(1);
} else {
  console.log(`Result: ${passed} passed, 0 failed`);
}
