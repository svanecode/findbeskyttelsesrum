import type { Metadata } from "next";
import Link from "next/link";

import {
  privacyContactCategories,
  privacyContactStatuses,
  type PrivacyContactCategory,
  type PrivacyContactStatus,
} from "@/lib/contact/privacy-contact";
import { requireModerator } from "@/lib/moderation/auth";
import {
  getModerationPrivacyContactCases,
  type ModerationPrivacyContactCase,
} from "@/lib/moderation/privacy-contacts";

import { moderatePrivacyContactAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kontaktkø",
  robots: { index: false, follow: false, nocache: true },
};

const statusLabels: Record<PrivacyContactStatus, string> = {
  open: "Ny",
  reviewing: "Under behandling",
  answered: "Besvaret",
  closed: "Lukket",
};

const categoryLabels = Object.fromEntries(
  privacyContactCategories.map((category) => [category.value, category.label]),
) as Record<PrivacyContactCategory, string>;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Copenhagen",
  }).format(new Date(value));
}

function statusClass(status: PrivacyContactStatus) {
  if (status === "open") return "border-orange-400/30 bg-orange-500/10 text-orange-100";
  if (status === "reviewing") return "border-blue-400/30 bg-blue-500/10 text-blue-100";
  if (status === "answered") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  return "border-white/15 bg-white/5 text-gray-300";
}

