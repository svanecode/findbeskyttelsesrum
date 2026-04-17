type CliOptions = {
  baseUrl: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  limit: number;
  candidateLimit: number;
};

const defaultOptions: CliOptions = {
  baseUrl: "http://localhost:3000",
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

  return {
    baseUrl,
    latitude: parseNumberFlag("--lat", defaultOptions.latitude),
    longitude: parseNumberFlag("--lng", defaultOptions.longitude),
    radiusMeters: parseIntegerFlag("--radius", defaultOptions.radiusMeters),
    limit: parseIntegerFlag("--limit", defaultOptions.limit),
    candidateLimit: parseIntegerFlag("--candidate-limit", defaultOptions.candidateLimit),
  };
}

function printHelp() {
  console.log(`Read-only app_v2 nearby API probe.

Usage:
  npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --lat 55.6761 --lng 12.5683

Options:
  --base-url          Base URL for the app. Defaults to http://localhost:3000.
  --lat               Latitude. Defaults to Copenhagen.
  --lng               Longitude. Defaults to Copenhagen.
  --radius            Radius in meters. Defaults to 50000.
  --limit             Result limit. Defaults to 10.
  --candidate-limit   Candidate row limit before app-side distance filtering. Defaults to 500.
  --help              Print this help text.

The script only calls /api/app-v2/nearby. It does not read Supabase directly and does not write data.`);
}

function buildUrl(options: CliOptions) {
  const url = new URL("/api/app-v2/nearby", options.baseUrl);

  url.searchParams.set("lat", String(options.latitude));
  url.searchParams.set("lng", String(options.longitude));
  url.searchParams.set("radius", String(options.radiusMeters));
  url.searchParams.set("limit", String(options.limit));
  url.searchParams.set("candidateLimit", String(options.candidateLimit));

  return url;
}

function getResultSummary(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const meta = typeof record.meta === "object" && record.meta !== null ? (record.meta as Record<string, unknown>) : {};
  const results = Array.isArray(record.results) ? record.results : [];
  const diagnostics =
    typeof meta.diagnostics === "object" && meta.diagnostics !== null
      ? (meta.diagnostics as Record<string, unknown>)
      : null;

  return {
    status: "results" in record ? "ok" : "error",
    requestId: meta.requestId,
    contract: meta.contract,
    resultCount: meta.resultCount ?? results.length,
    diagnostics,
    firstResults: results.slice(0, 5),
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
