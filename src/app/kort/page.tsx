import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import { getAppV2PublicCountryShelterMarkers } from "@/lib/supabase/app-v2-queries";
import { siteUrl } from "@/lib/seo/site";

import CountryMapExperience from "./country-map-experience";

export const revalidate = 86400;
/** Requires DB migration `013_app_v2_public_read_views` (public views). Avoid build-time prerender without views. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Landskort",
  description: "Landskort med beskyttelsesrum i Danmark ud fra offentlige registerdata.",
  alternates: { canonical: "/kort" },
  openGraph: {
    title: "Landskort",
    description: "Landskort med beskyttelsesrum i Danmark ud fra offentlige registerdata.",
    type: "website",
    url: `${siteUrl}/kort`,
    siteName: "Find Beskyttelsesrum",
    locale: "da_DK",
  },
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-4 shadow-[0_6px_18px_rgb(0,0,0,0.12)] backdrop-blur-sm">
      <p className="text-xs font-medium tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-100">{value}</p>
    </div>
  );
}

export default async function CountryMapPage() {
  const markers = await getAppV2PublicCountryShelterMarkers();
  const totalCount = markers.length;
  const totalCapacity = markers.reduce((sum, m) => sum + m.capacity, 0);

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 max-w-3xl space-y-4">
          <p className="text-sm uppercase tracking-wide text-gray-400">Hele landet</p>
          <h1 className="font-space-grotesk text-3xl font-bold leading-tight text-white sm:text-4xl">
            Landskort
          </h1>
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-2" aria-label="Nøgletal for kortet">
          <StatCard
            label="Beskyttelsesrum på kortet"
            value={totalCount.toLocaleString("da-DK")}
          />
          <StatCard
            label="Registrerede pladser"
            value={totalCapacity.toLocaleString("da-DK")}
          />
        </section>
      </div>

      <section className="w-full px-4 pb-12 sm:px-6 lg:px-8" aria-label="Interaktivt landskort">
        <div className="mx-auto max-w-7xl">
          <p className="mb-3 max-w-3xl text-xs leading-relaxed text-gray-500 sm:text-sm">
            Zoom ind og klik på punktgrupper for at se enkelte steder. Kortet er bedst med mus eller touch; for præcis
            søgning efter nærmeste beskyttelsesrum, brug forsiden.
          </p>
          <CountryMapExperience />
        </div>
      </section>

      <GlobalFooter />
    </main>
  );
}