function QueueCard({ contactCase }: { contactCase: ModerationPrivacyContactCase }) {
  const isClosed = contactCase.status === "closed";

  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(contactCase.status)}`}>
              {statusLabels[contactCase.status]}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {categoryLabels[contactCase.category]}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-semibold text-white">{contactCase.subject}</h2>
          <p className="mt-1 font-mono text-xs text-gray-400">{contactCase.reference}</p>
        </div>
        <div className={`rounded-lg border px-3 py-2 text-xs ${contactCase.isOverdue ? "border-red-400/30 bg-red-500/10 text-red-100" : "border-white/10 text-gray-300"}`}>
          {isClosed ? `Lukket · slettes senest ${formatDate(contactCase.retentionUntil)}` : `Svarfrist ${formatDate(contactCase.responseDueAt)}`}
        </div>
      </div>

      <div className="mt-5 space-y-3" aria-label="Samtale">
        {contactCase.messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-lg border p-4 ${message.authorType === "moderator" ? "border-emerald-400/20 bg-emerald-500/[0.06]" : "border-white/10 bg-black/20"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <p className={message.authorType === "moderator" ? "font-semibold text-emerald-200" : "font-semibold text-gray-300"}>
                {message.authorType === "moderator" ? "Moderator" : "Besøgende"}
              </p>
              <time dateTime={message.createdAt} className="text-gray-500">{formatDate(message.createdAt)}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-100">{message.message}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-white/10 pt-5">
        {isClosed ? (
          <div className="space-y-4">
            <form action={moderatePrivacyContactAction}>
              <input type="hidden" name="caseId" value={contactCase.id} />
              <button type="submit" name="action" value="reopen" className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-gray-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
                Genåbn sag
              </button>
            </form>
            <details className="rounded-lg border border-red-400/20 bg-red-500/[0.04] p-4">
              <summary className="cursor-pointer text-sm font-semibold text-red-100">Slet sag permanent</summary>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                Dette sletter emne, alle beskeder og adgangskode-hash straks. Det kan ikke fortrydes. Det strukturerede auditspor beholder kun, at en sletning fandt sted.
              </p>
              <form action={moderatePrivacyContactAction} className="mt-4">
                <input type="hidden" name="caseId" value={contactCase.id} />
                <label htmlFor={`delete-confirmation-${contactCase.id}`} className="block text-sm font-medium text-gray-200">
                  Skriv {contactCase.reference} for at bekræfte
                </label>
                <input id={`delete-confirmation-${contactCase.id}`} name="confirmation" required autoComplete="off" className="mt-2 min-h-[44px] w-full rounded-lg border border-white/20 bg-black/30 px-3 font-mono text-sm uppercase text-white outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/30" />
                <button type="submit" name="action" value="delete" className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-red-400/30 bg-red-500/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
                  Slet sag permanent
                </button>
              </form>
            </details>
          </div>
        ) : (
          <>
            {contactCase.status !== "reviewing" ? (
              <form action={moderatePrivacyContactAction}>
                <input type="hidden" name="caseId" value={contactCase.id} />
                <button type="submit" name="action" value="start_review" className="inline-flex min-h-[44px] items-center rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 text-sm font-semibold text-blue-100 hover:bg-blue-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                  Tag under behandling
                </button>
              </form>
            ) : null}

            <form action={moderatePrivacyContactAction} className="mt-4">
              <input type="hidden" name="caseId" value={contactCase.id} />
              <div className="flex items-end justify-between gap-3">
                <label htmlFor={`contact-reply-${contactCase.id}`} className="block text-sm font-semibold text-gray-200">
                  Svar til den besøgende
                </label>
                <span className="text-xs text-gray-500">Maks. 4.000 tegn</span>
              </div>
              <textarea
                id={`contact-reply-${contactCase.id}`}
                name="message"
                required
                rows={6}
                maxLength={4_000}
                className="mt-2 min-h-36 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30"
                placeholder="Skriv et svar, som vises i den private sag."
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="submit" name="action" value="reply" className="inline-flex min-h-[44px] items-center rounded-lg bg-orange-500 px-4 text-sm font-semibold text-[#0a0a0a] hover:bg-orange-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
                  Send svar
                </button>
                <button type="submit" name="action" value="close" formNoValidate className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-gray-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
                  {"Luk sag"}
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500">Hvis der står tekst i feltet, sendes den som afsluttende svar, når sagen lukkes.</p>
            </form>
          </>
        )}
      </div>
    </article>
  );
}

export default async function PrivacyContactAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; updated?: string; error?: string }>;
}) {
  const { profile, supabase } = await requireModerator(true);
  const params = await searchParams;
  const selectedStatus = privacyContactStatuses.includes(params.status as PrivacyContactStatus)
    ? (params.status as PrivacyContactStatus)
    : undefined;
  const allCases = await getModerationPrivacyContactCases(supabase);
  const cases = selectedStatus ? allCases.filter((contactCase) => contactCase.status === selectedStatus) : allCases;
  const counts = Object.fromEntries(
    privacyContactStatuses.map((status) => [status, allCases.filter((contactCase) => contactCase.status === status).length]),
  ) as Record<PrivacyContactStatus, number>;

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-orange-300">Privat administration</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Kontaktkø</h1>
            <p className="mt-3 text-sm text-gray-400">
              Logget ind som {profile.providerLogin} · MFA bekræftet · {profile.role === "owner" ? "Ejer" : "Moderator"}
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Administration">
            <Link href="/admin" className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-medium text-gray-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
              Fejlrapporter
            </Link>
            <Link href="/admin/drift" className="inline-flex min-h-[44px] items-center rounded-lg border border-orange-400/30 bg-orange-500/10 px-4 text-sm font-medium text-orange-100 hover:bg-orange-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
              Datadrift
            </Link>
          </nav>
        </header>

        {params.updated ? <p className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100" role="status">Kontaktkøen er opdateret med auditspor.</p> : null}
        {params.error ? <p className="mt-6 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100" role="alert">Handlingen kunne ikke gennemføres. Ingen data blev ændret.</p> : null}

        <nav className="mt-7 flex flex-wrap gap-2" aria-label="Filtrér kontaktkø">
          <Link href="/admin/kontakt" aria-current={!selectedStatus ? "page" : undefined} className={`inline-flex min-h-[44px] items-center rounded-lg border px-3 text-sm font-medium ${!selectedStatus ? "border-orange-400/40 bg-orange-500/10 text-orange-100" : "border-white/10 text-gray-300 hover:bg-white/5"}`}>
            Alle ({allCases.length})
          </Link>
          {privacyContactStatuses.map((status) => (
            <Link key={status} href={`/admin/kontakt?status=${status}`} aria-current={selectedStatus === status ? "page" : undefined} className={`inline-flex min-h-[44px] items-center rounded-lg border px-3 text-sm font-medium ${selectedStatus === status ? "border-orange-400/40 bg-orange-500/10 text-orange-100" : "border-white/10 text-gray-300 hover:bg-white/5"}`}>
              {statusLabels[status]} ({counts[status]})
            </Link>
          ))}
        </nav>

        <section className="mt-6 grid gap-5" aria-label="Kontaktsager">
          {cases.length > 0 ? cases.map((contactCase) => <QueueCard key={contactCase.id} contactCase={contactCase} />) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-8 text-center">
              <h2 className="text-xl font-semibold">Ingen henvendelser i denne visning</h2>
              <p className="mt-2 text-sm text-gray-400">Nye henvendelser vises her, når de bliver indsendt.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
