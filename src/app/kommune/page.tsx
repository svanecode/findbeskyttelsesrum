import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import { getAppV2MunicipalitySummaries } from "@/lib/supabase/app-v2-queries";
import { siteUrl } from "@/lib/seo/site";
import MunicipalityList from "./municipality-list";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Kommuneoversigt",
  description: "Oversigt over kommuner med beskyttelsesrum i det viste register.",
  alternates: {
    canonical: "/kommune",
  },
  openGraph: {
    title: "Kommuneoversigt",
    description: "Oversigt over kommuner med beskyttelsesrum i det viste register.",
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
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-10 max-w-3xl space-y-5">
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
            Kommuneoversigt
          </h1>
          <p className="text-lg tabular-nums text-gray-300">
            {publicShelterCount === 1
              ? "1 beskyttelsesrum"
              : `${publicShelterCount.toLocaleString("da-DK")} beskyttelsesrum`}
            <span className="text-gray-500"> · </span>
            {totalCapacity === 1
              ? "1 registreret plads"
              : `${totalCapacity.toLocaleString("da-DK")} registrerede pladser`}
          </p>
        </header>

        <MunicipalityList municipalities={municipalities} />
      </div>

      <GlobalFooter />
    </main>
  );
}
