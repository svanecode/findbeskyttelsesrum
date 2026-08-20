import type { Metadata } from "next";
import Link from "next/link";

import { requireModerator } from "@/lib/moderation/auth";
import {
  getModerationReports,
  reportStatuses,
  type ModerationReport,
  type ReportStatus,
} from "@/lib/moderation/reports";

import { moderateReportAction, signOutModeratorAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Moderationskø",
  robots: { index: false, follow: false, nocache: true },
};

const statusLabels: Record<ReportStatus, string> = {
  open: "Åben",
  reviewing: "Under behandling",
  resolved: "Afsluttet",
  rejected: "Afvist",
};

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
  no_change: "Afsluttet uden dataændring",
  excluded: "Registreringen er ekskluderet",
  corrected: "Data er rettet",
  rejected: "Rapporten er afvist",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Copenhagen",
  }).format(new Date(value));
}

function statusClass(status: ReportStatus) {
  if (status === "open") return "border-orange-400/30 bg-orange-500/10 text-orange-200";
  if (status === "reviewing") return "border-blue-400/30 bg-blue-500/10 text-blue-200";
  if (status === "resolved") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  return "border-white/15 bg-white/5 text-gray-300";
}

function QueueCard({ report }: { report: ModerationReport }) {
  const isFinal = report.status === "resolved" || report.status === "rejected";

  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(report.status)}`}>
              {statusLabels[report.status]}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {reportTypeLabels[report.type] ?? report.type}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-semibold text-white">
            {report.shelter.addressLine1}, {report.shelter.postalCode} {report.shelter.city}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {report.shelter.municipalityName} · {report.shelter.capacity.toLocaleString("da-DK")} registrerede pladser
          </p>
        </div>
        <Link
          href={`/beskyttelsesrum/${report.shelter.slug}`}
          className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-gray-200 underline underline-offset-4 hover:bg-white/5"
        >
          Se offentlig side
        </Link>
      </div>

      <dl className="mt-5 grid gap-4 rounded-lg border border-white/10 bg-black/20 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-gray-400">Modtaget</dt>
          <dd className="mt-1 text-gray-200">{formatDate(report.createdAt)}</dd>
        </div>
        <div>
          <dt className="font-medium text-gray-400">Kontaktmail</dt>
          <dd className="mt-1 break-all text-gray-200">{report.contactEmail ?? "Ikke oplyst eller slettet"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-gray-400">Borgerens beskrivelse</dt>
          <dd className="mt-1 whitespace-pre-wrap leading-6 text-gray-100">{report.message}</dd>
        </div>
      </dl>

      {report.resolutionOutcome ? (
        <div className="mt-5 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-4">
          <p className="text-sm font-semibold text-emerald-200">
            {outcomeLabels[report.resolutionOutcome] ?? report.resolutionOutcome}
          </p>
          {report.resolutionNote ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-300">{report.resolutionNote}</p> : null}
          <p className="mt-2 text-xs text-gray-500">Senest behandlet {formatDate(report.reviewedAt)}</p>
        </div>
      ) : null}

      <div className="mt-5">
        {report.status === "open" ? (
          <form action={moderateReportAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <button
              type="submit"
              name="action"
              value="start_review"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 text-sm font-semibold text-blue-100 hover:bg-blue-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              Tag under behandling
            </button>
          </form>
        ) : null}

        {isFinal ? (
          <form action={moderateReportAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <button
              type="submit"
              name="action"
              value="reopen"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-gray-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
            >
              Genåbn rapport
            </button>
          </form>
        ) : (
          <form action={moderateReportAction} className="mt-5 border-t border-white/10 pt-5">
            <input type="hidden" name="reportId" value={report.id} />
            <label htmlFor={`note-${report.id}`} className="block text-sm font-semibold text-gray-200">
              Moderatorens begrundelse
            </label>
            <textarea
              id={`note-${report.id}`}
              name="note"
              rows={3}
              minLength={5}
              maxLength={1000}
              className="mt-2 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30"
              placeholder="Beskriv kontrollen og beslutningen."
            />

            <details className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
              <summary className="cursor-pointer font-medium text-gray-200">Ret adresse eller kapacitet</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-gray-300 sm:col-span-2">
                  Adresse
                  <input name="addressLine1" defaultValue={report.shelter.addressLine1} maxLength={200} className="mt-1 min-h-[44px] w-full rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none focus:border-orange-400" />
                </label>
                <label className="text-sm text-gray-300">
                  Postnummer
                  <input name="postalCode" defaultValue={report.shelter.postalCode} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} className="mt-1 min-h-[44px] w-full rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none focus:border-orange-400" />
                </label>
                <label className="text-sm text-gray-300">
                  By
                  <input name="city" defaultValue={report.shelter.city} maxLength={100} className="mt-1 min-h-[44px] w-full rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none focus:border-orange-400" />
                </label>
                <label className="text-sm text-gray-300">
                  Registrerede pladser
                  <input name="capacity" defaultValue={report.shelter.capacity} type="number" min={0} max={2000000} className="mt-1 min-h-[44px] w-full rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none focus:border-orange-400" />
                </label>
              </div>
              <button
                type="submit"
                name="action"
                value="correct"
                className="mt-4 inline-flex min-h-[44px] items-center rounded-lg bg-orange-500 px-4 text-sm font-semibold text-[#0a0a0a] hover:bg-orange-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                Gem rettelse og afslut
              </button>
            </details>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" name="action" value="resolve_no_change" className="inline-flex min-h-[44px] items-center rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                Afslut uden ændring
              </button>
              <button type="submit" name="action" value="reject" className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-gray-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
                Afvis rapport
              </button>
              <button type="submit" name="action" value="exclude" className="inline-flex min-h-[44px] items-center rounded-lg border border-red-400/30 bg-red-500/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
                Ekskludér registrering
              </button>
            </div>
          </form>
        )}
      </div>
    </article>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; updated?: string; error?: string }>;
}) {
  const { profile, supabase } = await requireModerator(true);
  const params = await searchParams;
  const selectedStatus = reportStatuses.includes(params.status as ReportStatus)
    ? (params.status as ReportStatus)
    : undefined;
  const allReports = await getModerationReports(supabase);
  const reports = selectedStatus ? allReports.filter((report) => report.status === selectedStatus) : allReports;
  const counts = Object.fromEntries(reportStatuses.map((status) => [status, allReports.filter((report) => report.status === status).length])) as Record<ReportStatus, number>;

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-orange-300">Privat administration</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Moderationskø</h1>
            <p className="mt-3 text-sm text-gray-400">
              Logget ind som {profile.providerLogin} · MFA bekræftet · {profile.role === "owner" ? "Ejer" : "Moderator"}
            </p>
          </div>
          <form action={signOutModeratorAction}>
            <button type="submit" className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-medium text-gray-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
              Log ud
            </button>
          </form>
        </header>

        {params.updated ? <p className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100" role="status">Handlingen er gemt med auditspor.</p> : null}
        {params.error ? <p className="mt-6 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100" role="alert">Handlingen kunne ikke gennemføres. Ingen data blev ændret.</p> : null}

        <nav className="mt-7 flex flex-wrap gap-2" aria-label="Filtrér moderationskø">
          <Link href="/admin" aria-current={!selectedStatus ? "page" : undefined} className={`inline-flex min-h-[44px] items-center rounded-lg border px-3 text-sm font-medium ${!selectedStatus ? "border-orange-400/40 bg-orange-500/10 text-orange-100" : "border-white/10 text-gray-300 hover:bg-white/5"}`}>
            Alle ({allReports.length})
          </Link>
          {reportStatuses.map((status) => (
            <Link key={status} href={`/admin?status=${status}`} aria-current={selectedStatus === status ? "page" : undefined} className={`inline-flex min-h-[44px] items-center rounded-lg border px-3 text-sm font-medium ${selectedStatus === status ? "border-orange-400/40 bg-orange-500/10 text-orange-100" : "border-white/10 text-gray-300 hover:bg-white/5"}`}>
              {statusLabels[status]} ({counts[status]})
            </Link>
          ))}
        </nav>

        <section className="mt-6 grid gap-5" aria-label="Fejlrapporter">
          {reports.length > 0 ? reports.map((report) => <QueueCard key={report.id} report={report} />) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-8 text-center">
              <h2 className="text-xl font-semibold">Ingen rapporter i denne visning</h2>
              <p className="mt-2 text-sm text-gray-400">Nye fejlrapporter vises her, når de bliver indsendt.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
