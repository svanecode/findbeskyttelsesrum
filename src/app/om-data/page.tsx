import Link from "next/link";
import type { Metadata } from "next";

import {
  getAppV2MunicipalitySummaries,
  getAppV2ShelterCount,
  getLatestAppV2ImportRun,
  type AppV2ImportRunSummary,
} from "@/lib/supabase/app-v2-queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Om data",
  description:
    "Kort forklaring af datagrundlaget bag de nye offentlige app_v2-sider for kommuner og beskyttelsesrum.",
  alternates: {
    canonical: "/om-data",
  },
  openGraph: {
    title: "Om data",
    description: "Læs hvordan de nye offentlige app_v2-sider bruger registerdata om beskyttelsesrum.",
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
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-8 sm:px-6 lg:px-8">
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
        </nav>

        <header className="mb-10 max-w-3xl space-y-5">
          <p className="text-sm uppercase tracking-wide text-gray-400">Data</p>
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">Om datagrundlaget</h1>
          <p className="text-lg leading-8 text-gray-300">
            De nye offentlige sider for kommuner og enkelte beskyttelsesrum læser fra app_v2, som er det nye datalag i
            moderniseringen af Find Beskyttelsesrum.
          </p>
          <p className="text-sm leading-6 text-gray-400">
            Siden beskriver kun de app_v2-baserede surfaces. Søgning, nærliggende resultater, kort og eksisterende
            kommune-lister kører fortsat på de ældre flows, indtil de er valideret separat.
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
              note="Shelters med aktiv importtilstand."
            />
            <StatCard
              label="Seneste import"
              value={latestImportCompletedAt ?? "Ikke registreret"}
              note="Vises kun hvis afsluttet importmetadata findes."
            />
          </section>
        ) : (
          <section className="mb-8 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Live-tal er ikke tilgængelige</h2>
            <p className="mt-2 text-sm leading-6 text-gray-300">
              Appen kunne ikke hente app_v2-tal lige nu. Derfor viser siden ingen fallback-tal.
            </p>
          </section>
        )}

        <div className="grid gap-6">
          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Hvad app_v2 repræsenterer</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              app_v2 er den nye struktur for importerede shelter- og kommunedata. Den adskiller officielle importerede
              felter fra senere manuelle rettelser, exclusions og rapporter, så fremtidige cutovers kan ske mere
              kontrolleret.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Hvad data bygger på</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Datalaget er forberedt til importerede registeroplysninger om beskyttelsesrum, kommuner, kildeidentitet og
              importhistorik. De offentlige sider viser kun felter, der allerede findes i app_v2 og egner sig til enkel
              offentlig visning.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Hvad siden ikke lover</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Registreringer er ikke en garanti for adgang, klargøring, myndighedsgodkendelse eller aktuel fysisk stand.
              Nærliggende resultater, kortvisninger og legacy kommune-lister er ikke flyttet til app_v2 i denne pakke.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
