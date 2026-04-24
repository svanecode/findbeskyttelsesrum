import Link from "next/link";
import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import SiteHeader from "@/components/SiteHeader";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import {
  getAppV2FeaturedShelters,
  getAppV2MunicipalitySummaries,
  getAppV2ShelterCount,
  getAppV2TotalShelterCapacity,
  getLatestAppV2ImportRun,
  type AppV2ShelterPreview,
  type AppV2ImportRunSummary,
} from "@/lib/supabase/app-v2-queries";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Hele landet",
  description:
    "Sekundær oversigt over registrerede beskyttelsesrum i Danmark. Brug søgning på forsiden for at finde nærmeste beskyttelsesrum.",
  alternates: {
    canonical: "/land",
  },
  openGraph: {
    title: "Hele landet",
    description:
      "Sekundær oversigt over registrerede beskyttelsesrum i Danmark. Brug søgning på forsiden for at finde nærmeste beskyttelsesrum.",
    type: "website",
    locale: "da_DK",
    siteName: "Find Beskyttelsesrum",
    url: "https://findbeskyttelsesrum.dk/land",
  },
};

type CountryOverview =
  | {
      ok: true;
      municipalityCount: number;
      activeMunicipalityCount: number;
      activeShelterCount: number;
      totalCapacity: number;
      latestImportRun: AppV2ImportRunSummary | null;
      featuredShelters: AppV2ShelterPreview[];
      regionSummaries: Array<{
        name: string;
        municipalityCount: number;
        activeShelterCount: number;
      }>;
      topMunicipalities: Array<{
        name: string;
        slug: string;
        activeShelterCount: number;
      }>;
      /** Top 20 by activeShelterCount — used for JSON-LD ItemList only */
      topMunicipalitiesForJsonLd: Array<{
        name: string;
        slug: string;
        activeShelterCount: number;
      }>;
    }
  | {
      ok: false;
    };

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

async function getCountryOverview(): Promise<CountryOverview> {
  try {
    const [municipalities, activeShelterCount, totalCapacity, latestImportRun, featuredShelters] = await Promise.all([
      getAppV2MunicipalitySummaries(),
      getAppV2ShelterCount(),
      getAppV2TotalShelterCapacity(),
      getLatestAppV2ImportRun(),
      getAppV2FeaturedShelters({ limit: 4 }),
    ]);
    const sortedMunicipalities = municipalities
      .slice()
      .sort((a, b) => b.activeShelterCount - a.activeShelterCount || a.name.localeCompare(b.name, "da-DK"));

    const regionSummaries = Array.from(
      municipalities
        .reduce((regions, municipality) => {
          const regionName = municipality.regionName ?? "Region ikke angivet";
          const region = regions.get(regionName) ?? {
            name: regionName,
            municipalityCount: 0,
            activeShelterCount: 0,
          };

          region.municipalityCount += 1;
          region.activeShelterCount += municipality.activeShelterCount;
          regions.set(regionName, region);

          return regions;
        }, new Map<string, { name: string; municipalityCount: number; activeShelterCount: number }>())
        .values(),
    ).sort((a, b) => b.activeShelterCount - a.activeShelterCount || a.name.localeCompare(b.name, "da-DK"));

    return {
      ok: true,
      municipalityCount: municipalities.length,
      activeMunicipalityCount: municipalities.filter((municipality) => municipality.activeShelterCount > 0).length,
      activeShelterCount,
      totalCapacity,
      latestImportRun,
      featuredShelters,
      regionSummaries,
      topMunicipalities: sortedMunicipalities.slice(0, 8).map((municipality) => ({
        name: municipality.name,
        slug: municipality.slug,
        activeShelterCount: municipality.activeShelterCount,
      })),
      topMunicipalitiesForJsonLd: sortedMunicipalities.slice(0, 20).map((municipality) => ({
        name: municipality.name,
        slug: municipality.slug,
        activeShelterCount: municipality.activeShelterCount,
      })),
    };
  } catch (error) {
    console.error("Could not load app_v2 country overview:", error);
    return { ok: false };
  }
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-gray-400">{note}</p>
    </div>
  );
}

function NationalDepthItem({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-t border-white/10 py-4 first:border-t-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-gray-400">{note}</p>
    </div>
  );
}

function buildLandJsonLd(
  topMunicipalities: Array<{ name: string; slug: string; activeShelterCount: number }>,
) {
  const webPage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Beskyttelsesrum i Danmark",
    description:
      "National oversigt over registrerede beskyttelsesrum i Danmark med landstal, regional struktur og kommuner.",
    url: "https://findbeskyttelsesrum.dk/land",
    inLanguage: "da-DK",
    isPartOf: {
      "@type": "WebSite",
      name: "Find Beskyttelsesrum",
      url: "https://findbeskyttelsesrum.dk",
    },
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Kommuner med registrerede beskyttelsesrum",
    numberOfItems: topMunicipalities.length,
    itemListElement: topMunicipalities.map((municipality, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "AdministrativeArea",
        name: municipality.name,
        url: `https://findbeskyttelsesrum.dk/kommune/${municipality.slug}`,
      },
    })),
  };

  return [webPage, itemList];
}

