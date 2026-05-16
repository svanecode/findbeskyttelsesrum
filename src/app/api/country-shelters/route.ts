import { NextResponse } from "next/server";

import { getAppV2PublicCountryShelterMarkers } from "@/lib/supabase/app-v2-queries";
import type { CountryShelterMarkersResponse } from "@/types/country-map";

/** ISR for this GET handler; Cache-Control below drives CDN caching. */
export const revalidate = 86400;
export const runtime = "nodejs";

export async function GET() {
  try {
    const shelters = await getAppV2PublicCountryShelterMarkers();
    const generatedAt = new Date().toISOString();

    const payload: CountryShelterMarkersResponse = {
      shelters,
      generatedAt,
      count: shelters.length,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
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
