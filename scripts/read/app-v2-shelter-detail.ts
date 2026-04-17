import "dotenv/config";

import { getAppV2ShelterBySlug } from "@/lib/supabase/app-v2-queries";

function getShelterSlug() {
  const slugFlagIndex = process.argv.findIndex((value) => value === "--slug");

  if (slugFlagIndex !== -1) {
    return process.argv[slugFlagIndex + 1]?.trim();
  }

  return process.argv[2]?.trim();
}

function getMissingEnvVars() {
  return [
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()],
    ["SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY?.trim()],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name as string);
}

async function main() {
  const slug = getShelterSlug();

  console.log("[read:shelter-detail] read-only app_v2 shelter detail check");

  if (!slug) {
    console.log("[read:shelter-detail] usage: npm run read:shelter-detail -- <shelter-slug>");
    console.log("[read:shelter-detail] no database reads were attempted.");
    process.exitCode = 1;
    return;
  }

  const missingEnvVars = getMissingEnvVars();

  if (missingEnvVars.length > 0) {
    console.log(`[read:shelter-detail] skipped: missing env vars: ${missingEnvVars.join(", ")}`);
    console.log("[read:shelter-detail] no database reads were attempted.");
    return;
  }

  const shelter = await getAppV2ShelterBySlug(slug);

  if (!shelter) {
    console.log(`[read:shelter-detail] not found: ${slug}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        slug: shelter.slug,
        name: shelter.name,
        addressLine1: shelter.addressLine1,
        postalCode: shelter.postalCode,
        city: shelter.city,
        capacity: shelter.capacity,
        status: shelter.status,
        importState: shelter.importState,
        hasCoordinates: shelter.latitude !== null && shelter.longitude !== null,
        municipality: {
          slug: shelter.municipality.slug,
          name: shelter.municipality.name,
          code: shelter.municipality.code,
          activeShelterCount: shelter.municipality.activeShelterCount,
        },
        lastSeenAt: shelter.lastSeenAt,
        lastImportedAt: shelter.lastImportedAt,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown app_v2 shelter detail read error.";

  console.error(`[read:shelter-detail] failed: ${message}`);
  process.exit(1);
});
