import GlobalFooter from "@/components/GlobalFooter";
import ProductMetricView from "@/components/ProductMetricView";
import { ui } from "@/components/ui-classes";
import { createPageMetadata } from "@/lib/seo/metadata";
import {
  getAppV2PublicDataRevision,
  getAppV2PublicDataStats,
} from "@/lib/supabase/app-v2-queries";

import CountryMapExperience from "./country-map-experience";

export const revalidate = 600;

export const metadata = createPageMetadata({
  title: "Landskort",
  description: "Orienterende landskort med BBR-registreringer af sikringsrumspladser i Danmark.",
  path: "/kort",
});

export default async function CountryMapPage() {
  const [stats, dataRevision] = await Promise.all([
    getAppV2PublicDataStats(),
    getAppV2PublicDataRevision(),
  ]);

  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      <ProductMetricView eventName="map_opened" />
      {/* The map comes first so phones see it on the first screen; key figures follow. */}
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pt-6 sm:px-6 sm:pt-10 lg:px-8">
        <header className="mb-4 max-w-3xl">
          <p className={ui.eyebrow}>Hele landet</p>
          <h1 className={`mt-2 ${ui.pageTitle}`}>
            Landskort
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            Zoom ind, og tryk på en punktgruppe for at se enkelte adresser.
          </p>
        </header>
      </div>

      <section className="w-full px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <CountryMapExperience initialDatasetRevision={dataRevision.cacheKey} />

          <dl className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Nøgletal for kortet">
            <div className={`${ui.panel} p-4`}>
              <dt className="text-xs font-medium tracking-wide text-gray-400">BBR-registreringer på kortet</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-100">{stats.mappedRegistrations.toLocaleString("da-DK")}</dd>
            </div>
            <div className={`${ui.panel} p-4`}>
              <dt className="text-xs font-medium tracking-wide text-gray-400">BBR-registrerede pladser</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-100">{stats.mappedCapacity.toLocaleString("da-DK")}</dd>
            </div>
          </dl>
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-gray-400 sm:text-sm">
            Kortet er bedst med mus eller touch. For præcis søgning efter BBR-registreringer i nærheden, brug forsiden.
          </p>
        </div>
      </section>

      <GlobalFooter />
    </main>
  );
}
