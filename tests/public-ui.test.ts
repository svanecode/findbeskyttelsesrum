import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detailPageUrl = new URL("../src/app/beskyttelsesrum/[slug]/page.tsx", import.meta.url);
const nearbyPageUrl = new URL("../src/app/shelters/nearby/client.tsx", import.meta.url);
const nearbyApiUrl = new URL("../src/app/api/app-v2/nearby/grouped/route.ts", import.meta.url);
const dataPageUrl = new URL("../src/app/om-data/page.tsx", import.meta.url);
const homePageUrl = new URL("../src/app/page.tsx", import.meta.url);
const addressSearchUrl = new URL("../src/components/AddressSearchDAWA.tsx", import.meta.url);
const registrationNoticeUrl = new URL("../src/components/RegistrationNotice.tsx", import.meta.url);
const reportFormUrl = new URL("../src/components/ReportShelterIssue.tsx", import.meta.url);
const reportApiUrl = new URL("../src/app/api/app-v2/shelter-reports/route.ts", import.meta.url);
const privacyPageUrl = new URL("../src/app/privatliv/page.tsx", import.meta.url);
const footerUrl = new URL("../src/components/GlobalFooter.tsx", import.meta.url);
const countryMapUrl = new URL("../src/app/kort/country-map.tsx", import.meta.url);
const municipalityMapUrl = new URL("../src/app/kommune/[slug]/kommune-map.tsx", import.meta.url);
const healthApiUrl = new URL("../src/app/api/health/route.ts", import.meta.url);

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
  assert.match(dataPage, /getAppV2PublicTotalShelterCapacity/);
  assert.match(dataPage, /getAppV2PublicDataFreshness/);
  assert.doesNotMatch(dataPage, /getLatestSuccessfulAppV2ImportRun/);
  assert.doesNotMatch(dataPage, /AppV2ImportRunSummary/);
});

test("core search surfaces explain registration limits and data freshness", async () => {
  const homePage = await readFile(homePageUrl, "utf8");
  const detailPage = await readFile(detailPageUrl, "utf8");
  const nearbyPage = await readFile(nearbyPageUrl, "utf8");
  const dataPage = await readFile(dataPageUrl, "utf8");
  const registrationNotice = await readFile(registrationNoticeUrl, "utf8");

  assert.match(homePage, /ikke en garanti for offentlig adgang/);
  assert.match(nearbyPage, /RegistrationNotice/);
  assert.match(registrationNotice, /Adgang ikke bekræftet/);
  assert.match(registrationNotice, /Stand ikke verificeret/);
  assert.match(detailPage, /Datakilde/);
  assert.match(detailPage, /Seneste dataimport/);
  assert.match(dataPage, /Hvor kommer data fra\?/);
  assert.match(dataPage, /Seneste dataimport/);
});

test("new searches use tab-local state and a URL without address or coordinates", async () => {
  const addressSearch = await readFile(addressSearchUrl, "utf8");
  const nearbyPage = await readFile(nearbyPageUrl, "utf8");
  const nearbyApi = await readFile(nearbyApiUrl, "utf8");

  assert.match(addressSearch, /saveNearbySearchContext/);
  assert.match(addressSearch, /router\.push\('\/shelters\/nearby'\)/);
  assert.doesNotMatch(addressSearch, /URLSearchParams/);
  assert.doesNotMatch(addressSearch, /router\.push\(`\/shelters\/nearby\?/);
  assert.match(nearbyPage, /method: 'POST'/);
  assert.match(nearbyPage, /body: JSON\.stringify\(\{ lat, lng, limit: nearbyResultLimit \}\)/);
  assert.doesNotMatch(nearbyPage, /nearby\/grouped\?/);
  assert.match(nearbyApi, /export async function POST/);
});

test("nearby results use explicit actions and a mobile list-map switch", async () => {
  const nearbyPage = await readFile(nearbyPageUrl, "utf8");
  const articleStart = nearbyPage.indexOf("<article");
  const articleOpeningEnd = nearbyPage.indexOf(">\n", articleStart);
  const resultCardOpening = nearbyPage.slice(articleStart, articleOpeningEnd);

  assert.match(nearbyPage, /role="tablist"/);
  assert.match(nearbyPage, /aria-controls="nearby-list-panel"/);
  assert.match(nearbyPage, /aria-controls="nearby-map-panel"/);
  assert.match(nearbyPage, /Adgang ikke bekræftet · Stand ikke verificeret/);
  assert.match(nearbyPage, /<details/);
  assert.match(nearbyPage, />Vis på kort</);
  assert.match(nearbyPage, /aria-label="Valgt registrering"/);
  assert.doesNotMatch(resultCardOpening, /tabIndex=/);
  assert.doesNotMatch(resultCardOpening, /onClick=/);
});

test("detail pages expose contact, moderated reporting and related registrations", async () => {
  const detailPage = await readFile(detailPageUrl, "utf8");
  const reportForm = await readFile(reportFormUrl, "utf8");
  const reportApi = await readFile(reportApiUrl, "utf8");

  assert.match(detailPage, /Vis på kort/);
  assert.match(detailPage, /Find kontakt til/);
  assert.match(detailPage, /ReportShelterIssue/);
  assert.match(detailPage, /getAppV2PublicRelatedShelters/);
  assert.match(reportForm, /moderationskø/);
  assert.match(reportForm, /ændres ikke automatisk/i);
  assert.match(reportApi, /isSameOrigin/);
  assert.match(reportApi, /rateLimit/);
  assert.match(reportApi, /admin\.rpc\("submit_public_shelter_report"/);
  assert.doesNotMatch(reportApi, /\.from\("shelter_reports"\)\.insert/);
});

test("the compact footer links to accurate privacy and reporting guidance", async () => {
  const privacyPage = await readFile(privacyPageUrl, "utf8");
  const footer = await readFile(footerUrl, "utf8");
  const dataPage = await readFile(dataPageUrl, "utf8");

  assert.match(footer, /\/privatliv/);
  assert.match(footer, /\/om-data#rapportering/);
  assert.match(privacyPage, /fanesession/);
  assert.match(privacyPage, /queryparametre og fragmenter/);
  assert.match(privacyPage, /privat moderationskø/);
  assert.match(dataPage, /id="rapportering"/);
});

test("all Leaflet maps use the current non-subdomain OpenStreetMap tile URL", async () => {
  const mapSources = [
    await readFile(nearbyPageUrl, "utf8"),
    await readFile(countryMapUrl, "utf8"),
    await readFile(municipalityMapUrl, "utf8"),
  ].join("\n");

  assert.doesNotMatch(mapSources, /\{s\}\.tile\.openstreetmap\.org/);
  assert.equal(mapSources.match(/https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/g)?.length, 3);
});

test("the health endpoint checks only the public read model", async () => {
  const healthApi = await readFile(healthApiUrl, "utf8");

  assert.match(healthApi, /getAppV2PublicShelterCount/);
  assert.match(healthApi, /getAppV2PublicDataFreshness/);
  assert.doesNotMatch(healthApi, /createAppV2AdminClient/);
  assert.doesNotMatch(healthApi, /SUPABASE_SECRET_KEY/);
  assert.match(healthApi, /Cache-Control/);
  assert.match(healthApi, /no-store/);
});
