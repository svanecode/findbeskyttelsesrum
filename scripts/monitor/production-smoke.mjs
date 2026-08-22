const baseUrl = (process.env.SMOKE_BASE_URL ?? "https://findbeskyttelsesrum.dk").replace(/\/$/, "");
const maximumImportAgeHours = Number(process.env.SMOKE_MAX_IMPORT_AGE_HOURS ?? "72");
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? "15000");
const expectedGitSha = process.env.SMOKE_EXPECTED_GIT_SHA?.trim() || null;
const allowStaleOperationalHeartbeat = process.env.SMOKE_ALLOW_STALE_OPERATIONAL_HEARTBEAT === "true";
let currentPublicDataRevision = null;

if (!Number.isFinite(maximumImportAgeHours) || maximumImportAgeHours <= 0) {
  throw new Error("SMOKE_MAX_IMPORT_AGE_HOURS skal være et positivt tal.");
}

async function request(url, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/json, text/html;q=0.9, */*;q=0.8",
      "User-Agent": "findbeskyttelsesrum-synthetic-monitor/1.0",
      ...init.headers,
    },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
}

async function requireOk(response, label) {
  if (!response.ok) {
    throw new Error(`${label} svarede med HTTP ${response.status}.`);
  }
  return response;
}

const checks = [
  {
    name: "Forside",
    run: async () => {
      const response = await requireOk(await request(`${baseUrl}/`), "Forsiden");
      const html = await response.text();
      if (!html.includes("Se registrerede beskyttelsesrum nær dig")) {
        throw new Error("Forsidens centrale overskrift mangler.");
      }
      const csp = response.headers.get("content-security-policy") ?? "";
      if (!csp.includes("script-src-attr 'none'") || csp.includes("https://*.vercel.app")) {
        throw new Error("Forsidens Content Security Policy er ikke den forventede, stramme version.");
      }
      return "HTTP 200, central tekst og stram CSP fundet";
    },
  },
  {
    name: "Crawler-metadata og browseroprydning",
    run: async () => {
      const [robotsResponse, sitemapResponse, serviceWorkerResponse] = await Promise.all([
        requireOk(await request(`${baseUrl}/robots.txt`), "Robots-filen"),
        requireOk(await request(`${baseUrl}/sitemap.xml`), "Sitemappet"),
        request(`${baseUrl}/sw.js`),
      ]);
      const [robots, sitemap] = await Promise.all([
        robotsResponse.text(),
        sitemapResponse.text(),
      ]);

      if (robots.includes("Disallow: /_next/")) {
        throw new Error("Robots-filen blokerer stadig Next.js' offentlige assets.");
      }
      if (!sitemap.includes("<lastmod>") || !sitemap.includes("/beskyttelsesrum/")) {
        throw new Error("Sitemappet mangler ændringsdatoer eller detaljesider.");
      }
      if (serviceWorkerResponse.status !== 404) {
        throw new Error(`Den udgåede service worker svarede med HTTP ${serviceWorkerResponse.status}.`);
      }

      return "robots, sitemap og fjernet service worker er korrekte";
    },
  },
  {
    name: "Database og datafriskhed",
    run: async () => {
      const response = await request(`${baseUrl}/api/health`);
      if (response.status !== 200 && response.status !== 503) {
        throw new Error(`Sundhedstjekket svarede med HTTP ${response.status}.`);
      }
      const payload = await response.json();
      const age = payload?.database?.dataAgeHours;
      const count = payload?.database?.shelterCount;
      const degradationReasons = Array.isArray(payload?.degradationReasons)
        ? payload.degradationReasons.filter((reason) => typeof reason === "string")
        : [];
      const onlyOperationalHeartbeatIsDegraded = degradationReasons.length > 0
        && degradationReasons.every((reason) => reason.startsWith("trusted_operational_heartbeat_"));
      const acceptedStatus = payload?.status === "ok"
        || (allowStaleOperationalHeartbeat && payload?.status === "degraded" && onlyOperationalHeartbeatIsDegraded);
      if (!acceptedStatus || !Number.isFinite(age) || !Number.isFinite(count) || count < 1) {
        throw new Error("Sundhedstjekket returnerede ufuldstændige data.");
      }
      if (age > maximumImportAgeHours) {
        throw new Error(`Seneste dataimport er ${age} timer gammel; grænsen er ${maximumImportAgeHours}.`);
      }
      if (!payload?.dataset?.publicationId || !payload?.dataset?.importRunId || payload?.dataset?.isConsistent !== true) {
        throw new Error("Sundhedstjekket mangler en konsistent publication/import-kobling.");
      }
      if (!payload?.dataset?.revision) {
        throw new Error("Sundhedstjekket mangler den offentlige datarevision.");
      }
      currentPublicDataRevision = payload.dataset.revision;
      const deployedGitSha = payload?.application?.gitSha;
      if (!deployedGitSha) {
        throw new Error("Sundhedstjekket mangler produktionens Git SHA.");
      }
      if (expectedGitSha && deployedGitSha !== expectedGitSha) {
        throw new Error(`Produktion kører ${deployedGitSha.slice(0, 7)}, men ${expectedGitSha.slice(0, 7)} var forventet.`);
      }
      if (!payload?.application?.deploymentId || !payload?.application?.builtAt) {
        throw new Error("Sundhedstjekket mangler deployment-ID eller byggetidspunkt.");
      }
      const operationalDetail = payload?.operations?.isFresh === true
        ? "betroet heartbeat er frisk"
        : "betroet heartbeat genoprettes af denne kørsel";
      return `${count.toLocaleString("da-DK")} registreringer, ${deployedGitSha.slice(0, 7)}, dataalder ${age} timer, ${operationalDetail}`;
    },
  },
  {
    name: "DAWA-adressesøgning",
    run: async () => {
      const url = new URL("https://api.dataforsyningen.dk/autocomplete");
      url.searchParams.set("q", "Rådhuspladsen 1, København");
      url.searchParams.set("per_side", "1");
      const response = await requireOk(await request(url), "DAWA");
      const payload = await response.json();
      if (!Array.isArray(payload) || payload.length < 1) {
        throw new Error("DAWA returnerede ingen adresseforslag.");
      }
      return "Adresseforslag modtaget";
    },
  },
  {
    name: "Nearby-API",
    run: async () => {
      const legacyGet = await request(`${baseUrl}/api/app-v2/nearby/grouped?lat=55.6761&lng=12.5683`);
      if (legacyGet.status !== 405) {
        throw new Error(`Nearby GET skulle være lukket med 405, men svarede ${legacyGet.status}.`);
      }
      const response = await requireOk(
        await request(`${baseUrl}/api/app-v2/nearby/grouped`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: 55.6761, lng: 12.5683, limit: 3 }),
        }),
        "Nearby-API'et",
      );
      const payload = await response.json();
      if (payload?.meta?.contract !== "app_v2_nearby_grouped_v1" || !Array.isArray(payload.results) || payload.results.length < 1) {
        throw new Error("Nearby-API'et returnerede en uventet kontrakt eller tomt resultat.");
      }
      return `${payload.results.length} resultater med korrekt kontrakt`;
    },
  },
  {
    name: "Landskortets marker-endpoint",
    run: async () => {
      const query = new URLSearchParams({
        format: "features",
        revision: currentPublicDataRevision ?? "missing",
        north: "58",
        south: "54",
        // Eastern Bornholm reaches roughly 15.15°E.
        east: "15.3",
        west: "8",
        zoom: "7",
      });
      const response = await requireOk(
        await request(`${baseUrl}/api/country-shelters?${query}`),
        "Marker-endpointet",
      );
      const payload = await response.json();
      if (
        payload?.contract !== "country-map-features-v2"
        || payload?.datasetRevision !== currentPublicDataRevision
        || !Array.isArray(payload.features)
        || payload.features.length < 1
        || payload.featureCount !== payload.features.length
        || payload.availableCount < payload.featureCount
        || payload.clusterCount < 1
      ) {
        throw new Error("Marker-endpointets klyngekontrakt eller optælling er ugyldig.");
      }
      return `${payload.availableCount.toLocaleString("da-DK")} registreringer som ${payload.featureCount.toLocaleString("da-DK")} kortobjekter`;
    },
  },
  {
    name: "Kommune",
    run: async () => {
      const response = await requireOk(await request(`${baseUrl}/kommune/kobenhavn`), "Kommunesiden");
      const html = await response.text();
      if (!html.includes("København")) throw new Error("Kommunesiden mangler kommunenavnet.");
      return "København-siden svarer korrekt";
    },
  },
  {
    name: "Dynamisk detaljeside",
    run: async () => {
      const sitemapResponse = await requireOk(await request(`${baseUrl}/sitemap.xml`), "Sitemappet");
      const sitemap = await sitemapResponse.text();
      const detailUrl = sitemap.match(/<loc>(https?:\/\/[^<]+\/beskyttelsesrum\/[^<]+)<\/loc>/)?.[1];
      if (!detailUrl) throw new Error("Sitemappet indeholder ingen detaljeside.");
      const detailPath = new URL(detailUrl).pathname;
      const response = await requireOk(await request(`${baseUrl}${detailPath}`), "Detaljesiden");
      const html = await response.text();
      if (!html.includes("BBR-registrering")) throw new Error("Detaljesiden mangler BBR-labelen.");
      if (!html.includes('"@type":"BreadcrumbList"')) {
        throw new Error("Detaljesiden mangler maskinlæsbare brødkrummer.");
      }
      return detailPath;
    },
  },
  {
    name: "Rapporteringsvalidering",
    run: async () => {
      const response = await request(`${baseUrl}/api/app-v2/shelter-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shelterId: "ugyldig", reportType: "ugyldig", message: "Ingen skrivning" }),
      });
      if (response.status !== 400) {
        throw new Error(`Rapporterings-API'et skulle afvise testdata med 400, men svarede ${response.status}.`);
      }
      return "Ugyldig rapport blev afvist uden skrivning";
    },
  },
  {
    name: "Anonym målingskanal",
    run: async () => {
      const accepted = await request(`${baseUrl}/api/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventName: "data_explanation_opened" }),
      });
      if (accepted.status !== 202) {
        throw new Error(`Målingskanalen skulle svare 202, men svarede ${accepted.status}.`);
      }

      const forgedHeartbeat = await request(`${baseUrl}/api/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventName: "monitor_heartbeat" }),
      });
      if (forgedHeartbeat.status !== 400) {
        throw new Error(`Et klient-heartbeat skulle afvises med 400, men svarede ${forgedHeartbeat.status}.`);
      }
      return "produktmåling accepteret, klient-heartbeat afvist";
    },
  },
];

const failures = [];
console.log(`Syntetisk kontrol af ${baseUrl}`);

for (const check of checks) {
  const startedAt = Date.now();
  try {
    const detail = await check.run();
    console.log(`PASS  ${check.name} (${Date.now() - startedAt} ms) — ${detail}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ name: check.name, message });
    console.error(`FAIL  ${check.name} (${Date.now() - startedAt} ms) — ${message}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} af ${checks.length} kontroller fejlede.`);
  process.exitCode = 1;
} else {
  console.log(`\nAlle ${checks.length} kontroller bestod.`);
}
