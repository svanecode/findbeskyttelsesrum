type CliOptions = {
  baseUrl: string;
  sample: string;
  shape: "row" | "grouped" | "shadow";
  eligibility: "legacy-capacity" | "source-application-code" | "none";
  latitude: number;
  longitude: number;
  radiusMeters: number;
  limit: number;
  candidateLimit: number;
};

const coordinateSamples = {
  copenhagen: {
    label: "Copenhagen",
    latitude: 55.6761,
    longitude: 12.5683,
  },
  aarhus: {
    label: "Aarhus",
    latitude: 56.1629,
    longitude: 10.2039,
  },
  lemvig: {
    label: "Lemvig",
    latitude: 56.5486,
    longitude: 8.3102,
  },
  odense: {
    label: "Odense",
    latitude: 55.4038,
    longitude: 10.4024,
  },
  esbjerg: {
    label: "Esbjerg",
    latitude: 55.4765,
    longitude: 8.4594,
  },
} satisfies Record<string, { label: string; latitude: number; longitude: number }>;

const defaultOptions: CliOptions = {
  baseUrl: "http://localhost:3000",
  sample: "copenhagen",
  shape: "row",
  eligibility: "legacy-capacity",
  latitude: 55.6761,
  longitude: 12.5683,
  radiusMeters: 50_000,
  limit: 10,
  candidateLimit: 500,
};

function getFlagValue(flag: string) {
  const flagIndex = process.argv.findIndex((value) => value === flag);

  return flagIndex === -1 ? undefined : process.argv[flagIndex + 1];
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function parseNumberFlag(flag: string, fallback: number) {
  const raw = getFlagValue(flag);

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be followed by a finite number.`);
  }

  return parsed;
}

function parseIntegerFlag(flag: string, fallback: number) {
  const parsed = parseNumberFlag(flag, fallback);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be followed by a positive integer.`);
  }

  return parsed;
}

function getOptions(): CliOptions {
  const baseUrl = getFlagValue("--base-url") ?? defaultOptions.baseUrl;
  const sampleName = getFlagValue("--sample") ?? defaultOptions.sample;
  const shape = getFlagValue("--shape") ?? defaultOptions.shape;
  const eligibility = getFlagValue("--eligibility") ?? defaultOptions.eligibility;
  const sample = coordinateSamples[sampleName as keyof typeof coordinateSamples];

  if (!sample) {
    throw new Error(`Unknown --sample "${sampleName}". Expected one of: ${Object.keys(coordinateSamples).join(", ")}.`);
  }

  if (shape !== "row" && shape !== "grouped" && shape !== "shadow") {
    throw new Error('--shape must be "row", "grouped", or "shadow".');
  }

  if (eligibility !== "legacy-capacity" && eligibility !== "source-application-code" && eligibility !== "none") {
    throw new Error('--eligibility must be "legacy-capacity", "source-application-code", or "none".');
  }

  return {
    baseUrl,
    sample: sampleName,
    shape,
    eligibility,
    latitude: parseNumberFlag("--lat", sample.latitude),
    longitude: parseNumberFlag("--lng", sample.longitude),
    radiusMeters: parseIntegerFlag("--radius", defaultOptions.radiusMeters),
    limit: parseIntegerFlag("--limit", defaultOptions.limit),
    candidateLimit: parseIntegerFlag("--candidate-limit", defaultOptions.candidateLimit),
  };
}

function printHelp() {
  console.log(`Read-only app_v2 nearby API probe.

Usage:
  npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample copenhagen
  npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --lat 55.6761 --lng 12.5683

Options:
  --base-url          Base URL for the app. Defaults to http://localhost:3000.
  --sample            Named coordinate sample: ${Object.keys(coordinateSamples).join(", ")}.
  --shape             API shape: row, grouped, or shadow. Defaults to ${defaultOptions.shape}.
  --eligibility       Grouped API eligibility: legacy-capacity, source-application-code, or none. Defaults to legacy-capacity.
  --lat               Latitude. Overrides --sample latitude when provided.
  --lng               Longitude. Overrides --sample longitude when provided.
  --radius            Radius in meters. Defaults to 50000.
  --limit             Result limit. Defaults to 10.
  --candidate-limit   Candidate row limit used by the app_v2 nearby read model. Defaults to 500.
  --help              Print this help text.

The script only calls /api/app-v2/nearby, /api/app-v2/nearby/grouped, or the opt-in /api/app-v2/nearby/shadow route. It does not read Supabase directly and does not write data.`);
}

