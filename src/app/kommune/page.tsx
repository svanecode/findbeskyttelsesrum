import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import { ui } from "@/components/ui-classes";
import { getAppV2MunicipalitySummaries } from "@/lib/supabase/app-v2-queries";
import { siteUrl } from "@/lib/seo/site";
import MunicipalityList from "./municipality-list";

export const revalidate = 86400;
/** Requires the versioned public read model. Keep deployment builds independent of database rollout order. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kommuneoversigt",
  description: "Oversigt over kommuner med viste BBR-registreringer af sikringsrumspladser.",
  alternates: {
    canonical: "/kommune",
  },
  openGraph: {
    title: "Kommuneoversigt",
    description: "Oversigt over kommuner med viste BBR-registreringer af sikringsrumspladser.",
    type: "website",
    locale: "da_DK",
    siteName: "Find Beskyttelsesrum",
    url: `${siteUrl}/kommune`,
  },
};

export default async function MunicipalityOverviewPage() {
  const municipalities = (await getAppV2MunicipalitySummaries()).sort((a, b) =>
    a.name.localeCompare(b.name, "da-DK"),
  );

  const publicShelterCount = municipalities.reduce(
    (sum, municipality) => sum + municipality.activeShelterCount,
    0,
  );
  const totalCapacity = municipalities.reduce(
    (sum, municipality) => sum + municipality.activeShelterTotalCapacity,
    0,
  );

  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="mb-8 max-w-3xl space-y-4 sm:mb-10">
          <p className={ui.eyebrow}>Find lokalt</p>
          <h1 className={ui.pageTitle}>
            Kommuneoversigt
          </h1>
          <p className="text-base tabular-nums text-gray-300 sm:text-lg">
            {publicShelterCount === 1
              ? "1 BBR-registrering"
              : `${publicShelterCount.toLocaleString("da-DK")} BBR-registreringer`}
            <span className="text-gray-400"> · </span>
            {totalCapacity === 1
              ? "1 BBR-registreret plads"
              : `${totalCapacity.toLocaleString("da-DK")} BBR-registrerede pladser`}
          </p>
        </header>

        <MunicipalityList municipalities={municipalities} />
      </div>

      <GlobalFooter />
    </main>
  );
}
