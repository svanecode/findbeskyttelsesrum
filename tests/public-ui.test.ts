import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detailPageUrl = new URL("../src/app/beskyttelsesrum/[slug]/page.tsx", import.meta.url);
const nearbyPageUrl = new URL("../src/app/shelters/nearby/client.tsx", import.meta.url);
const dataPageUrl = new URL("../src/app/om-data/page.tsx", import.meta.url);

test("public shelter pages do not display internal review statuses", async () => {
  const publicUi = `${await readFile(detailPageUrl, "utf8")}\n${await readFile(nearbyPageUrl, "utf8")}`;

  assert.doesNotMatch(publicUi, /Afventer gennemgang/);
  assert.doesNotMatch(publicUi, /Midlertidigt lukket/);
  assert.doesNotMatch(publicUi, />Status:</);
  assert.doesNotMatch(publicUi, />Status</);
});

test("data overview uses only public reads", async () => {
  const dataPage = await readFile(dataPageUrl, "utf8");

  assert.match(dataPage, /getAppV2MunicipalitySummaries/);
  assert.match(dataPage, /getAppV2PublicShelterCount/);
  assert.match(dataPage, /getAppV2PublicDataFreshness/);
  assert.doesNotMatch(dataPage, /getLatestSuccessfulAppV2ImportRun/);
  assert.doesNotMatch(dataPage, /AppV2ImportRunSummary/);
});

test("data sources and freshness are only presented on the data page", async () => {
  const detailPage = await readFile(detailPageUrl, "utf8");
  const nearbyPage = await readFile(nearbyPageUrl, "utf8");
  const dataPage = await readFile(dataPageUrl, "utf8");

  assert.doesNotMatch(`${detailPage}\n${nearbyPage}`, /Datakilde|Data senest registreret|BBR og DAR/);
  assert.match(dataPage, /Hvor kommer data fra\?/);
  assert.match(dataPage, /Senest registreret/);
});
