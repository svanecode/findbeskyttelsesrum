import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  installNearbySearchContext,
  isolateRateLimit,
  knownShelterSlug,
  mockDawa,
  mockNearby,
  quietThirdPartyRequests,
  selectedAddressLabel,
} from "./support";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoAccessibilityViolations(page: Page, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();

  await testInfo.attach("axe-resultat", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });

  const fingerprints = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target),
  }));
  expect(fingerprints).toEqual([]);
}

test.beforeEach(async ({ page }, testInfo) => {
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

test("forsiden består automatiske WCAG A/AA-kontroller", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Se registrerede beskyttelsesrum nær dig" })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test("åben autocomplete består automatiske WCAG A/AA-kontroller", async ({ page }, testInfo) => {
  await mockDawa(page);
  await page.goto("/");
  await page.getByRole("combobox", { name: "Adresse, by eller postnummer" }).fill("Rådhuspladsen 1");
  await expect(page.getByRole("option", { name: selectedAddressLabel })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test("resultatsiden består automatiske WCAG A/AA-kontroller", async ({ page }, testInfo) => {
  await installNearbySearchContext(page);
  await mockNearby(page);
  await page.goto("/shelters/nearby");
  await expect(page.getByText("120 BBR-registrerede pladser")).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test("mobilmenuen består kontrollen i åben tilstand", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "Mobilmenuen findes kun i mobilprofilerne.");
  await page.goto("/");
  await page.getByRole("button", { name: "Åbn menu" }).click();
  await expect(page.getByRole("navigation", { name: "Hovednavigation" })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test("detaljesiden og den åbne rapportformular består kontrollen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Den databasebaserede detaljekontrol køres én gang.");
  await page.goto(`/beskyttelsesrum/${knownShelterSlug}`);
  await expect(page.getByRole("heading", { name: /Registrering ved/ })).toBeVisible();
  await page.getByRole("button", { name: "Rapportér fejl ved registreringen" }).click();
  await expect(page.getByRole("heading", { name: "Rapportér en mulig fejl" })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test("kommuneoversigten består automatiske WCAG A/AA-kontroller", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Den databasebaserede oversigt køres én gang.");
  await page.goto("/kommune");
  await expect(page.getByRole("heading", { name: "Kommuneoversigt" })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});

test("kontaktformularen består automatiske WCAG A/AA-kontroller", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Kontaktformularen kontrolleres i én browserprofil.");
  await page.goto("/kontakt");
  await expect(page.getByRole("heading", { name: "Kontakt uden e-mail" })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo);
});
