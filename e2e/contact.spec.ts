import { expect, test } from "@playwright/test";

import { isolateRateLimit, quietThirdPartyRequests } from "./support";

const credentials = {
  reference: "FBR-2026-ABCD2345",
  accessKey: "2345-6789-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ",
};

const initialCase = {
  reference: credentials.reference,
  category: "privacy_rights",
  subject: "Anmodning om indsigt",
  status: "open",
  createdAt: "2026-08-22T08:00:00.000Z",
  updatedAt: "2026-08-22T08:00:00.000Z",
  responseDueAt: "2026-09-22T08:00:00.000Z",
  retentionUntil: "2028-08-22T08:00:00.000Z",
  messages: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      authorType: "visitor",
      message: "Jeg ønsker indsigt i de oplysninger, der vedrører mig.",
      createdAt: "2026-08-22T08:00:00.000Z",
    },
  ],
};

test.beforeEach(async ({ page }, testInfo) => {
  await isolateRateLimit(page, testInfo);
  await quietThirdPartyRequests(page);
});

test("kontaktportalen opretter og fortsætter en sag uden mail", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Det mailfri kontaktflow gennemføres i én browserprofil.");
  let createPayload: Record<string, unknown> | null = null;

  await page.route(/\/api\/app-v2\/privacy-contact\/cases$/, async (route) => {
    createPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true, ...credentials }),
    });
  });
  await page.route("**/api/app-v2/privacy-contact/cases/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, case: initialCase }),
    });
  });
  await page.route("**/api/app-v2/privacy-contact/cases/messages", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        case: {
          ...initialCase,
          messages: [
            ...initialCase.messages,
            {
              id: "10000000-0000-4000-8000-000000000002",
              authorType: "visitor",
              message: "Her er en præcisering.",
              createdAt: "2026-08-22T08:15:00.000Z",
            },
          ],
        },
      }),
    });
  });

  await page.goto("/kontakt");
  await page.getByLabel("Hvad handler det om?").selectOption("privacy_rights");
  await page.getByLabel("Emne").fill("Anmodning om indsigt");
  await page.getByLabel("Besked", { exact: true }).fill("Jeg ønsker indsigt i de oplysninger, der vedrører mig.");
  await page.getByRole("button", { name: "Send henvendelse" }).click();

  await expect(page.getByRole("heading", { name: "Henvendelsen er modtaget" })).toBeFocused();
  await expect(page.getByText(credentials.reference, { exact: true })).toBeVisible();
  await expect(page.getByText(credentials.accessKey, { exact: true })).toBeVisible();
  expect(createPayload).toMatchObject({
    category: "privacy_rights",
    subject: "Anmodning om indsigt",
  });
  expect(createPayload).not.toHaveProperty("email");
  expect(createPayload).not.toHaveProperty("contactEmail");

  await page.getByRole("button", { name: "Åbn sagen" }).click();
  await expect(page.getByRole("heading", { name: "Anmodning om indsigt" })).toBeFocused();
  await expect(page.getByText("Jeg ønsker indsigt i de oplysninger, der vedrører mig.")).toBeVisible();

  await page.getByLabel("Send en opfølgning").fill("Her er en præcisering.");
  await page.getByRole("button", { name: "Send opfølgning" }).click();
  await expect(page.getByText("Her er en præcisering.")).toBeVisible();
});

test("kontakt-API afviser ugyldige data før databaseskrivning", async ({ request }, testInfo) => {
  const response = await request.post("/api/app-v2/privacy-contact/cases", {
    headers: { "x-forwarded-for": `contact-invalid-${testInfo.testId}` },
    data: { category: "marketing", subject: "x", message: "for kort" },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ error: "Vælg en gyldig henvendelsestype." });
});
