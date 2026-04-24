import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import SiteHeader from "@/components/SiteHeader";
import {
  getAppV2MunicipalitySummaries,
  getAppV2ShelterCount,
  getAppV2TotalShelterCapacity,
  getLatestAppV2ImportRun,
} from "@/lib/supabase/app-v2-queries";

import CountryMapExperience from "./country-map-experience";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Kort over beskyttelsesrum i Danmark",
  description:
    "Interaktivt landskort med alle registrerede beskyttelsesrum i Danmark. Zoom, klik og find det nærmeste beskyttelsesrum i dit område.",
  alternates: { canonical: "/kort" },
  openGraph: {
    title: "Kort over beskyttelsesrum i Danmark",
    description: "Interaktivt landskort med alle registrerede beskyttelsesrum i Danmark.",
    type: "website",
    url: "https://findbeskyttelsesrum.dk/kort",
    siteName: "Find Beskyttelsesrum",
    locale: "da_DK",
  },
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
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-sm">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-gray-400">{note}</p>
    </div>
  );
}

export default async function CountryMapPage() {
  const [totalCount, totalCapacity, municipalities, latestImportRun] = await Promise.all([
    getAppV2ShelterCount(),
    getAppV2TotalShelterCapacity(),
    getAppV2MunicipalitySummaries(),
    getLatestAppV2ImportRun(),
  ]);

  const activeMunicipalityCount = municipalities.filter((municipality) => municipality.activeShelterCount > 0)
    .length;
  const latestImportCompletedAt = formatDate(latestImportRun?.finishedAt ?? null);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <SiteHeader />

      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 max-w-3xl space-y-4">
          <p className="text-sm uppercase tracking-wide text-gray-400">Hele landet</p>
          <h1 className="font-space-grotesk text-3xl font-bold leading-tight text-white sm:text-4xl">
            Beskyttelsesrum i Danmark
          </h1>
          <p className="text-lg leading-8 text-gray-300">
            Kort med alle {totalCount.toLocaleString("da-DK")} registrerede beskyttelsesrum i Danmark, fordelt på{" "}
            {activeMunicipalityCount.toLocaleString("da-DK")} kommuner med samlet{" "}
            {totalCapacity.toLocaleString("da-DK")} registrerede pladser.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Aktive registreringer"
            value={totalCount.toLocaleString("da-DK")}
            note="Alle aktive registreringer i det aktuelle datalag."
          />
          <StatCard
            label="Registrerede pladser"
            value={totalCapacity.toLocaleString("da-DK")}
            note="Summen af registreret kapacitet i aktive registreringer."
          />
          <StatCard
            label="Kommuner med data"
            value={activeMunicipalityCount.toLocaleString("da-DK")}
            note={`Ud af ${municipalities.length.toLocaleString("da-DK")} kommuner i datalaget.`}
          />
          <StatCard
            label="Seneste import"
            value={latestImportCompletedAt ?? "Ikke registreret"}
            note="Seneste afsluttede importkørsel i app_v2."
          />
        </section>
      </div>

      <section className="w-full px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <CountryMapExperience />
        </div>
      </section>

      <GlobalFooter />
    </main>
  );
}
