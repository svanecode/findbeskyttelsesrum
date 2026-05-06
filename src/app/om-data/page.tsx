import Link from "next/link";
import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import {
  getAppV2MunicipalitySummaries,
  getAppV2ShelterCount,
  getLatestAppV2ImportRun,
  type AppV2ImportRunSummary,
} from "@/lib/supabase/app-v2-queries";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Datagrundlag",
  description:
    "Findbeskyttelsesrum bygger på offentlige registerdata fra BBR og DAR. Læs om datagrundlag, opdatering og forbehold.",
  alternates: {
    canonical: "/om-data",
  },
  openGraph: {
    title: "Datagrundlag",
    description:
      "Findbeskyttelsesrum bygger på offentlige registerdata fra BBR og DAR. Læs om datagrundlag, opdatering og forbehold.",
    type: "website",
    locale: "da_DK",
    siteName: "Find Beskyttelsesrum",
    url: "https://findbeskyttelsesrum.dk/om-data",
  },
};

type DataOverview =
  | {
      ok: true;
      municipalityCount: number;
      activeShelterCount: number;
      latestImportRun: AppV2ImportRunSummary | null;
    }
  | {
      ok: false;
    };

function formatDateTime(value: string | null) {
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function getDataOverview(): Promise<DataOverview> {
  try {
    const [municipalities, activeShelterCount, latestImportRun] = await Promise.all([
      getAppV2MunicipalitySummaries(),
      getAppV2ShelterCount(),
      getLatestAppV2ImportRun(),
    ]);

    return {
      ok: true,
      municipalityCount: municipalities.length,
      activeShelterCount,
      latestImportRun,
    };
  } catch (error) {
    console.error("Could not load app_v2 public data overview:", error);
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

export default async function DataPage() {
  const overview = await getDataOverview();
  const latestImportCompletedAt = overview.ok ? formatDateTime(overview.latestImportRun?.finishedAt ?? null) : null;

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-10 max-w-3xl space-y-5">
          <p className="text-sm uppercase tracking-wide text-gray-400">Data</p>
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">Datagrundlag</h1>
          <p className="text-lg leading-8 text-gray-300">
            Findbeskyttelsesrum bygger på offentlige registerdata fra BBR og DAR. Siden er uafhængig og ikke tilknyttet
            den danske stat.
          </p>
          <p className="text-sm leading-6 text-gray-400">Følg altid myndighedernes anvisninger i en akut situation.</p>
          <div className="pt-1">
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
            >
              Gå til forsiden
            </Link>
          </div>
        </header>

        {overview.ok ? (
          <section className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Kommuner"
              value={overview.municipalityCount.toLocaleString("da-DK")}
              note="Kommuner i oversigten."
            />
            <StatCard
              label="Beskyttelsesrum i oversigten"
              value={overview.activeShelterCount.toLocaleString("da-DK")}
              note="Antal beskyttelsesrum der indgår i den samlede oversigt ud fra registerdata."
            />
            <StatCard
              label="Senest opdateret"
              value={latestImportCompletedAt ?? "Ikke registreret"}
              note="Vises kun hvis der findes opdateringsdato."
            />
          </section>
        ) : (
          <section className="mb-8 rounded-lg border border-orange-500/20 bg-white/5 p-5 sm:p-6" role="alert">
            <h2 className="text-lg font-semibold text-white">Kunne ikke hente oversigtstal</h2>
            <p className="mt-2 text-sm leading-6 text-gray-300">
              Vi kunne ikke hente de seneste tal fra databasen lige nu. Resten af siden om datagrundlag kan du stadig
              læse. Prøv at genindlæse, eller gå til forsiden og søg efter beskyttelsesrum som sædvanligt.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a
                href="/om-data"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
              >
                Genindlæs siden
              </a>
              <Link
                href="/"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15"
              >
                Til forsiden
              </Link>
              <Link
                href="/kommune"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Kommuneoversigt
              </Link>
            </div>
          </section>
        )}

        <div className="grid gap-6">
          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Hvor kommer data fra?</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Oversigten bygger på offentlige registerdata fra BBR (Bygnings- og Boligregistret) og DAR (Danmarks
              Adresseregister). Siderne viser registrerede oplysninger og kan have begrænsninger.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Hvor ofte opdateres data?</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Hvis der findes en opdateringsdato, vises den øverst på siden. Mangler datoen, kan siden stadig vise
              beskyttelsesrum, men uden en tydelig “senest opdateret”.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Hvad siden ikke lover</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Beskyttelsesrum og registreret kapacitet er ikke en garanti for adgang, klargøring, myndighedsgodkendelse
              eller aktuel fysisk stand. Udvalgte beskyttelsesrum på kommunesider er indgange til detail-sider, ikke
              anbefalinger eller komplette lister.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Næste skridt</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Brug forsiden til adresse- eller placeringssøgning, eller gå via kommuneoversigten, hvis du vil orientere dig
              lokalt.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
              >
                Gå til forsiden
              </Link>
              <Link
                href="/kommune"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
              >
                Kommuneoversigt
              </Link>
            </div>
          </section>
        </div>
      </div>

      <GlobalFooter />
    </main>
  );
}
