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
const clientErrorApiUrl = new URL("../src/app/api/errors/route.ts", import.meta.url);
const proxyUrl = new URL("../src/proxy.ts", import.meta.url);
const privacyPageUrl = new URL("../src/app/privatliv/page.tsx", import.meta.url);
const footerUrl = new URL("../src/components/GlobalFooter.tsx", import.meta.url);
const countryMapUrl = new URL("../src/app/kort/country-map.tsx", import.meta.url);
const countryMapPageUrl = new URL("../src/app/kort/page.tsx", import.meta.url);
const municipalityMapUrl = new URL("../src/app/kommune/[slug]/kommune-map.tsx", import.meta.url);
const healthApiUrl = new URL("../src/app/api/health/route.ts", import.meta.url);
const manifestUrl = new URL("../public/site.webmanifest", import.meta.url);
const layoutUrl = new URL("../src/app/layout.tsx", import.meta.url);
const nextConfigUrl = new URL("../next.config.js", import.meta.url);
const mapProviderUrl = new URL("../src/lib/maps/provider.js", import.meta.url);
const mapFallbackUrl = new URL("../src/components/MapUnavailableNotice.tsx", import.meta.url);
const countryMarkerApiUrl = new URL("../src/app/api/country-shelters/route.ts", import.meta.url);
const municipalityExperienceUrl = new URL("../src/app/kommune/[slug]/kommune-experience.tsx", import.meta.url);
const municipalityOverviewUrl = new URL("../src/app/kommune/page.tsx", import.meta.url);
const appV2QueriesUrl = new URL("../src/lib/supabase/app-v2-queries.ts", import.meta.url);
const adminPageUrl = new URL("../src/app/admin/page.tsx", import.meta.url);
const adminActionsUrl = new URL("../src/app/admin/actions.ts", import.meta.url);
const adminOperationsPageUrl = new URL("../src/app/admin/drift/page.tsx", import.meta.url);
const adminOperationsActionsUrl = new URL("../src/app/admin/drift/actions.ts", import.meta.url);
const adminAuthUrl = new URL("../src/lib/moderation/auth.ts", import.meta.url);
const adminMfaUrl = new URL("../src/app/admin/mfa/mfa-panel.tsx", import.meta.url);
const authCallbackUrl = new URL("../src/app/auth/callback/route.ts", import.meta.url);
const searchContextUrl = new URL("../src/lib/nearby/search-context.ts", import.meta.url);
const errorSanitizerUrl = new URL("../src/lib/errors/sanitize-client-error.ts", import.meta.url);

test("public shelter pages do not display internal review statuses", async () => {
  const publicUi = `${await readFile(detailPageUrl, "utf8")}\n${await readFile(nearbyPageUrl, "utf8")}`;

  assert.doesNotMatch(publicUi, /Afventer gennemgang/);
  assert.doesNotMatch(publicUi, /Midlertidigt lukket/);
  assert.doesNotMatch(publicUi, />Status:</);
  assert.doesNotMatch(publicUi, />Status</);
});

test("data overview uses bounded aggregate read models", async () => {
  const dataPage = await readFile(dataPageUrl, "utf8");

  assert.match(dataPage, /getAppV2PublicMunicipalitySummaryCount/);
  assert.match(dataPage, /getAppV2PublicDataStats/);
  assert.match(dataPage, /getAppV2PublicDataFunnel/);
  assert.match(dataPage, /Aktive rækker fra datakilden/);
  assert.match(dataPage, /Med koordinater på landskortet/);
  assert.doesNotMatch(dataPage, /getLatestSuccessfulAppV2ImportRun/);
  assert.doesNotMatch(dataPage, /AppV2ImportRunSummary/);
});