function buildUrl(options: CliOptions) {
  const pathname =
    options.shape === "shadow"
      ? "/api/app-v2/nearby/shadow"
      : options.shape === "grouped"
        ? "/api/app-v2/nearby/grouped"
        : "/api/app-v2/nearby";
  const url = new URL(pathname, options.baseUrl);

  url.searchParams.set("lat", String(options.latitude));
  url.searchParams.set("lng", String(options.longitude));
  url.searchParams.set("radius", String(options.radiusMeters));
  url.searchParams.set("limit", String(options.limit));
  url.searchParams.set("candidateLimit", String(options.candidateLimit));

  if (options.shape === "grouped" || options.shape === "shadow") {
    url.searchParams.set("eligibility", options.eligibility);
  }

  if (options.shape === "shadow") {
    url.searchParams.set("shadow", "1");
  }

  return url;
}

function getResultSummary(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const meta = typeof record.meta === "object" && record.meta !== null ? (record.meta as Record<string, unknown>) : {};
  const results = Array.isArray(record.results) ? record.results : [];
  const legacyResults = Array.isArray(record.legacyResults) ? record.legacyResults : [];
  const appV2Results = Array.isArray(record.appV2Results) ? record.appV2Results : [];
  const comparison =
    typeof record.comparison === "object" && record.comparison !== null
      ? (record.comparison as Record<string, unknown>)
      : null;
  const diagnostics =
    typeof meta.diagnostics === "object" && meta.diagnostics !== null
      ? (meta.diagnostics as Record<string, unknown>)
      : typeof meta.appV2 === "object" &&
          meta.appV2 !== null &&
          typeof (meta.appV2 as Record<string, unknown>).diagnostics === "object" &&
          (meta.appV2 as Record<string, unknown>).diagnostics !== null
        ? ((meta.appV2 as Record<string, unknown>).diagnostics as Record<string, unknown>)
      : null;
  const appV2ResultCount =
    typeof meta.appV2 === "object" && meta.appV2 !== null
      ? (meta.appV2 as Record<string, unknown>).resultCount
      : undefined;

  return {
    status: "results" in record || "comparison" in record ? "ok" : "error",
    requestId: meta.requestId,
    contract: meta.contract,
    mode: meta.mode,
    query: meta.query,
    resultCount: meta.resultCount ?? appV2ResultCount ?? results.length,
    legacy: meta.legacy,
    appV2: meta.appV2,
    capabilities: meta.capabilities,
    eligibility: meta.eligibility,
    exclusionMode: meta.exclusionMode,
    diagnostics,
    comparison,
    limitations: meta.limitations,
    firstResults: results.slice(0, 5),
    firstLegacyResults: legacyResults.slice(0, 5),
    firstAppV2Results: appV2Results.slice(0, 5),
    error: record.error,
  };
}

async function main() {
  if (hasFlag("--help")) {
    printHelp();
    return;
  }

  const options = getOptions();
  const url = buildUrl(options);

  console.log("[read:app-v2-nearby-api] read-only API probe");
  console.log(`[read:app-v2-nearby-api] sample: ${options.sample}`);
  console.log(`[read:app-v2-nearby-api] shape: ${options.shape}`);
  console.log(`[read:app-v2-nearby-api] eligibility: ${options.shape === "grouped" || options.shape === "shadow" ? options.eligibility : "n/a"}`);
  console.log(`[read:app-v2-nearby-api] GET ${url.toString()}`);

  let response: Response;

  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error.";
    console.error(`[read:app-v2-nearby-api] failed to reach API: ${message}`);
    process.exit(1);
  }

  const payload = await response.json().catch(() => null);
  const summary = getResultSummary(payload);

  console.log(`[read:app-v2-nearby-api] status: ${response.status}`);

  if (summary) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("[read:app-v2-nearby-api] response was not JSON or did not match expected shape.");
    console.log(String(await response.text().catch(() => "")));
  }

  if (!response.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown app_v2 nearby API probe error.";

  console.error(`[read:app-v2-nearby-api] failed: ${message}`);
  process.exit(1);
});
