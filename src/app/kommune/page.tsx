import Link from "next/link";
import type { Metadata } from "next";

import { getAppV2MunicipalitySummaries } from "@/lib/supabase/app-v2-queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kommuner med beskyttelsesrum",
  description:
    "Se kommuner med aktive registreringer af beskyttelsesrum og gå videre til den enkelte kommuneside.",
  alternates: {
    canonical: "/kommune",
  },
  openGraph: {
    title: "Kommuner med beskyttelsesrum",
    description: "Oversigt over kommuner med aktive registreringer af beskyttelsesrum.",
    type: "website",
    locale: "da_DK",
    siteName: "Find Beskyttelsesrum",
    url: "https://findbeskyttelsesrum.dk/kommune",
  },
};

export default async function MunicipalityOverviewPage() {
  const municipalities = (await getAppV2MunicipalitySummaries()).sort((a, b) =>
    a.name.localeCompare(b.name, "da-DK"),
  );

  const municipalityCount = municipalities.length;
  const activeShelterCount = municipalities.reduce(
    (total, municipality) => total + municipality.activeShelterCount,
    0,
  );

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
            href="/om-data"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
          >
            Om data
          </Link>
        </nav>

        <header className="mb-10 max-w-3xl space-y-5">
          <p className="text-sm uppercase tracking-wide text-gray-400">Kommuner</p>
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
            Kommuner med registrerede beskyttelsesrum
          </h1>
          <p className="text-lg leading-8 text-gray-300">
            En enkel oversigt over kommuner med aktive registreringer i det nye datalag. Vælg en kommune for at åbne
            den eksisterende kommuneside.
          </p>
          <p className="text-sm leading-6 text-gray-400">
            Oversigten viser kun kommuneoplysninger og overordnede tal. Kort, shelter-lister og nærliggende resultater
            er holdt ude af denne side.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-gray-400">Kommuner</p>
            <p className="mt-2 text-2xl font-semibold text-white">{municipalityCount.toLocaleString("da-DK")}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-gray-400">Aktive registreringer</p>
            <p className="mt-2 text-2xl font-semibold text-white">{activeShelterCount.toLocaleString("da-DK")}</p>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-5 py-4 sm:px-6">
            <h2 className="text-lg font-semibold text-white">Oversigt</h2>
            <p className="mt-1 text-sm text-gray-400">Kommuner sorteret alfabetisk efter visningsnavn.</p>
          </div>

          {municipalities.length === 0 ? (
            <p className="px-5 py-6 text-gray-300 sm:px-6">Der er ikke registreret kommuner i datalaget endnu.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {municipalities.map((municipality) => (
                <li key={municipality.id}>
                  <Link
                    href={`/kommune/${municipality.slug}`}
                    className="flex flex-col gap-2 px-5 py-4 transition hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  >
                    <span>
                      <span className="block font-medium text-white">{municipality.name}</span>
                      {municipality.code && (
                        <span className="mt-1 block text-sm text-gray-400">Kommunekode {municipality.code}</span>
                      )}
                    </span>
                    <span className="flex flex-col gap-1 text-sm text-gray-300 sm:items-end">
                      <span>{municipality.activeShelterCount.toLocaleString("da-DK")} aktive registreringer</span>
                      <span className="font-medium text-white">Se kommune</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Om tallene</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
            Tallene kommer fra app_v2-laget og tæller aktive shelterregistreringer pr. kommune. De er ikke en garanti
            for adgang, stand eller myndighedsgodkendelse af et konkret rum.
          </p>
          <Link
            href="/om-data"
            className="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
          >
            Læs om data
          </Link>
        </section>
      </div>
    </main>
  );
}
