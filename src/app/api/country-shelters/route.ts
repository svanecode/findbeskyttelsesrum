import { NextResponse } from "next/server";

import { getAppV2PublicCountryShelterMarkers } from "@/lib/supabase/app-v2-queries";
import type { CountryShelterMarkersResponse } from "@/types/country-map";

export const revalidate = 86400;
export const runtime = "nodejs";

export async function GET() {
  const shelters = await getAppV2PublicCountryShelterMarkers();
  const generatedAt = new Date().toISOString();

  const payload: CountryShelterMarkersResponse = {
    shelters,
    generatedAt,
    count: shelters.length,
  };

  return NextResponse.json(payload);
}
