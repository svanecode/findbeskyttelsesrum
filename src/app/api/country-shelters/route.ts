import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { consumeDistributedRateLimit } from "@/lib/distributed-rate-limit";
import { quantizeCountryMapViewport } from "@/lib/maps/country-map-viewport";
import { rateLimit } from "@/lib/rate-limit";
import {
  getAppV2PublicCountryMapFeatures,
  getAppV2PublicDataRevision,
} from "@/lib/supabase/app-v2-queries";
import type { CountryMapFeaturesResponse, CountryMapViewport } from "@/types/country-map";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedQueryParameters = new Set([
  "format",
  "revision",
  "north",
  "south",
  "east",
  "west",
  "zoom",
]);
const viewportKeys = ["north", "south", "east", "west", "zoom"] as const;

const readCachedCountryMapFeatures = unstable_cache(
  async (
    dataRevision: string,
    north: number,
    south: number,
    east: number,
    west: number,
    zoom: number,
  ) => {
    if (!dataRevision) throw new Error("Country map cache requires a public data revision.");
    return getAppV2PublicCountryMapFeatures({ north, south, east, west, zoom, limit: 5000 });
  },
  ["country-map-features-v2"],
  { revalidate: 3600 },
);

function noStoreHeaders(revision?: string) {
  return {
    "Cache-Control": "private, no-store",
    ...(revision ? { "X-Public-Data-Revision": revision } : {}),
  };
}

function parseRequest(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  for (const key of search.keys()) {
    if (!allowedQueryParameters.has(key)) {
      throw new RangeError(`Ukendt queryparameter: ${key}.`);
    }
  }

  for (const key of allowedQueryParameters) {
    if (search.getAll(key).length > 1) {
      throw new RangeError(`Queryparameteren ${key} må kun angives én gang.`);
    }
  }

  if (search.get("format") !== "features") {
    throw new RangeError("Kortformatet skal være features.");
  }

  const revision = search.get("revision")?.trim() ?? "";
  if (!revision || revision.length > 128 || !/^[a-z0-9:-]+$/i.test(revision)) {
    throw new RangeError("En gyldig datarevision er påkrævet.");
  }

  if (viewportKeys.some((key) => !search.has(key))) {
    throw new RangeError("Alle viewportfelter er påkrævet.");
  }

  const viewport = Object.fromEntries(
    viewportKeys.map((key) => [key, Number(search.get(key))]),
  ) as CountryMapViewport;
  if (!Object.values(viewport).every(Number.isFinite)) {
    throw new RangeError("Viewportfelter skal være tal.");
  }
  if (viewport.north <= viewport.south || viewport.east <= viewport.west) {
    throw new RangeError("Viewportgrænserne er ugyldige.");
  }
  if (
    viewport.south < -90
    || viewport.north > 90
    || viewport.west < -180
    || viewport.east > 180
  ) {
    throw new RangeError("Viewportgrænserne ligger uden for kortet.");
  }
  if (!Number.isInteger(viewport.zoom) || viewport.zoom < 5 || viewport.zoom > 18) {
    throw new RangeError("Zoomniveauet er ugyldigt.");
  }

  return {
    requestedRevision: revision,
    viewport: quantizeCountryMapViewport(viewport),
  };
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "For mange kortforespørgsler. Vent et øjeblik, og prøv igen.", code: "RATE_LIMITED" },
    {
      status: 429,
      headers: {
        ...noStoreHeaders(),
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

export async function GET(request: NextRequest) {
  if (!rateLimit(request, { maxRequests: 120, windowMs: 60_000 }, "country-map")) {
    return rateLimitedResponse(60);
  }

  try {
    const parsed = parseRequest(request);
    const sharedLimit = await consumeDistributedRateLimit(
      request,
      { maxRequests: 120, windowMs: 60_000 },
      "country-map",
    );
    if (!sharedLimit.allowed) {
      return rateLimitedResponse(sharedLimit.retryAfterSeconds);
    }

    const currentRevision = await getAppV2PublicDataRevision();
    if (parsed.requestedRevision !== currentRevision.cacheKey) {
      return NextResponse.json(
        {
          error: "Kortets dataversion er ændret. Hent kortet igen med den aktuelle revision.",
          code: "COUNTRY_MAP_REVISION_CHANGED",
          currentRevision: currentRevision.cacheKey,
        },
        { status: 409, headers: noStoreHeaders(currentRevision.cacheKey) },
      );
    }

    const { viewport } = parsed;
    const result = await readCachedCountryMapFeatures(
      currentRevision.cacheKey,
      viewport.north,
      viewport.south,
      viewport.east,
      viewport.west,
      viewport.zoom,
    );
    const payload: CountryMapFeaturesResponse = {
      contract: "country-map-features-v2",
      datasetRevision: currentRevision.cacheKey,
      features: result.features,
      generatedAt: new Date().toISOString(),
      mode: result.mode,
      availableCount: result.availableCount,
      featureCount: result.featureCount,
      markerCount: result.markerCount,
      clusterCount: result.clusterCount,
      clusteredRegistrationCount: result.clusteredRegistrationCount,
      truncated: result.truncated,
      viewport,
    };

    return NextResponse.json(payload, {
      headers: noStoreHeaders(currentRevision.cacheKey),
    });
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json(
        { error: error.message, code: "INVALID_COUNTRY_MAP_REQUEST" },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    console.error("[country-shelters] Failed to load map features:", error);
    return NextResponse.json(
      {
        error: "Kunne ikke hente kortmarkører lige nu.",
        code: "COUNTRY_SHELTERS_FETCH_FAILED",
      },
      { status: 502, headers: noStoreHeaders() },
    );
  }
}
