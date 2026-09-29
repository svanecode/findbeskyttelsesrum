import type { Metadata } from "next";

import AdminHeader from "@/components/admin/AdminHeader";
import { BarList, chartColors, ColumnChart, type ColumnPoint } from "@/components/admin/charts";
import { getAdminStatistics } from "@/lib/analytics/admin-statistics";
import { getProductMetricSummary } from "@/lib/analytics/product-metrics-server";
import { requireModerator } from "@/lib/moderation/auth";

import { signOutModeratorAction } from "../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Statistik",
  robots: { index: false, follow: false, nocache: true },
};

const countFormat = new Intl.NumberFormat("da-DK");
const shortDay = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const reportTypeLabels: Record<string, string> = {
  incorrect_address: "Forkert adresse",
  building_missing: "Bygningen findes ikke",
  not_a_shelter: "Ikke et beskyttelsesrum",
  unavailable: "Ikke tilgængeligt",
  incorrect_capacity: "Forkert kapacitet",
  duplicate_record: "Dublet",
  other: "Andet",
};

const outcomeLabels: Record<string, string> = {
  no_change: "Afsluttet uden ændring",
  corrected: "Data rettet",
  excluded: "Ekskluderet",
  rejected: "Afvist",
};

function date(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function weekLabel(value: string) {
  return `Uge fra ${shortDay.format(date(value))}`;
}

function duration(hours: number | null) {
  if (hours === null) return "—";
  if (hours < 1) return "under 1 time";
  if (hours < 48) return `${Math.round(hours)} timer`;
  return `${Math.round(hours / 24)} dage`;
}

function percentage(part: number, total: number) {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : "—";
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
      {note ? <dd className="mt-1 text-xs text-gray-400">{note}</dd> : null}
    </div>
  );
}

function Section({ id, eyebrow, title, children, note }: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.04] p-5 sm:p-6" aria-labelledby={id}>
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-2xl font-semibold">{title}</h2>
      {children}
      {note ? <p className="mt-4 text-xs leading-5 text-gray-400">{note}</p> : null}
    </section>
  );
}

function ChartBlock({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-gray-400">{description}</p>
      {children}
    </div>
  );
}

