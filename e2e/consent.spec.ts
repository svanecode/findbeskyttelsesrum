import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  isolateRateLimit,
  mockAddressSearch,
  mockNearby,
  quietThirdPartyRequests,
  selectedAddressLabel,
} from "./support";

// A first-time visitor: no stored consent choice.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }, testInfo) => {
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

const consentDialog = (page: Page) => page.getByRole("dialog", { name: "Cookies og samtykke" });

test("første besøg viser samtykkedialogen med ligeværdige valg", async ({ page }) => {
  await page.goto("/");
  const dialog = consentDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Tillad alle" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Kun nødvendige" })).toBeVisible();

  // Escape must not dismiss it without an answer.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});

test("Tillad alle gemmer valget, så dialogen ikke vises igen", async ({ page }) => {
  await page.goto("/");
  await consentDialog(page).getByRole("button", { name: "Tillad alle" }).click();
  await expect(consentDialog(page)).toBeHidden();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("findbeskyttelsesrum.consent.v1") ?? "null"));
  expect(stored).toMatchObject({ version: 1, statistics: true });
  expect(stored).not.toHaveProperty("offline");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Find beskyttelsesrum nær dig" })).toBeVisible();
  await expect(consentDialog(page)).toBeHidden();
});

test("Tilpas valg gemmer kun det, der er slået til, og offlinekopien er ikke et samtykkevalg", async ({ page }) => {
  await page.goto("/");
  const dialog = consentDialog(page);
  await dialog.getByRole("button", { name: "Tilpas valg" }).click();
  await expect(dialog.getByRole("checkbox")).toHaveCount(1);
  await dialog.getByRole("checkbox", { name: /Anonym statistik/ }).check();
  await dialog.getByRole("button", { name: "Gem valg" }).click();
  await expect(dialog).toBeHidden();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("findbeskyttelsesrum.consent.v1") ?? "null"));
  expect(stored).toMatchObject({ statistics: true });
});

test("privatlivssiden kan læses uden dialog, og valget kan ændres dér", async ({ page }) => {
  await page.goto("/privatliv#samtykke");
  await expect(consentDialog(page)).toHaveCount(0);
  const section = page.locator("#samtykke");
  await expect(section.getByText("Du har ikke truffet et valg endnu.")).toBeVisible();

  await section.getByRole("button", { name: "Tillad alle" }).click();
  await expect(section.getByText(/anonym statistik tilladt\. Dit valg er gemt\./)).toBeVisible();

  await section.getByRole("button", { name: "Kun nødvendige" }).click();
  await expect(section.getByText(/anonym statistik fravalgt/)).toBeVisible();
  await expect(section.getByRole("checkbox", { name: /Anonym statistik/ })).not.toBeChecked();
});

test("administrationen viser ikke samtykkedialogen", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(consentDialog(page)).toHaveCount(0);
});

test("Kun nødvendige sender ingen målinger og installerer ingen offlinekopi", { tag: "@full-stack" }, async ({ page }) => {
  const metricRequests: string[] = [];
  await page.route("**/api/metrics", async (route) => {
    metricRequests.push(route.request().postData() ?? "");
    await route.fulfill({ status: 202 });
  });
  await mockAddressSearch(page);
  await mockNearby(page);

  await page.goto("/");
  await consentDialog(page).getByRole("button", { name: "Kun nødvendige" }).click();
  await expect(consentDialog(page)).toBeHidden();

  const addressInput = page.getByRole("combobox", { name: "Eller søg på en adresse" });
  await addressInput.fill("Rådhuspladsen 1");
  await page.getByRole("option", { name: selectedAddressLabel }).click();
  await expect(page.getByText(/120 pladser/)).toBeVisible();

  // Longer than the idle delay before analytics and the offline worker would start.
  await page.waitForTimeout(5000);
  expect(metricRequests).toEqual([]);
  const scripts = await page.evaluate(() => Array.from(document.scripts, (script) => script.src).filter((src) => /insights|analytics/.test(src)));
  expect(scripts).toEqual([]);
  const registrations = await page.evaluate(async () => ("serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0));
  expect(registrations).toBe(0);
});