function JourneyItem({
  label,
  title,
  description,
  href,
}: {
  label: string;
  title: string;
  description: string;
  href: "/land" | "/kommune" | "/" | "/om-data";
}) {
  return (
    <Link href={href} className="group block py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <h3 className="mt-1 text-base font-semibold text-white group-hover:text-gray-200">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
    </Link>
  );
}

function ShelterExampleCard({ shelter }: { shelter: AppV2ShelterPreview }) {
  return (
    <Link
      href={`/beskyttelsesrum/${shelter.slug}`}
      className="block rounded-lg border border-white/10 bg-black/20 p-4 transition hover:bg-white/10"
    >
      <p className="text-sm font-semibold text-white">{shelter.name}</p>
      <p className="mt-1 text-sm leading-6 text-gray-400">
        {shelter.addressLine1}, {shelter.postalCode} {shelter.city}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{shelter.municipality.name}</span>
        <span>{shelter.capacity.toLocaleString("da-DK")} registrerede pladser</span>
        <span>Åbn detailregistrering</span>
      </div>
    </Link>
  );
}

export default async function CountryPage() {
  const overview = await getCountryOverview();
  const latestImportCompletedAt = overview.ok ? formatDate(overview.latestImportRun?.finishedAt ?? null) : null;

  const landJsonLd = buildLandJsonLd(overview.ok ? overview.topMunicipalitiesForJsonLd : []);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(landJsonLd),
        }}
      />
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <SiteHeader />

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-10 max-w-3xl space-y-5">
          <p className="text-sm uppercase tracking-wide text-gray-400">Hele landet</p>
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
            Hele landet
          </h1>
          <p className="text-lg leading-8 text-gray-300">
            Brug søgning på forsiden for at finde nærmeste beskyttelsesrum. Landssiden er en sekundær oversigt.
          </p>
          <div className="pt-1">
            <Link
              href="/"
              className="inline-flex items-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
            >
              Find nærmeste beskyttelsesrum
            </Link>
          </div>
        </header>

        {overview.ok ? (
          <section className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Kommuner"
              value={overview.municipalityCount.toLocaleString("da-DK")}
              note={`${overview.activeMunicipalityCount.toLocaleString("da-DK")} kommuner har aktive registreringer i oversigten.`}
            />
            <StatCard
              label="Aktive registreringer"
              value={overview.activeShelterCount.toLocaleString("da-DK")}
              note="Registreringer der er aktive i datagrundlaget."
            />
            <StatCard
              label="Registrerede pladser"
              value={overview.totalCapacity.toLocaleString("da-DK")}
              note="Summen af registreret kapacitet i aktive registreringer."
            />
          </section>
        ) : (
          <section className="mb-8 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Landstal er ikke tilgængelige</h2>
            <p className="mt-2 text-sm leading-6 text-gray-300">
              Kunne ikke hente oversigten lige nu. Derfor viser siden ingen fallback-tal.
            </p>
          </section>
        )}

        {overview.ok && (
          <section className="mb-8 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-wide text-gray-400">Nationalt overblik</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Hvad landssiden kan bruges til</h2>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                Landssiden giver et samlet billede af datagrundlaget og peger videre til de sider, hvor
                registreringerne bliver lokale og konkrete. Tallene er registerbaserede og skal læses sammen med
                dataforklaringen.
              </p>
            </div>
            <div className="mt-5 grid gap-x-6 md:grid-cols-3">
              <NationalDepthItem
                label="Dækning"
                value={`${overview.activeMunicipalityCount.toLocaleString("da-DK")} kommuner`}
                note="Kommuner med mindst én aktiv registrering i datagrundlaget."
              />
              <NationalDepthItem
                label="Kommuneniveau"
                value="Lokale sider"
                note="Kommunesiderne viser lokalt overblik, postområder, adresseliste med veje til detail-sider og normal kortvisning."
              />
              <NationalDepthItem
                label="Detailniveau"
                value="Enkelte registreringer"
                note="Detail-sider viser én aktiv registrering med adresse, registreret kapacitet og kildekontekst."
              />
            </div>
          </section>
        )}

        {overview.ok && overview.regionSummaries.length > 0 && (
          <section className="mb-8 rounded-lg border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <p className="text-sm uppercase tracking-wide text-gray-400">National struktur</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Regioner i oversigten</h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                Regional fordeling hjælper med at forstå oversigtens nationale bredde. Det er ikke en rangering af
                sikkerhed, adgang eller beredskab.
              </p>
            </div>
            <ul className="divide-y divide-white/10">
              {overview.regionSummaries.map((region) => (
                <li
                  key={region.name}
                  className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6"
                >
                  <span className="font-medium text-white">{region.name}</span>
                  <span className="text-gray-300">
                    {region.municipalityCount.toLocaleString("da-DK")} kommuner
                  </span>
                  <span className="text-gray-400">
                    {region.activeShelterCount.toLocaleString("da-DK")} aktive registreringer
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-8 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-wide text-gray-400">Sekundær vej</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Fra oversigt til kommune</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Landssiden kan bruges til at finde vej til kommunesider og forstå overordnede tal. Hvis du skal handle
              hurtigt, brug søgning på forsiden.
            </p>
          </div>
          <div className="mt-5 divide-y divide-white/10 md:grid md:grid-cols-3 md:divide-x md:divide-y-0">
            <JourneyItem
              label="1"
              title="Søg"
              description="Find nærmeste beskyttelsesrum via adresse eller placering."
              href="/"
            />
            <div className="md:px-5">
              <JourneyItem
                label="2"
                title="Kommuneoversigt"
                description="Vælg en kommune for lokalt overblik."
                href="/kommune"
              />
            </div>
            <div className="md:pl-5">
              <JourneyItem
                label="3"
                title="Datagrundlag"
                description="Læs om kilder og forbehold."
                href="/om-data"
              />
            </div>
          </div>
        </section>

        {overview.ok && overview.featuredShelters.length > 0 && (
          <section className="mb-8 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-wide text-gray-400">Konkrete indgange</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Udvalgte eksempelregistreringer</h2>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                Her vises få aktive registreringer med høj registreret kapacitet på tværs af landet. De giver konkrete
                veje til detail-siderne og viser hvordan nationale tal kan læses ned på enkeltregistreringer. De er ikke
                anbefalinger, en komplet national liste eller en vurdering af beredskab.
              </p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {overview.featuredShelters.map((shelter) => (
                <ShelterExampleCard key={shelter.id} shelter={shelter} />
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Start med en kommune</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Kommuneoversigten er den mest stabile offentlige vej fra nationalt overblik til lokal kontekst. Den
              enkelte kommuneside viser lokale nøgletal, postområder, adresseliste med veje til detail-sider og forklarer
              tydeligt, når lokale data og den normale kortvisning vises side om side.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/kommune"
                className="inline-flex items-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
              >
                Se alle kommuner
              </Link>
              <Link
                href="/om-data"
                className="inline-flex items-center rounded-lg px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
              >
                Læs om data
              </Link>
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Datastatus</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Seneste afsluttede import: {latestImportCompletedAt ?? "ikke registreret"}.
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              Tallene er registerbaserede og siger ikke i sig selv noget om adgang, stand eller klargøring. Brug
              data-siden, når du vil se hvordan kilder, import og offentlig visning hænger sammen.
            </p>
            <Link
              href="/om-data"
              className="mt-4 inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
            >
              Se datagrundlaget
            </Link>
          </section>
        </div>

        {overview.ok && overview.topMunicipalities.length > 0 && (
          <section className="mt-8 rounded-lg border border-white/10 bg-white/5">
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <h2 className="text-lg font-semibold text-white">Største kommuner i oversigten</h2>
              <p className="mt-1 text-sm text-gray-400">
                Sorteret efter antal aktive registreringer. Listen viser hvor der er mest registervolumen og fungerer
                som indgang til kommunesider, ikke som rangering af sikkerhed, adgang eller beredskab.
              </p>
            </div>
            <ul className="divide-y divide-white/10">
              {overview.topMunicipalities.map((municipality) => (
                <li key={municipality.slug}>
                  <Link
                    href={`/kommune/${municipality.slug}`}
                    className="flex flex-col gap-2 px-5 py-4 transition hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  >
                    <span className="font-medium text-white">{municipality.name}</span>
                    <span className="text-sm text-gray-300">
                      {municipality.activeShelterCount.toLocaleString("da-DK")} aktive registreringer
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-white/10 px-5 py-4 sm:px-6">
              <Link
                href="/kommune"
                className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
              >
                Gå til den fulde kommuneoversigt
              </Link>
            </div>
          </section>
        )}

        <section className="mt-8 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Næste skridt</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-300">
            Start med kommuneoversigten for at gå fra nationalt overblik til lokal kontekst. Brug{" "}
            <Link href="/om-data" className="text-white underline-offset-2 hover:underline">
              Datagrundlag
            </Link>
            , hvis du vil forstå forskellen på aktive registreringer, registrerede pladser og udvalgte
            eksempelregistreringer.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/kommune"
              className="inline-flex items-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
            >
              Gå til kommuner
            </Link>
            <Link
              href="/om-data"
              className="inline-flex items-center rounded-lg px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
            >
              Datagrundlag
            </Link>
          </div>
        </section>
      </div>

      <GlobalFooter />
    </main>
  );
}
