import { createAppV2PublicClient } from "@/lib/app-v2-public";
import type { MunicipalityRow, PostalAreaRow, PostalAreaTable } from "@/lib/address/locality";

/**
 * Every Danish postcode with a position (app_v2.postal_area_public_v1, filled
 * at each import) and the municipalities, in the compact shape the address
 * search uses. Throws when the view cannot be read, so a failure is never
 * cached as an empty table.
 */
export async function getAppV2PublicPostalAreaTable(): Promise<PostalAreaTable> {
  const pub = createAppV2PublicClient();
  const [areas, municipalities] = await Promise.all([
    pub
      .from("postal_area_public_v1")
      .select("postnr, name, municipality_codes, latitude, longitude")
      .order("postnr", { ascending: true })
      .limit(5000),
    pub.from("municipality_public_v2").select("code, name").order("code", { ascending: true }),
  ]);
  if (areas.error || municipalities.error) {
    throw new Error(`Could not load public postcodes: ${(areas.error ?? municipalities.error)!.message}`);
  }

  const postnumre: PostalAreaRow[] = (areas.data ?? []).map((row) => [
    String(row.postnr),
    String(row.name),
    Array.isArray(row.municipality_codes) ? row.municipality_codes.map(String) : [],
    Math.round(Number(row.latitude) * 10_000) / 10_000,
    Math.round(Number(row.longitude) * 10_000) / 10_000,
  ]);
  const kommuner: MunicipalityRow[] = (municipalities.data ?? []).map((row) => [String(row.code), String(row.name)]);
  if (postnumre.length === 0) throw new Error("The public postcode table is empty.");
  return { postnumre, kommuner };
}
