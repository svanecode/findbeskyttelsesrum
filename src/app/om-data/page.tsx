import Link from "next/link";
import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import ProductMetricView from "@/components/ProductMetricView";
import { ui } from "@/components/ui-classes";
import {
  getAppV2MunicipalitySummaries,
  getAppV2PublicDataFunnel,
  getAppV2PublicDataStats,
  type AppV2PublicDataFunnel,
  type AppV2PublicDataStats,
} from "@/lib/supabase/app-v2-queries";
import { siteUrl } from "@/lib/seo/site";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Datagrundlag",
  description:
    "Find Beskyttelsesrum bygger på offentlige registerdata fra BBR og DAR. Læs om datagrundlag, opdatering og forbehold.",
  alternates: {
    canonical: "/om-data",
  },
  openGraph: {
    title: "Datagrundlag",
    description:
      "Find Beskyttelsesrum bygger på offentlige registerdata fra BBR og DAR. Læs om datagrundlag, opdatering og forbehold.",
    type: "website",
    locale: "da_DK",
    siteName: "Find Beskyttelsesrum",
    url: `${siteUrl}/om-data`,
  },
};

type DataOverview =
  | {
      ok: true;
      municipalityCount: number;
      stats: AppV2PublicDataStats;
      funnel: AppV2PublicDataFunnel;
    }
  | {
      ok: false;
    };

async function getDataOverview(): Promise<DataOverview> {
  try {
    const [municipalities, stats, funnel] = await Promise.all([
      getAppV2MunicipalitySummaries(),
      getAppV2PublicDataStats(),
      getAppV2PublicDataFunnel(),
    ]);

    return {
      ok: true,
      municipalityCount: municipalities.length,
      stats,
      funnel,
    };
  } catch (error) {
    console.error("Could not load app_v2 public data overview:", error);
    return { ok: false };
  }
}

function formatDataDate(value: string | null) {
  if (!value) return "Ikke oplyst";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ikke oplyst";
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={`${ui.panel} p-5`}>
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-gray-400">{note}</p>
    </div>
  );
}

