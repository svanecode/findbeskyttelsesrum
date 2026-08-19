const baseUrl = (process.env.SMOKE_BASE_URL ?? "https://findbeskyttelsesrum.dk").replace(/\/$/, "");
const maximumImportAgeHours = Number(process.env.SMOKE_MAX_IMPORT_AGE_HOURS ?? "72");
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? "15000");

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
      return "HTTP 200 og central tekst fundet";
    },
  },
  {
    name: "Database og datafriskhed",
    run: async () => {
      const response = await requireOk(await request(`${baseUrl}/api/health`), "Sundhedstjekket");
      const payload = await response.json();
      const age = payload?.database?.dataAgeHours;
      const count = payload?.database?.shelterCount;
      if (payload?.status !== "ok" || !Number.isFinite(age) || !Number.isFinite(count) || count < 1) {
        throw new Error("Sundhedstjekket returnerede ufuldstændige data.");
      }
      if (age > maximumImportAgeHours) {
        throw new Error(`Seneste dataimport er ${age} timer gammel; grænsen er ${maximumImportAgeHours}.`);
      }
      return `${count.toLocaleString("da-DK")} registreringer, dataalder ${age} timer`;
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
      const response = await requireOk(await request(`${baseUrl}/api/country-shelters`), "Marker-endpointet");
      const payload = await response.json();
      if (!Array.isArray(payload?.shelters) || payload.shelters.length < 1 || payload.count !== payload.shelters.length) {
        throw new Error("Marker-endpointets antal eller payload er ugyldig.");
      }
      return `${payload.count.toLocaleString("da-DK")} markører`;
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
      const response = await requireOk(await request(detailUrl), "Detaljesiden");
      const html = await response.text();
      if (!html.includes("BBR-registrering")) throw new Error("Detaljesiden mangler BBR-labelen.");
      return new URL(detailUrl).pathname;
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
