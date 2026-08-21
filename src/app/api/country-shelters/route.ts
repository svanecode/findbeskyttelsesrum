import { NextResponse } from "next/server";

import {
  getAppV2PublicCountryMapFeatures,
  getAppV2PublicCountryShelterMarkers,
  getAppV2PublicCountryShelterMarkersInBounds,
  type AppV2CountryShelterMarker,
} from "@/lib/supabase/app-v2-queries";
import type { CountryMapFeaturesResponse, CountryShelterMarkersResponse } from "@/types/country-map";

/** Viewport query parameters make this request-specific; the CDN header below caches each URL. */
export const dynamic = "force-dynamic";
export const revalidate = 86400;
export const runtime = "nodejs";

type Viewport = NonNullable<CountryShelterMarkersResponse["viewport"]>;

function parseViewport(request: Request): Viewport | null {
  const search = new URL(request.url).searchParams;
  const keys = ["north", "south", "east", "west", "zoom"] as const;
  const present = keys.filter((key) => search.has(key));
  if (present.length === 0) return null;
  if (present.length !== keys.length) throw new RangeError("Alle viewportfelter er påkrævet.");

  const viewport = Object.fromEntries(keys.map((key) => [key, Number(search.get(key))])) as Viewport;
  if (!Object.values(viewport).every(Number.isFinite)) throw new RangeError("Viewportfelter skal være tal.");
  if (viewport.north <= viewport.south || viewport.east <= viewport.west) throw new RangeError("Viewportgrænserne er ugyldige.");
  if (viewport.south < -90 || viewport.north > 90 || viewport.west < -180 || viewport.east > 180) throw new RangeError("Viewportgrænserne ligger uden for kortet.");
  if (viewport.zoom < 5 || viewport.zoom > 18) throw new RangeError("Zoomniveauet er ugyldigt.");
  return viewport;
}

function markerLimitForZoom(zoom: number) {
  if (zoom <= 7) return 3_000;
  if (zoom <= 9) return 6_000;
  return 12_000;
}

function evenlySample(markers: AppV2CountryShelterMarker[], limit: number) {
  if (markers.length <= limit) return markers;
  return Array.from({ length: limit }, (_, index) => markers[Math.floor((index * markers.length) / limit)]!);
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const format = search.get("format");
    if (format !== null && format !== "features") {
      throw new RangeError("Det valgte kortformat understøttes ikke.");
    }

    const viewport = parseViewport(request);
    if (format === "features") {
      if (!viewport) {
        throw new RangeError("Viewportfelter er påkrævet for det optimerede kortformat.");
      }

      const result = await getAppV2PublicCountryMapFeatures({ ...viewport, limit: 5000 });
      const payload: CountryMapFeaturesResponse = {
        contract: "country-map-features-v1",
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
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    }

    const result = viewport
      ? await getAppV2PublicCountryShelterMarkersInBounds(viewport)
      : {
          markers: await getAppV2PublicCountryShelterMarkers(),
          totalCount: 0,
        };
    const availableCount = viewport ? result.totalCount : result.markers.length;
    const shelters = viewport ? evenlySample(result.markers, markerLimitForZoom(viewport.zoom)) : result.markers;
    const generatedAt = new Date().toISOString();

    const payload: CountryShelterMarkersResponse = {
      shelters,
      generatedAt,
      count: shelters.length,
      availableCount,
      truncated: shelters.length < availableCount,
      ...(viewport ? { viewport } : {}),
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    if (err instanceof RangeError) {
      return NextResponse.json(
        { error: err.message, code: "INVALID_COUNTRY_MAP_VIEWPORT" },
        { status: 400 },
      );
    }
    console.error("[country-shelters] Failed to load markers:", err);
    return NextResponse.json(
      {
        error: "Kunne ikke hente kortmarkører lige nu.",
        code: "COUNTRY_SHELTERS_FETCH_FAILED",
      },
      { status: 502 },
    );
  }
}