export default async function DataPage() {
  const overview = await getDataOverview();

  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      <ProductMetricView eventName="data_explanation_opened" />
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="mb-10 max-w-3xl space-y-5">
          <p className={ui.eyebrow}>Data</p>
          <h1 className={ui.pageTitle}>Datagrundlag</h1>
          <p className="text-lg leading-8 text-gray-300">
            Find Beskyttelsesrum er et uafhængigt orienteringsværktøj baseret på BBR-registreringer af
            sikringsrumspladser og adresser fra DAR. Siden er ikke en myndighedstjeneste.
          </p>
          <p className="text-sm leading-6 text-gray-300">
            En registrering dokumenterer ikke offentlig adgang, klargøring eller aktuel fysisk stand. Ved varsling skal du
            gå indenfor og følge information fra myndighederne.
          </p>
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
          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Kommuner"
              value={overview.municipalityCount.toLocaleString("da-DK")}
              note="Kommuner i oversigten."
            />
            <StatCard
              label="Viste BBR-registreringer"
              value={overview.stats.publicRegistrations.toLocaleString("da-DK")}
              note="Registreringer efter sidens udvælgelses- og eksklusionsregler."
            />
            <StatCard
              label="Registrerede pladser i udvalget"
              value={overview.stats.publicCapacity.toLocaleString("da-DK")}
              note="Ikke en samlet national opgørelse over alle typer beskyttelsesrum."
            />
            <StatCard
              label="Seneste dataimport"
              value={formatDataDate(overview.stats.latestPublicImportAt)}
              note="Fysisk stand er ikke verificeret i dette datasæt."
            />
          </section>
        ) : (
          <section className="mb-8 rounded-lg border border-orange-500/20 bg-white/5 p-5 sm:p-6" role="alert">
            <h2 className="text-lg font-semibold text-white">Kunne ikke hente oversigtstal</h2>
            <p className="mt-2 text-sm leading-6 text-gray-300">
              Vi kunne ikke hente de seneste tal fra databasen lige nu. Resten af siden om datagrundlag kan du stadig
              læse. Prøv at genindlæse, eller gå til forsiden og søg i BBR-registreringerne.
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

        <div className="border-b border-white/10">
          <section className="border-t border-white/10 py-6 sm:py-8">
            <h2 className="text-lg font-semibold text-white">Hvor kommer data fra?</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Oplysninger om bygninger og kapacitet kommer fra{" "}
              <a className="text-white underline underline-offset-4 hover:text-orange-300" href="https://bbr.dk/bbr" rel="noopener noreferrer" target="_blank">
                BBR (Bygnings- og Boligregistret)
              </a>
              . Adresser og koordinater kobles med{" "}
              <a className="text-white underline underline-offset-4 hover:text-orange-300" href="https://danmarksadresser.dk/om-adresser/danmarks-adresseregister-dar" rel="noopener noreferrer" target="_blank">
                DAR (Danmarks Adresseregister)
              </a>
              . Data hentes via Datafordeler. Registeroplysninger kan være ufuldstændige eller forsinkede.
            </p>
          </section>

          <section className="border-t border-white/10 py-6 sm:py-8">
            <h2 className="text-lg font-semibold text-white">Hvilke registreringer vises?</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Oversigten viser publicerede BBR-registreringer med mindst 40 registrerede pladser og en
              bygningsanvendelseskode, der er medtaget i søgningen. Registreringer, som ikke længere findes i datakilden,
              er fravalgt. Det samme gælder konkrete registreringer, som er udelukket fra den offentlige oversigt.
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              Nærhedssøgning og kort kræver desuden brugbare koordinater. Derfor kan antallet variere mellem oversigter.
            </p>
            {overview.ok ? (
              <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
                <table className="min-w-full border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Trinvis afgrænsning fra aktive BBR-rækker til registreringer på landskortet
                  </caption>
                  <thead className="bg-white/5 text-gray-300">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">Trin</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Registreringer</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Pladser</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-gray-200">
                    {[
                      {
                        label: "Aktive rækker fra datakilden",
                        registrations: overview.funnel.activeSourceRegistrations,
                        capacity: overview.funnel.activeSourceCapacity,
                      },
                      {
                        label: "Mindst 40 registrerede pladser",
                        registrations: overview.funnel.capacityThresholdRegistrations,
                        capacity: overview.funnel.capacityThresholdCapacity,
                      },
                      {
                        label: "Medtaget bygningsanvendelse",
                        registrations: overview.funnel.applicationEligibleRegistrations,
                        capacity: overview.funnel.applicationEligibleCapacity,
                      },
                      {
                        label: "Publiceret i datamodellen",
                        registrations: overview.funnel.publishedRegistrations,
                        capacity: overview.funnel.publishedCapacity,
                      },
                      {
                        label: "Efter publicering og eksklusioner",
                        registrations: overview.stats.publicRegistrations,
                        capacity: overview.stats.publicCapacity,
                      },
                      {
                        label: "Med koordinater på landskortet",
                        registrations: overview.stats.mappedRegistrations,
                        capacity: overview.stats.mappedCapacity,
                      },
                    ].map((row) => (
                      <tr key={row.label}>
                        <th scope="row" className="px-4 py-3 font-normal">{row.label}</th>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.registrations.toLocaleString("da-DK")}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.capacity.toLocaleString("da-DK")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="border-t border-white/10 py-6 sm:py-8">
            <h2 className="text-lg font-semibold text-white">Hvorfor er tallet ikke en national total?</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Den officielle opgørelse fra 2024 omfattede cirka 3,681 millioner pladser på tværs af sikringsrum,
              offentlige beskyttelsesrum og supplerende rum. Denne side viser kun et afgrænset udvalg af
              BBR-registreringer efter reglerne ovenfor og kan derfor ikke sammenlignes direkte med den samlede
              officielle opgørelse.
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Den officielle opgørelse var heller ikke en fysisk kontrol af, om rummene fortsat var egnede eller
              klargjorte. Se den{" "}
              <a
                href="https://www.ft.dk/samling/20241/almdel/fou/spm/268/svar/2137655/3018567/index.htm"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline underline-offset-4 hover:text-orange-300"
              >
                officielle opgørelse hos Folketinget
              </a>
              .
            </p>
          </section>

          <section className="border-t border-white/10 py-6 sm:py-8">
            <h2 className="text-lg font-semibold text-white">Sikringsrum og offentlige beskyttelsesrum</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Sikringsrum er som udgangspunkt knyttet til personer, der bor, arbejder eller har ærinde i ejendommen.
              Offentlige beskyttelsesrum er en anden kategori. BBR-feltet på denne side dokumenterer ikke, at en adresse
              er et offentligt tilgængeligt beskyttelsesrum.
            </p>
            <p className="mt-3 text-sm">
              <a
                href="https://www.borger.dk/politi-retsvaesen-forsvar/Forsvar-og-beredskab/beskyttelsesrum-og-sikringsrum"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline underline-offset-4 hover:text-orange-300"
              >
                Læs myndighedernes forklaring på Borger.dk
              </a>
            </p>
          </section>

          <section className="border-t border-white/10 py-6 sm:py-8">
            <h2 className="text-lg font-semibold text-white">Hvor ofte opdateres data?</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Datagrundlaget importeres løbende. Datoen ovenfor viser den seneste dataimport i det aktuelt viste datasæt.
              Der kan gå tid, fra en ændring foretages i et offentligt register, til den fremgår her.
            </p>
          </section>

          <section className="border-t border-white/10 py-6 sm:py-8">
            <h2 className="text-lg font-semibold text-white">Hvad siden ikke lover</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              En BBR-registrering og dens kapacitet er ikke en garanti for adgang, klargøring, myndighedsgodkendelse
              eller aktuel fysisk stand. Kort, søgelister og kommuneoversigter er orienterende og er ikke anbefalinger.
            </p>
          </section>

          <section id="rapportering" className="scroll-mt-24 border-t border-white/10 py-6 sm:py-8">
            <h2 className="text-lg font-semibold text-white">Rapportér en mulig fejl</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Åbn detaljesiden for den konkrete registrering og vælg “Rapportér fejl ved registreringen”. Rapporten
              lægges i en privat moderationskø og ændrer ikke de viste data automatisk.
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              Du kan blandt andet rapportere en forkert adresse, en manglende bygning, forkert kapacitet eller manglende
              tilgængelighed.
            </p>
            <div className="mt-4">
              <Link href="/" className="inline-flex min-h-[44px] items-center rounded-lg px-3 font-medium text-white underline underline-offset-4 hover:bg-white/5">
                Find registreringen fra forsiden
              </Link>
            </div>
          </section>

          <section className="border-t border-white/10 py-6 sm:py-8">
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
