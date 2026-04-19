import Link from "next/link";
import type { Metadata } from "next";

import {
  getAppV2FeaturedShelters,
  getAppV2MunicipalitySummaries,
  getAppV2ShelterCount,
  getAppV2TotalShelterCapacity,
  getLatestAppV2ImportRun,
  type AppV2ShelterPreview,
  type AppV2ImportRunSummary,
} from "@/lib/supabase/app-v2-queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Beskyttelsesrum i Danmark",
  description:
    "National destinationsside for registrerede beskyttelsesrum i Danmark med kommuner, udvalgte eksempelregistreringer og datagrundlag.",
  alternates: {
    canonical: "/land",
  },
  openGraph: {
    title: "Beskyttelsesrum i Danmark",
    description:
      "National indgang til kommuner, udvalgte eksempelregistreringer og datagrundlag for beskyttelsesrum.",
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
      activeShelterCount: number;
      totalCapacity: number;
      latestImportRun: AppV2ImportRunSummary | null;
      featuredShelters: AppV2ShelterPreview[];
      topMunicipalities: Array<{
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

    return {
      ok: true,
      municipalityCount: municipalities.length,
      activeShelterCount,
      totalCapacity,
      latestImportRun,
      featuredShelters,
      topMunicipalities: municipalities
        .slice()
        .sort((a, b) => b.activeShelterCount - a.activeShelterCount || a.name.localeCompare(b.name, "da-DK"))
        .slice(0, 8)
        .map((municipality) => ({
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

function JourneyItem({
  label,
  title,
  description,
  href,
}: {
  label: string;
  title: string;
  description: string;
  href: "/land" | "/kommune";
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
      </div>
    </Link>
  );
}

export default async function CountryPage() {
  const overview = await getCountryOverview();
  const latestImportCompletedAt = overview.ok ? formatDate(overview.latestImportRun?.finishedAt ?? null) : null;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <nav className="mb-8 flex flex-wrap gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
          >
            <span aria-hidden="true">←</span>
            Tilbage til forsiden
          </Link>
          <Link
            href="/kommune"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
          >
            Kommuner
          </Link>
          <Link
            href="/om-data"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
          >
            Om data
          </Link>
        </nav>

        <header className="mb-10 max-w-3xl space-y-5">
          <p className="text-sm uppercase tracking-wide text-gray-400">Hele landet</p>
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
            Beskyttelsesrum i Danmark
          </h1>
          <p className="text-lg leading-8 text-gray-300">
            En national indgang til registrerede beskyttelsesrum, kommuner og datagrundlag.
          </p>
          <p className="text-sm leading-6 text-gray-400">
            Brug landssiden til at forstå helheden, gå videre til en kommune og se hvordan de enkelte registreringer
            hænger sammen med datagrundlaget. Adressebaseret nearby-søgning og kort kører fortsat på det eksisterende
            flow, indtil app_v2 nearby er valideret separat.
          </p>
        </header>

        {overview.ok ? (
          <section className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Kommuner"
              value={overview.municipalityCount.toLocaleString("da-DK")}
              note="Kommuner med registreringer i app_v2."
            />
            <StatCard
              label="Aktive registreringer"
              value={overview.activeShelterCount.toLocaleString("da-DK")}
              note="Registreringer der er aktive i det aktuelle datalag."
            />
            <StatCard
              label="Registrerede pladser"
              value={overview.totalCapacity.toLocaleString("da-DK")}
              note="Summen af registreret kapacitet i aktive app_v2-rækker."
            />
          </section>
        ) : (
          <section className="mb-8 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Landstal er ikke tilgængelige</h2>
            <p className="mt-2 text-sm leading-6 text-gray-300">
              Appen kunne ikke hente app_v2-summarytal lige nu. Derfor viser siden ingen fallback-tal.
            </p>
          </section>
        )}

        <section className="mb-8 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-wide text-gray-400">Produktets hierarki</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Fra nationalt overblik til enkelt registrering</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Landssiden er den brede indgang. Kommune- og shelter-siderne gør overblikket konkret, mens data-siden
              forklarer hvilke kilder og begrænsninger der ligger bag.
            </p>
          </div>
          <div className="mt-5 divide-y divide-white/10 md:grid md:grid-cols-3 md:divide-x md:divide-y-0">
            <JourneyItem
              label="1"
              title="Hele landet"
              description="Start her for nationale summarytal og en samlet vej ind i produktet."
              href="/land"
            />
            <div className="md:px-5">
              <JourneyItem
                label="2"
                title="Kommuner"
                description="Vælg en kommune for lokalt kort, registervisning og kommune-kontekst."
                href="/kommune"
              />
            </div>
            <div className="md:pl-5">
              <JourneyItem
                label="3"
                title="Enkelte registreringer"
                description="Find detail-siderne via kommunevisningen, når en registrering findes i app_v2."
                href="/kommune"
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
                Her vises få aktive registreringer med høj registreret kapacitet som konkrete indgange til
                detail-siderne. De er ikke anbefalinger, en komplet national liste eller en vurdering af beredskab.
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
              Kommuneoversigten er den mest stabile offentlige indgang til lokale registreringer. Den enkelte
              kommuneside viser lokal kontekst og forklarer tydeligt, når app_v2-data og eksisterende kortflow vises
              side om side.
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
              <h2 className="text-lg font-semibold text-white">Største kommuner i datalaget</h2>
              <p className="mt-1 text-sm text-gray-400">
                Sorteret efter antal aktive registreringer. Listen er en indgang til kommunesider, ikke en rangering af
                sikkerhed, adgang eller beredskab.
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
      </div>
    </main>
  );
}
