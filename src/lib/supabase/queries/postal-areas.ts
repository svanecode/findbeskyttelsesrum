import { createAppV2PublicClient } from "@/lib/app-v2-public";
import type { MunicipalityRow, PostalAreaRow, PostalAreaTable } from "@/lib/address/locality";
import { readAllPages } from "@/lib/supabase/read-all-pages";

type PostalAreaDbRow = {
  postnr: string;
  name: string;
  municipality_codes: string[] | null;
  latitude: number;
  longitude: number;
};

/**
 * Every Danish postcode with a position (app_v2.postal_area_public_v1, filled
 * at each import) and all 98 municipalities, in the compact shape the address
 * search uses. The postcodes (about 1,090) are read in pages, because
 * PostgREST returns at most 1000 rows per request. Municipalities come from
 * the summary view, which also lists those without public registrations
 * (Læsø). Throws when a view cannot be read, so a failure is never cached as
 * an empty or partial table.
 */
export async function getAppV2PublicPostalAreaTable(): Promise<PostalAreaTable> {
  const pub = createAppV2PublicClient();
  const [areas, municipalities] = await Promise.all([
    readAllPages<PostalAreaDbRow>(
      (from, to) => pub
        .from("postal_area_public_v1")
        .select("postnr, name, municipality_codes, latitude, longitude")
        .order("postnr", { ascending: true })
        .range(from, to),
      "public postcodes",
    ),
    readAllPages<{ code: string; name: string }>(
      (from, to) => pub
        .from("municipality_summary_public_v1")
        .select("code, name")
        .order("code", { ascending: true })
        .range(from, to),
      "public municipalities",
    ),
  ]);

  const postnumre: PostalAreaRow[] = areas.map((row) => [
    String(row.postnr),
    String(row.name),
    Array.isArray(row.municipality_codes) ? row.municipality_codes.map(String) : [],
    Math.round(Number(row.latitude) * 10_000) / 10_000,
    Math.round(Number(row.longitude) * 10_000) / 10_000,
  ]);
  const kommuner: MunicipalityRow[] = municipalities.map((row) => [String(row.code), String(row.name)]);
  if (postnumre.length === 0) throw new Error("The public postcode table is empty.");
  return { postnumre, kommuner };
}
