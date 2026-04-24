import Link from "next/link";
import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import { getAppV2MunicipalitySummaries } from "@/lib/supabase/app-v2-queries";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Kommuneoversigt",
  description:
    "Oversigt over kommuner med registrerede beskyttelsesrum. Brug søgning på forsiden for at finde nærmeste beskyttelsesrum.",
  alternates: {
    canonical: "/kommune",
  },
  openGraph: {
    title: "Kommuneoversigt",
    description:
      "Oversigt over kommuner med registrerede beskyttelsesrum. Brug søgning på forsiden for at finde nærmeste beskyttelsesrum.",
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

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-10 max-w-3xl space-y-5">
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
            Kommuneoversigt
          </h1>
          <p className="text-lg leading-8 text-gray-300">
            Brug søgning på forsiden, hvis du hurtigt skal finde nærmeste beskyttelsesrum. Kommuneoversigten er en
            sekundær indgang til lokalt overblik.
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

        <section className="rounded-lg border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-5 py-4 sm:px-6">
            <h2 className="text-lg font-semibold text-white">Oversigt</h2>
            <p className="mt-1 text-sm text-gray-400">Kommuner sorteret alfabetisk efter visningsnavn.</p>
          </div>

          {municipalities.length === 0 ? (
            <p className="px-5 py-6 text-gray-300 sm:px-6">Der er ikke registreret kommuner i oversigten endnu.</p>
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
                    </span>
                    <span className="flex flex-col gap-1 text-sm text-gray-300 sm:items-end">
                      <span>{municipality.activeShelterCount.toLocaleString("da-DK")} beskyttelsesrum i oversigten</span>
                      <span className="font-medium text-white">Se kommune</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <GlobalFooter />
    </main>
  );
}