test("the homepage does not contain the removed personal example address", async () => {
  const addressSearch = await readFile(addressSearchUrl, "utf8");

  assert.doesNotMatch(addressSearch, /Elsted Byvej/i);
  assert.match(addressSearch, /Skriv vejnavn, by eller postnummer/);
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
  assert.match(reportApi, /consumeDistributedRateLimit/);
  assert.match(reportApi, /admin\.rpc\("submit_public_shelter_report"/);
  assert.doesNotMatch(reportApi, /\.from\("shelter_reports"\)\.insert/);
});

test("expensive public APIs use shared rate limits without globally limiting page requests", async () => {
  const nearbyApi = await readFile(nearbyApiUrl, "utf8");
  const countryMapApi = await readFile(countryMarkerApiUrl, "utf8");
  const metricsApi = await readFile(new URL("../src/app/api/metrics/route.ts", import.meta.url), "utf8");
  const reportApi = await readFile(reportApiUrl, "utf8");
  const clientErrorApi = await readFile(clientErrorApiUrl, "utf8");
  const proxy = await readFile(proxyUrl, "utf8");

  assert.match(nearbyApi, /consumeDistributedRateLimit/);
  assert.match(countryMapApi, /consumeDistributedRateLimit/);
  assert.match(metricsApi, /consumeDistributedRateLimit/);
  assert.match(reportApi, /consumeDistributedRateLimit/);
  assert.match(clientErrorApi, /consumeDistributedRateLimit/);
  assert.doesNotMatch(proxy, /rateLimit\(/);
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
  assert.match(privacyPage, /kræver netforbindelse/);
  assert.match(privacyPage, /tilbyder ikke en offlinekopi/);
  assert.match(privacyPage, /Dataansvarlig og kontakt/);
  assert.match(privacyPage, /Retsgrundlaget/);
  assert.match(privacyPage, /Dine rettigheder/);
  assert.match(privacyPage, /24 måneder/);
  assert.match(privacyPage, /5 år/);
  assert.match(dataPage, /id="rapportering"/);
});

test("search context is short-lived and has a memory-only storage fallback", async () => {
  const source = await readFile(searchContextUrl, "utf8");

  assert.match(source, /60 \* 60 \* 1000/);
  assert.match(source, /volatileNearbySearchContext/);
  assert.match(source, /sessionStorage\.setItem/);
  assert.match(source, /parseNearbySearchContext\(volatileNearbySearchContext\)/);
  assert.doesNotMatch(source, /12 \* 60 \* 60/);
});

test("client errors enforce origin, body and location privacy boundaries", async () => {
  const [route, sanitizer] = await Promise.all([
    readFile(clientErrorApiUrl, "utf8"),
    readFile(errorSanitizerUrl, "utf8"),
  ]);

  assert.match(route, /isSameOrigin/);
  assert.match(route, /maximumBodyBytes/);
  assert.match(route, /new TextEncoder\(\)\.encode\(rawText\)\.byteLength/);
  assert.match(route, /parseAndSanitizeClientErrorReport/);
  assert.doesNotMatch(route, /userAgent|userId|ERROR_WEBHOOK/);
  assert.match(sanitizer, /allowedReportKeys/);
  assert.match(sanitizer, /allowedContextKeys/);
  assert.match(sanitizer, /danishCoordinatePairPattern/);
  assert.match(sanitizer, /danishAddressPattern/);
  assert.match(sanitizer, /maximumStackLines/);
});

test("the site is explicitly a browser-based online service rather than an offline PWA", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8")) as Record<string, unknown>;
  const layout = await readFile(layoutUrl, "utf8");

  assert.equal(manifest.display, "browser");
  assert.equal("orientation" in manifest, false);
  assert.doesNotMatch(layout, /appleWebApp/);
});

test("production CSP keeps only the free OSM tile host and required public services", async () => {
  const config = await readFile(nextConfigUrl, "utf8");
  const mapProvider = await readFile(mapProviderUrl, "utf8");

  assert.match(config, /osmTileOrigin/);
  assert.match(mapProvider, /https:\/\/tile\.openstreetmap\.org/);
  assert.match(config, /developmentConnections = environment === 'development'/);
  assert.match(config, /script-src-attr 'none'/);
  assert.doesNotMatch(config, /https:\/\/\*\.vercel\.app/);
  assert.doesNotMatch(config, /stadiamaps|maptiler|cartocdn|nominatim|dawa\.aws|raw\.githubusercontent/);
  assert.doesNotMatch(config, /https:\/\/\*\.tile\.openstreetmap\.org/);
});

test("all Leaflet maps use the current non-subdomain OpenStreetMap tile URL", async () => {
  const mapProvider = await readFile(mapProviderUrl, "utf8");
  const mapSourceFiles = [
    await readFile(nearbyPageUrl, "utf8"),
    await readFile(countryMapUrl, "utf8"),
    await readFile(municipalityMapUrl, "utf8"),
  ];
  const mapSources = mapSourceFiles.join("\n");

  assert.doesNotMatch(mapSources, /\{s\}\.tile\.openstreetmap\.org/);
  assert.doesNotMatch(mapSources, /https:\/\/tile\.openstreetmap\.org/);
  for (const source of mapSourceFiles) assert.match(source, /<ResilientMapTileLayer/);
  assert.match(mapProvider, /https:\/\/tile\.openstreetmap\.org/);
  assert.match(mapProvider, /OpenStreetMap<\/a> contributors/);
});

test("zero-cost maps defer tile requests and keep a list fallback", async () => {
  const nearbyPage = await readFile(nearbyPageUrl, "utf8");
  const municipalityExperience = await readFile(municipalityExperienceUrl, "utf8");
  const fallback = await readFile(mapFallbackUrl, "utf8");

  assert.match(nearbyPage, /shouldRenderMap/);
  assert.match(nearbyPage, /mobileView === 'map' \|\| isDesktopMap/);
  assert.match(municipalityExperience, /IntersectionObserver/);
  assert.match(municipalityExperience, /mapActivated/);
  assert.match(fallback, /Kortbaggrunden er ikke tilgængelig/);
  assert.match(fallback, /Adresser og registreringer virker stadig/);
});

test("the national map requests bounded server clusters without low-zoom sampling", async () => {
  const countryMap = await readFile(countryMapUrl, "utf8");
  const markerApi = await readFile(countryMarkerApiUrl, "utf8");

  assert.match(countryMap, /MapViewportEvents/);
  assert.match(countryMap, /format: "features"/);
  assert.match(countryMap, /revision: datasetRevision/);
  assert.match(countryMap, /north: String\(viewport\.north\)/);
  assert.match(countryMap, /ServerClusterLayer/);
  assert.match(countryMap, /createBufferedCountryMapViewport/);
  assert.match(markerApi, /getAppV2PublicCountryMapFeatures/);
  assert.match(markerApi, /getAppV2PublicDataRevision/);
  assert.match(markerApi, /quantizeCountryMapViewport/);
  assert.match(markerApi, /COUNTRY_MAP_REVISION_CHANGED/);
  assert.match(markerApi, /INVALID_COUNTRY_MAP_REQUEST/);
  assert.doesNotMatch(markerApi, /getAppV2PublicCountryShelterMarkers/);
});

test("municipality pages use bounded summaries and allow ISR", async () => {
  const [overview, dataPage, queries] = await Promise.all([
    readFile(municipalityOverviewUrl, "utf8"),
    readFile(dataPageUrl, "utf8"),
    readFile(appV2QueriesUrl, "utf8"),
  ]);

  assert.match(overview, /getAppV2MunicipalitySummaries/);
  assert.match(overview, /export const revalidate = 3600/);
  assert.doesNotMatch(overview, /force-dynamic/);
  assert.match(dataPage, /getAppV2PublicMunicipalitySummaryCount/);
  assert.match(queries, /municipality_summary_public_v1/);
  assert.doesNotMatch(queries, /getPublicShelterAggregatesByMunicipalityId/);
  assert.doesNotMatch(queries, /municipalityStatsPageSize/);
});

test("nearby accepts only bounded POST bodies", async () => {
  const nearbyApi = await readFile(nearbyApiUrl, "utf8");

  assert.match(nearbyApi, /maximumBodyBytes = 2_048/);
  assert.match(nearbyApi, /new TextEncoder\(\)\.encode\(rawBody\)\.byteLength/);
  assert.match(nearbyApi, /status: 405/);
  assert.match(nearbyApi, /response\.headers\.set\("Allow", "POST"\)/);
  assert.doesNotMatch(nearbyApi, /handleNearbyRequest\(request, request\.nextUrl\.searchParams/);
});

test("the national map page loads aggregate stats instead of all markers", async () => {
  const mapPage = await readFile(countryMapPageUrl, "utf8");

  assert.match(mapPage, /getAppV2PublicDataStats/);
  assert.doesNotMatch(mapPage, /getAppV2PublicCountryShelterMarkers/);
  assert.doesNotMatch(mapPage, /markers\.reduce/);
});

test("the health endpoint exposes verifiable deployment and publication identity", async () => {
  const healthApi = await readFile(healthApiUrl, "utf8");

  assert.match(healthApi, /getAppV2PublicDataStats/);
  assert.match(healthApi, /getAppV2CurrentDatasetPublication/);
  assert.match(healthApi, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(healthApi, /VERCEL_DEPLOYMENT_ID/);
  assert.match(healthApi, /SITE_BUILD_TIMESTAMP/);
  assert.match(healthApi, /public_data_is_stale/);
  assert.match(healthApi, /publication_import_link_is_inconsistent/);
  assert.match(healthApi, /getOperationalHealth/);
  assert.match(healthApi, /trusted_operational_heartbeat_is_stale/);
  assert.doesNotMatch(healthApi, /SUPABASE_SECRET_KEY/);
  assert.match(healthApi, /Cache-Control/);
  assert.match(healthApi, /no-store/);
});

test("the private moderator flow requires GitHub, an allowlisted identity and MFA", async () => {
  const adminPage = await readFile(adminPageUrl, "utf8");
  const adminActions = await readFile(adminActionsUrl, "utf8");
  const adminAuth = await readFile(adminAuthUrl, "utf8");
  const adminMfa = await readFile(adminMfaUrl, "utf8");
  const authCallback = await readFile(authCallbackUrl, "utf8");

  assert.match(authCallback, /exchangeCodeForSession/);
  assert.match(authCallback, /identity\.provider === "github"/);
  assert.match(authCallback, /link_moderator_identity_v1/);
  assert.match(adminAuth, /get_current_moderator_profile_v1/);
  assert.match(adminAuth, /assuranceLevel !== "aal2"/);
  assert.match(adminMfa, /challengeAndVerify/);
  assert.match(adminMfa, /factorType: "totp"/);
  assert.match(adminPage, /list_shelter_reports_for_moderation_v1|Moderationskø/);
  assert.match(adminActions, /requireModerator\(true\)/);
  assert.match(adminActions, /moderate_shelter_report_v1/);
  assert.doesNotMatch(adminPage, /SUPABASE_SECRET_KEY/);
});

test("private data operations reauthorize rollback and require owner confirmation", async () => {
  const operationsPage = await readFile(adminOperationsPageUrl, "utf8");
  const operationsActions = await readFile(adminOperationsActionsUrl, "utf8");

  assert.match(operationsPage, /getImportOperations/);
  assert.match(operationsPage, /profile\.role === "owner"/);
  assert.match(operationsPage, /Skriv GENDAN/);
  assert.match(operationsActions, /requireModerator\(true\)/);
  assert.match(operationsActions, /profile\.role !== "owner"/);
  assert.match(operationsActions, /confirmation !== "GENDAN"/);
  assert.match(operationsActions, /rollback_dataset_publication_v1/);
  assert.doesNotMatch(operationsPage, /SUPABASE_SECRET_KEY/);
});

test("privacy copy documents mail-free contact and bounded retention", async () => {
  const privacyPage = await readFile(privacyPageUrl, "utf8");

  assert.match(privacyPage, /Der indsamles ikke navn eller e-mailadresse/);
  assert.match(privacyPage, /sagsnummer og en tilfældig adgangskode/);
  assert.match(privacyPage, /SHA-256-kontrolværdi/);
  assert.match(privacyPage, /højst 12 måneder efter lukningen/);
  assert.match(privacyPage, /fritekstnote redigeres senest 24 måneder/);
  assert.match(privacyPage, /auditspor slettes efter 5 år/);
  assert.doesNotMatch(privacyPage, /mailto:/);
});
