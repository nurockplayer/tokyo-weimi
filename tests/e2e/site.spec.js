import { expect, test } from "@playwright/test";

test("renders localized homepage and profile gallery", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /20|歲|세|以上/ }).click().catch(() => {});

  await expect(page.locator(".profile-card")).toHaveCount(9);
  await page.locator("[data-language-select]").selectOption("en");
  await expect(page.locator(".hero h1")).toHaveText("Tokyo Weimi Angels");
  await expect(page.locator("#today h2")).toHaveText("Today's Schedule");

  await page.locator('[data-filter="japanese"]').click();
  await expect(page.locator(".profile-card")).toHaveCount(5);

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
