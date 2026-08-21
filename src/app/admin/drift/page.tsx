import type { Metadata } from "next";
import Link from "next/link";

import { requireModerator } from "@/lib/moderation/auth";
import { getImportOperations, type ImportPublication, type ImportRun } from "@/lib/operations/import-operations";

import { rollbackPublicationAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Datadrift",
  robots: { index: false, follow: false, nocache: true },
};

const countFormat = new Intl.NumberFormat("da-DK");

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Copenhagen",
  }).format(new Date(value));
}

function publicationSourceLabel(publication: ImportPublication) {
  if (publication.publishedByType === "moderator_rollback") return "Gendannet version";
  if (publication.publishedByType === "migration") return "Oprindelig version";
  return "Automatisk import";
}

function runState(run: ImportRun) {
  if (run.publicationStatus === "published") {
    return { label: "Publiceret", className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" };
  }
  if (run.publicationStatus === "rejected") {
    return { label: "Afvist af datakontrol", className: "border-red-400/30 bg-red-500/10 text-red-100" };
  }
  if (run.status === "running") {
    return { label: "Kører i karantæne", className: "border-blue-400/30 bg-blue-500/10 text-blue-100" };
  }
  if (run.status === "failed") {
    return { label: "Fejlet uden publicering", className: "border-red-400/30 bg-red-500/10 text-red-100" };
  }
  return { label: "Kontrolkørsel", className: "border-white/15 bg-white/5 text-gray-200" };
}

export default async function AdminOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ restored?: string; error?: string }>;
}) {
  const { profile, supabase } = await requireModerator(true);
  const [operations, params] = await Promise.all([getImportOperations(supabase), searchParams]);
  const current = operations.currentPublication;
  const coordinateCoverage = current && current.recordCount > 0
    ? Math.round((current.coordinateCount / current.recordCount) * 1000) / 10
    : 0;

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-orange-300">Privat administration</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Datadrift</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">
              Data hentes først i karantæne og bliver kun publiceret samlet, når alle automatiske kontroller er bestået.
            </p>
          </div>
          <Link href="/admin" className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-medium text-gray-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
            Moderationskø
          </Link>
        </header>

        {params.restored ? (
          <p className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100" role="status">
            Den valgte dataversion er gendannet og registreret i auditsporet.
          </p>
        ) : null}
        {params.error ? (
          <p className="mt-6 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100" role="alert">
            Gendannelsen blev afvist. Det aktive datasæt er ikke ændret.
          </p>
        ) : null}

        <section className="mt-7 rounded-xl border border-white/10 bg-white/[0.04] p-5 sm:p-6" aria-labelledby="current-data-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Aktiv dataversion</p>
              <h2 id="current-data-heading" className="mt-2 text-2xl font-semibold">{formatDate(current?.publishedAt ?? null)}</h2>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
              Kendt god version
            </span>
          </div>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-black/20 p-4"><dt className="text-xs text-gray-400">Registreringer</dt><dd className="mt-1 text-2xl font-semibold">{countFormat.format(current?.recordCount ?? 0)}</dd></div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-4"><dt className="text-xs text-gray-400">Samlet kapacitet</dt><dd className="mt-1 text-2xl font-semibold">{countFormat.format(current?.totalCapacity ?? 0)}</dd></div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-4"><dt className="text-xs text-gray-400">Koordinatdækning</dt><dd className="mt-1 text-2xl font-semibold">{coordinateCoverage.toLocaleString("da-DK")}%</dd></div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-4"><dt className="text-xs text-gray-400">Kommuner</dt><dd className="mt-1 text-2xl font-semibold">{countFormat.format(current?.municipalityCount ?? 0)}</dd></div>
          </dl>
          <p className="mt-4 text-xs leading-5 text-gray-500">Driften bruger kun den eksisterende Supabase-database og GitHub Actions; der er ikke tilføjet en betalt tjeneste.</p>
        </section>

        <section className="mt-8" aria-labelledby="runs-heading">
          <h2 id="runs-heading" className="text-2xl font-semibold">Seneste importkørsler</h2>
          <div className="mt-4 grid gap-4">
            {operations.runs.length ? operations.runs.map((run) => {
              const state = runState(run);
              return (
                <article key={run.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{formatDate(run.startedAt)}</p>
                      <p className="mt-1 text-sm text-gray-400">{countFormat.format(run.recordsSeen)} poster · {countFormat.format(run.pagesFetched)} kildesider</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${state.className}`}>{state.label}</span>
                  </div>
                  {run.qualityGateReasons.length ? (
                    <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-red-200">
                      {run.qualityGateReasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  ) : null}
                  {run.errorSummary && run.publicationStatus !== "rejected" ? <p className="mt-3 text-sm text-red-200">{run.errorSummary}</p> : null}
                </article>
              );
            }) : <p className="rounded-xl border border-white/10 bg-white/[0.04] p-5 text-sm text-gray-400">Ingen importkørsler er registreret endnu.</p>}
          </div>
        </section>

        <section className="mt-8 pb-12" aria-labelledby="versions-heading">
          <h2 id="versions-heading" className="text-2xl font-semibold">Dataversioner</h2>
          <p className="mt-2 text-sm text-gray-400">De tre nyeste snapshots opbevares til gratis og hurtig gendannelse.</p>
          <div className="mt-4 grid gap-4">
            {operations.publications.map((publication) => (
              <article key={publication.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{formatDate(publication.publishedAt)}</p>
                    <p className="mt-1 text-sm text-gray-400">{publicationSourceLabel(publication)} · {countFormat.format(publication.recordCount)} registreringer</p>
                  </div>
                  {publication.isCurrent ? <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">Aktiv</span> : publication.snapshotAvailable ? <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-gray-300">Kan gendannes</span> : <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-gray-500">Historik</span>}
                </div>
                {profile.role === "owner" && !publication.isCurrent && publication.snapshotAvailable ? (
                  <details className="mt-4 rounded-lg border border-red-400/20 bg-red-500/5 p-4">
                    <summary className="cursor-pointer py-1 text-sm font-semibold text-red-100">Gendan denne version</summary>
                    <p className="mt-3 text-sm leading-6 text-gray-300">Det offentlige datasæt skifter samlet tilbage til denne version. Redaktionelle rettelser og eksklusioner bevares.</p>
                    <form action={rollbackPublicationAction} className="mt-4 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="publicationId" value={publication.id} />
                      <label className="text-sm text-gray-300">Skriv GENDAN for at bekræfte
                        <input name="confirmation" required pattern="GENDAN" autoComplete="off" className="mt-1 block min-h-[44px] rounded-lg border border-white/20 bg-black/30 px-3 text-white outline-none focus:border-red-300" />
                      </label>
                      <button type="submit" className="inline-flex min-h-[44px] items-center rounded-lg border border-red-400/30 bg-red-500/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300">Gendan dataversion</button>
                    </form>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