export default async function AdminStatisticsPage() {
  const { profile } = await requireModerator(true);
  const [statistics, totals] = await Promise.all([
    getAdminStatistics(30).catch(() => null),
    getProductMetricSummary(30).catch(() => []),
  ]);

  const total = (eventName: (typeof totals)[number]["eventName"]) =>
    totals.find((metric) => metric.eventName === eventName)?.eventCount ?? 0;
  const searches = total("address_search_started") + total("geolocation_requested");
  const areasChosen = total("address_selected") + total("geolocation_succeeded");
  const resultLoads = total("nearby_results_loaded") + total("nearby_no_results");
  const gpsDecisions = total("geolocation_succeeded") + total("geolocation_denied");
  const loadMetric = totals.find((metric) => metric.eventName === "nearby_results_loaded");
  const averageLoad = loadMetric && loadMetric.durationSampleCount > 0
    ? loadMetric.durationTotalMs / loadMetric.durationSampleCount / 1000
    : null;
  const errors = (["address_search_error", "geolocation_error", "nearby_error", "report_error", "client_error"] as const)
    .reduce((sum, eventName) => sum + total(eventName), 0);

  const dailyPoints = (pick: (day: NonNullable<typeof statistics>["daily"][number]) => Record<string, number | null>): ColumnPoint[] =>
    (statistics?.daily ?? []).map((day) => ({
      label: shortDay.format(date(day.day)),
      title: longDay.format(date(day.day)),
      values: pick(day),
    }));

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 pb-16 sm:px-6 lg:px-8">
        <AdminHeader
          current="statistics"
          title="Statistik"
          description="Sitets egne anonyme tællere og sagsbehandlingen. Tallene er timevise tællere uden IP-adresse, bruger-id, adresse, koordinater eller søgetekst, så de viser handlinger, ikke unikke besøgende."
          profile={profile}
          signOutAction={signOutModeratorAction}
        />

        <Section id="usage-heading" eyebrow="Seneste 30 dage" title="Brug og stabilitet">
          <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Startede søgninger" value={countFormat.format(searches)} />
            <Tile label="Søgninger med valgt område" value={percentage(areasChosen, searches)} />
            <Tile label="Resultater med fund" value={percentage(total("nearby_results_loaded"), resultLoads)} />
            <Tile label="Gennemsnitlig resultatindlæsning" value={averageLoad === null ? "—" : `${averageLoad.toLocaleString("da-DK", { maximumFractionDigits: 1 })} sek.`} />
            <Tile label="Kort åbnet" value={countFormat.format(total("map_opened"))} />
            <Tile label="Detaljesider åbnet" value={countFormat.format(total("detail_opened"))} />
            <Tile label="Afvist GPS-adgang" value={percentage(total("geolocation_denied"), gpsDecisions)} />
            <Tile label="Registrerede tekniske fejl" value={countFormat.format(errors)} note={`${countFormat.format(total("report_submitted"))} brugerrapporter indsendt`} />
          </dl>
        </Section>

        {statistics ? (
          <>
            <Section
              id="daily-heading"
              eyebrow="Pr. dag, dansk tid"
              title="Udvikling"
            >
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <ChartBlock title="Søgninger" description="Startede søgninger og hvor mange der endte med et valgt område.">
                  <ColumnChart
                    title="Søgninger pr. dag"
                    series={[
                      { key: "searches", label: "Startet", color: chartColors.blue },
                      { key: "areasChosen", label: "Område valgt", color: chartColors.orange },
                    ]}
                    points={dailyPoints((day) => ({ searches: day.searches, areasChosen: day.areasChosen }))}
                  />
                </ChartBlock>
                <ChartBlock title="Tekniske fejl" description="Fejl i adressesøgning, placering, resultater, rapporter og browseren.">
                  <ColumnChart
                    title="Tekniske fejl pr. dag"
                    emptyText="Ingen tekniske fejl registreret i perioden."
                    series={[{ key: "errors", label: "Fejl", color: chartColors.blue }]}
                    points={dailyPoints((day) => ({ errors: day.errors }))}
                  />
                </ChartBlock>
                <ChartBlock title="Resultatindlæsning" description="Gennemsnitlig tid fra søgning til viste resultater.">
                  <ColumnChart
                    title="Gennemsnitlig resultatindlæsning pr. dag"
                    series={[{ key: "load", label: "Indlæsning", color: chartColors.blue }]}
                    points={dailyPoints((day) => ({ load: day.averageLoadMs === null ? null : day.averageLoadMs / 1000 }))}
                    format={(value) => value.toLocaleString("da-DK", { maximumFractionDigits: 1 })}
                    unit="sek."
                  />
                </ChartBlock>
                <ChartBlock title="Kort og detaljesider" description="Åbnede kort (resultater og landskort) og detaljesider.">
                  <ColumnChart
                    title="Kort og detaljesider pr. dag"
                    series={[
                      { key: "maps", label: "Kort", color: chartColors.blue },
                      { key: "details", label: "Detaljesider", color: chartColors.orange },
                    ]}
                    points={dailyPoints((day) => ({ maps: day.mapsOpened, details: day.detailsOpened }))}
                  />
                </ChartBlock>
              </div>
            </Section>

            <Section id="reports-heading" eyebrow="Seneste 12 uger" title="Fejlrapporter">
              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Tile label="Aktive rapporter" value={countFormat.format(statistics.reports.active)} note="Åbne eller under behandling" />
                <Tile label="Median behandlingstid" value={duration(statistics.reports.medianHoursToClose)} note="Fra modtaget til afsluttet eller afvist" />
                <Tile label="Modtaget i perioden" value={countFormat.format(statistics.reports.weekly.reduce((sum, week) => sum + week.received, 0))} />
              </dl>
              <div className="mt-4 grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
                <ChartBlock title="Modtaget og afsluttet pr. uge" description="Afsluttet omfatter afviste rapporter.">
                  <ColumnChart
                    title="Fejlrapporter pr. uge"
                    emptyText="Ingen fejlrapporter i perioden."
                    series={[
                      { key: "received", label: "Modtaget", color: chartColors.blue },
                      { key: "closed", label: "Afsluttet", color: chartColors.orange },
                    ]}
                    points={statistics.reports.weekly.map((week) => ({
                      label: shortDay.format(date(week.week)),
                      title: weekLabel(week.week),
                      values: { received: week.received, closed: week.closed },
                    }))}
                  />
                </ChartBlock>
                <div className="grid gap-4">
                  <ChartBlock title="Rapporttyper" description="Alle modtagne rapporter.">
                    <BarList
                      title="Rapporttyper"
                      rows={Object.entries(statistics.reports.byType)
                        .map(([type, value]) => ({ label: reportTypeLabels[type] ?? type, value }))
                        .sort((a, b) => b.value - a.value)}
                    />
                  </ChartBlock>
                  <ChartBlock title="Udfald" description="Afsluttede og afviste rapporter.">
                    <BarList
                      title="Udfald"
                      rows={Object.entries(statistics.reports.byOutcome)
                        .map(([outcome, value]) => ({ label: outcomeLabels[outcome] ?? outcome, value }))
                        .sort((a, b) => b.value - a.value)}
                    />
                  </ChartBlock>
                </div>
              </div>
            </Section>

            <Section id="contacts-heading" eyebrow="Seneste 12 uger" title="Kontaktsager">
              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Tile label="Aktive sager" value={countFormat.format(statistics.contacts.active)} note="Nye eller under behandling" />
                <Tile label="Over svarfristen" value={countFormat.format(statistics.contacts.overdue)} note="Aktive sager, hvor fristen er passeret" />
                <Tile label="Median tid til første svar" value={duration(statistics.contacts.medianHoursToFirstReply)} />
              </dl>
              <div className="mt-4">
                <ChartBlock title="Nye sager pr. uge" description="Henvendelser via kontaktformularen.">
                  <ColumnChart
                    title="Nye kontaktsager pr. uge"
                    emptyText="Ingen nye kontaktsager i perioden."
                    series={[{ key: "received", label: "Nye sager", color: chartColors.blue }]}
                    points={statistics.contacts.weekly.map((week) => ({
                      label: shortDay.format(date(week.week)),
                      title: weekLabel(week.week),
                      values: { received: week.received },
                    }))}
                  />
                </ChartBlock>
              </div>
            </Section>
          </>
        ) : (
          <p className="mt-8 rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100" role="alert">
            Statistikken kunne ikke indlæses. Prøv igen om lidt.
          </p>
        )}
      </div>
    </main>
  );
}
