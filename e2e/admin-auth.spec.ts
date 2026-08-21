import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { isolateRateLimit, quietThirdPartyRequests } from "./support";

test.beforeEach(async ({ page }, testInfo) => {
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

test("moderationskøen sender en anonym bruger til privat login", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Auth-indgangen kontrolleres i én browserprofil.");

  await page.goto("/admin");

  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Moderatorlogin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log ind med GitHub" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
});

test("datadrift sender en anonym bruger til privat login", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Auth-indgangen kontrolleres i én browserprofil.");

  await page.goto("/admin/drift");

  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Moderatorlogin" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
