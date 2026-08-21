import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import ProductMetricView from "@/components/ProductMetricView";
import { ui } from "@/components/ui-classes";
import {
  getAppV2PublicDataRevision,
  getAppV2PublicDataStats,
} from "@/lib/supabase/app-v2-queries";
import { siteUrl } from "@/lib/seo/site";

import CountryMapExperience from "./country-map-experience";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Landskort",
  description: "Orienterende landskort med BBR-registreringer af sikringsrumspladser i Danmark.",
  alternates: { canonical: "/kort" },
  openGraph: {
    title: "Landskort",
    description: "Orienterende landskort med BBR-registreringer af sikringsrumspladser i Danmark.",
    type: "website",
    url: `${siteUrl}/kort`,
    siteName: "Find Beskyttelsesrum",
    locale: "da_DK",
  },
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${ui.panel} p-4`}>
      <p className="text-xs font-medium tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-100">{value}</p>
    </div>
  );
}

export default async function CountryMapPage() {
  const [stats, dataRevision] = await Promise.all([
    getAppV2PublicDataStats(),
    getAppV2PublicDataRevision(),
  ]);

  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      <ProductMetricView eventName="map_opened" />
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="mb-8 max-w-3xl space-y-4">
          <p className={ui.eyebrow}>Hele landet</p>
          <h1 className={ui.pageTitle}>
            Landskort
          </h1>
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-2" aria-label="Nøgletal for kortet">
          <StatCard
            label="BBR-registreringer på kortet"
            value={stats.mappedRegistrations.toLocaleString("da-DK")}
          />
          <StatCard
            label="BBR-registrerede pladser"
            value={stats.mappedCapacity.toLocaleString("da-DK")}
          />
        </section>
      </div>

      <section className="w-full px-4 pb-12 sm:px-6 lg:px-8" aria-label="Interaktivt landskort">
        <div className="mx-auto max-w-7xl">
          <p className="mb-3 max-w-3xl text-xs leading-relaxed text-gray-400 sm:text-sm">
            Zoom ind og klik på punktgrupper for at se enkelte steder. Kortet er bedst med mus eller touch; for præcis
            søgning efter BBR-registreringer i nærheden, brug forsiden.
          </p>
          <CountryMapExperience initialDatasetRevision={dataRevision.cacheKey} />
        </div>
      </section>

      <GlobalFooter />
    </main>
  );
}
