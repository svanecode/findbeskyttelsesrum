import Link from "next/link";
import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import SiteHeader from "@/components/SiteHeader";
import {
  getAppV2MunicipalitySummaries,
  getAppV2ShelterCount,
  getLatestAppV2ImportRun,
  type AppV2ImportRunSummary,
} from "@/lib/supabase/app-v2-queries";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Om data",
  description:
    "Forklaring af datagrundlaget bag land-, kommune- og detail-siderne — aktive registreringer, registrerede pladser og grænsen til den almindelige søgning.",
  alternates: {
    canonical: "/om-data",
  },
  openGraph: {
    title: "Om data",
    description:
      "Hvordan land-, kommune- og detail-sider bruger registerdata, og hvad der ikke følger med i tallene.",
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

      <SiteHeader />

      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-10 max-w-3xl space-y-5">
          <p className="text-sm uppercase tracking-wide text-gray-400">Data</p>
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">Om datagrundlaget</h1>
          <p className="text-lg leading-8 text-gray-300">
            Land-, kommune- og detail-siderne bruger registerdata fra det aktuelle datalag bag Find Beskyttelsesrum.
          </p>
          <p className="text-sm leading-6 text-gray-400">
            Siden beskriver de offentlige destinationssider. Adressebaseret søgning, nærliggende resultater og kort i
            det almindelige søgningsforløb kører fortsat uden for denne forklaring.
          </p>
        </header>

        {overview.ok ? (
          <section className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Kommuner"
              value={overview.municipalityCount.toLocaleString("da-DK")}
              note="Kommuner der findes i det aktuelle kommuneregister i datalaget."
            />
            <StatCard
              label="Aktive registreringer"
              value={overview.activeShelterCount.toLocaleString("da-DK")}
              note="Registreringer der er aktive i det aktuelle datagrundlag."
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
              Appen kunne ikke hente live-tal lige nu. Derfor viser siden ingen fallback-tal.
            </p>
          </section>
        )}

        <div className="grid gap-6">
          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Hvad data repræsenterer</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Data er struktureret, så officielle importerede felter kan holdes adskilt fra senere manuelle rettelser,
              fravalg og rapporter. Det gør datagrundlaget lettere at forklare og vedligeholde.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Hvad data bygger på</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Datalaget er forberedt til importerede registeroplysninger om beskyttelsesrum, kommuner, kildeidentitet og
              importhistorik. De offentlige sider viser kun felter, der findes i databasen og egner sig til enkel
              offentlig visning.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Sådan hænger siderne sammen</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Landssiden giver nationalt overblik og regional struktur. Kommuneoversigten leder videre til lokale
              kommunesider med nøgletal, postområder, liste og kort samt veje til detail-sider. Detail-sider viser én
              aktiv registrering med kilde- og opdateringskontekst.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/land"
                className="inline-flex items-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
              >
                Se hele landet
              </Link>
              <Link
                href="/kommune"
                className="inline-flex items-center rounded-lg px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
              >
                Se kommuner
              </Link>
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Hvad siden ikke lover</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Registreringer og registreret kapacitet er ikke en garanti for adgang, klargøring, myndighedsgodkendelse
              eller aktuel fysisk stand.               Udvalgte eksempelregistreringer på land- og kommunesider er indgange til detail-sider, ikke anbefalinger
              eller komplette lister.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Nærliggende resultater</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Den normale adressebaserede søgning og kortvisning bruger fortsat den normale søgning. Nærliggende
              resultater kræver præcis håndtering af
              afstand, gruppering, fravalg og kildebaseret typefiltrering.
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              En senere ændring af nærliggende resultater kræver særskilt validering, før den kan blive den
              brugersynlige standard.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Næste skridt</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Vend tilbage til forsiden for adressesøgning, eller fortsæt i destinationssporet land → kommuner →
              lokalt overblik.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
              >
                Til forsiden
              </Link>
              <Link
                href="/land"
                className="inline-flex items-center rounded-lg px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
              >
                Hele landet
              </Link>
              <Link
                href="/kommune"
                className="inline-flex items-center rounded-lg px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
              >
                Kommuner
              </Link>
            </div>
          </section>
        </div>
      </div>

      <GlobalFooter />
    </main>
  );
}
