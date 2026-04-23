import Link from "next/link";
import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import SiteHeader from "@/components/SiteHeader";
import { getAppV2MunicipalitySummaries } from "@/lib/supabase/app-v2-queries";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Kommuner med aktive registreringer",
  description:
    "Alfabetisk oversigt over kommuner i datalaget med aktive registreringer — med vej videre til lokale sider, kort og forklaring af tallene.",
  alternates: {
    canonical: "/kommune",
  },
  openGraph: {
    title: "Kommuner med aktive registreringer",
    description:
      "Oversigt over kommuner i datalaget og lokale sider med aktive registreringer, registrerede pladser og kortkontekst.",
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

      <SiteHeader />

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-10 max-w-3xl space-y-5">
          <p className="text-sm uppercase tracking-wide text-gray-400">Kommuner</p>
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
            Kommuner med aktive registreringer
          </h1>
          <p className="text-lg leading-8 text-gray-300">
            Brug oversigten som stabil indgang fra landssiden til lokale kommunesider med liste, kort og
            registerbaserede nøgletal.
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
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Registreringer der er aktive i det aktuelle datagrundlag.
            </p>
          </div>
        </section>

        <section className="mb-8 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Fra hele landet til den enkelte kommune</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
            Landssiden samler de nationale tal. Kommuneoversigten gør det muligt at gå fra det samlede billede
            til lokale kommunesider med nøgletal, postområder, adresseliste med veje til detail-sider og kortvisning.
          </p>
          <Link
            href="/land"
            className="mt-4 inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
          >
            Se hele landet
          </Link>
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
            Tallene kommer fra databasen og tæller registreringer, der er aktive i det aktuelle datagrundlag. De er ikke
            en garanti for adgang, fysisk stand, klargøring eller myndighedsgodkendelse af et konkret rum.
          </p>
          <Link
            href="/om-data"
            className="mt-4 inline-flex items-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
          >
            Om data
          </Link>
        </section>

        <section className="mt-8 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Næste skridt</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
            Gå tilbage til landssiden for national kontekst, eller åbn{" "}
            <Link href="/om-data" className="text-white underline-offset-2 hover:underline">
              Om data
            </Link>{" "}
            før du fortolker registrerede pladser og aktive registreringer.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/land"
              className="inline-flex items-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
            >
              Hele landet
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded-lg px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
            >
              Til forsiden
            </Link>
          </div>
        </section>
      </div>

      <GlobalFooter />
    </main>
  );
}
