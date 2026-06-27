import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import type { SiteData } from "../../src/types.ts";

const siteData = JSON.parse(
  readFileSync(new URL("../../src/content/site-data.json", import.meta.url), "utf8"),
) as SiteData;
const todayProfileCount = siteData.profiles.filter((profile) => profile.isToday !== false).length;
const featuredProfileCount = siteData.profiles.filter((profile) => profile.isToday === false).length;
const japaneseTodayProfileCount = siteData.profiles.filter(
  (profile) => profile.tags.includes("日本人") || profile.title.includes("日本人"),
).filter((profile) => profile.isToday !== false).length;
const japaneseFeaturedProfileCount = siteData.profiles.filter(
  (profile) => profile.tags.includes("日本人") || profile.title.includes("日本人"),
).filter((profile) => profile.isToday === false).length;
const profileCountForShop = (shopId: string, today: boolean) =>
  siteData.profiles.filter((profile) => profile.shopId === shopId && (today ? profile.isToday !== false : profile.isToday === false)).length;
const visibleProfileCount = (today: number, featured: number) => today + featured;

test("renders localized homepage and profile gallery", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /20|歲|세|以上/ }).click().catch(() => {});

  await expect(page.locator("#today .profile-card")).toHaveCount(todayProfileCount);
  await expect(page.locator("#featured .profile-card")).toHaveCount(featuredProfileCount);
  await expect(page.locator(".profile-card")).toHaveCount(visibleProfileCount(todayProfileCount, featuredProfileCount));
  await expect(page.locator("[data-language-select]")).toHaveCount(0);
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator(".hero h1")).toHaveText("Tokyo Night Guide");
  await expect(page.locator("#today h2")).toHaveText("Today's Schedule");
  await expect(page.locator("[data-shop]")).toHaveCount(siteData.shops.length + 1);

  await page.locator('[data-shop="hikari888"]').click();
  await expect(page.locator("#today .profile-card")).toHaveCount(profileCountForShop("hikari888", true));
  await expect(page.locator("#featured .profile-card")).toHaveCount(profileCountForShop("hikari888", false));
  await page.locator('[data-shop="all"]').click();

  await page.locator('[data-filter="japanese"]').click();
  await expect(page.locator("#today .profile-card")).toHaveCount(japaneseTodayProfileCount);
  await expect(page.locator("#featured .profile-card")).toHaveCount(japaneseFeaturedProfileCount);

  const firstVisibleProfileCard = page.locator("[data-profile]").first();
  const firstVisibleProfileId = await firstVisibleProfileCard.getAttribute("data-profile");
  const firstVisibleProfile = siteData.profiles.find((profile) => profile.id === firstVisibleProfileId);
  expect(firstVisibleProfile).toBeTruthy();
  const expectedImageSrc = `/img/${encodeURIComponent(firstVisibleProfile!.image)}.jpg`;
  expect(expectedImageSrc).toBeTruthy();

  await firstVisibleProfileCard.click();
  await expect(page.locator(".profile-dialog")).toBeVisible();
  await expect(page.locator(".dialog-main-image")).toHaveAttribute("data-protected-media", "");
  await expect(page.locator(".dialog-main-image")).toHaveAttribute("src", expectedImageSrc!);
  await expect(page.locator("[data-gallery-open-original]")).toHaveCount(0);
});

test("renders profile videos from source URLs when available", async ({ page }) => {
  const videoProfile = siteData.profiles.find((profile) => profile.videos?.length);
  test.skip(!videoProfile, "No profile video is currently available in site data");

  await page.goto("/");
  await page.getByRole("button", { name: /20|歲|세|以上/ }).click().catch(() => {});
  await page.locator(`[data-profile="${videoProfile!.id}"]`).click();

  await expect(page.locator(".profile-dialog")).toBeVisible();
  await expect(page.locator(".dialog-video")).toHaveCount(videoProfile!.videos!.length);
  await expect(page.locator(".dialog-video").first()).toHaveAttribute("src", videoProfile!.videos![0]!);
});

test("renders support screenshots separately from profile gallery", async ({ page }) => {
  const screenshotProfile = siteData.profiles.find((profile) => profile.supportScreenshots?.length);
  test.skip(!screenshotProfile, "No support screenshots are currently available in site data");

  await page.goto("/");
  await page.getByRole("button", { name: /20|歲|세|以上/ }).click().catch(() => {});
  await page.locator(`[data-profile="${screenshotProfile!.id}"]`).click();

  await expect(page.locator(".profile-dialog")).toBeVisible();
  await expect(page.locator(".dialog-thumbs [data-gallery-image]")).toHaveCount(screenshotProfile!.gallery.length);
  await expect(page.locator(".support-screenshot-grid img")).toHaveCount(screenshotProfile!.supportScreenshots!.length);
});

test("localized static routes are generated", async ({ page }) => {
  await page.goto("/ja/");
  await expect(page).toHaveTitle("東京ナイトガイド｜複数店舗の出勤情報");
  await expect(page.locator(".hero h1")).toHaveText("東京ナイトガイド");

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
