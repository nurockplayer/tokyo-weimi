import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import type { SiteData } from "../../src/types.ts";

const siteData = JSON.parse(
  readFileSync(new URL("../../src/content/site-data.json", import.meta.url), "utf8"),
) as SiteData;
const profileCount = siteData.profiles.length;
const japaneseProfileCount = siteData.profiles.filter(
  (profile) => profile.tags.includes("日本人") || profile.title.includes("日本人"),
).length;

test("renders localized homepage and profile gallery", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /20|歲|세|以上/ }).click().catch(() => {});

  await expect(page.locator(".profile-card")).toHaveCount(profileCount);
  await expect(page.locator("[data-language-select]")).toHaveCount(0);
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator(".hero h1")).toHaveText("Tokyo Weimi Angels");
  await expect(page.locator("#today h2")).toHaveText("Today's Schedule");

  await page.locator('[data-filter="japanese"]').click();
  await expect(page.locator(".profile-card")).toHaveCount(japaneseProfileCount);

  await page.locator("[data-profile]").first().click();
  await expect(page.locator(".profile-dialog")).toBeVisible();
  await expect(page.locator(".dialog-main-image")).toHaveAttribute("data-protected-media", "");
  await expect(page.locator("[data-gallery-open-original]")).toHaveCount(0);
});

test("localized static routes are generated", async ({ page }) => {
  await page.goto("/ja/");
  await expect(page).toHaveTitle("東京ヴィーミーエンジェル｜予約情報");
  await expect(page.locator(".hero h1")).toHaveText("東京ヴィーミーエンジェル");

  await page.goto("/sitemap.xml");
  await expect.poll(() => page.content()).toContain("https://tokyo-weimi.pages.dev/ja/");
});

test("age gate includes the same language switcher", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".age-panel")).toBeVisible();
  await expect(page.locator(".age-panel .section-kicker")).toHaveText("年齡確認");
  await expect(page.locator("#age-title")).toHaveText("請確認你已達法定年齡");
  await expect(page.locator(".age-panel [data-language-option]")).toHaveCount(5);
  await expect(page.locator(".age-panel [data-language-icon]")).toBeVisible();

  await page.locator(".age-panel").getByRole("button", { name: "English" }).click();

  await expect(page.locator(".age-panel .section-kicker")).toHaveText("Age Check");
  await expect(page.locator("#age-title")).toHaveText("Please confirm you are of legal age");
  await expect(page.getByRole("button", { name: "I am 20 or older" })).toBeVisible();
});

test("traditional chinese hero title stays on one line on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/zh-hant/");

  const metrics = await page.locator(".hero h1").evaluate((heading) => {
    const rect = heading.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(heading).lineHeight);
    return { height: rect.height, lineHeight, scrollWidth: heading.scrollWidth, clientWidth: heading.clientWidth };
  });

  expect(metrics.height).toBeLessThan(metrics.lineHeight * 1.2);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
});
