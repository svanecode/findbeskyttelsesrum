import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import SiteHeader from "@/components/SiteHeader";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { getAppV2PublicShelterBySlug, type AppV2ShelterDetail } from "@/lib/supabase/app-v2-queries";

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

const statusLabels: Record<AppV2ShelterDetail["status"], string> = {
  active: "Aktiv",
  temporarily_closed: "Midlertidigt lukket",
  under_review: "Under vurdering",
};

const importStateLabels: Record<AppV2ShelterDetail["importState"], string> = {
  active: "Aktiv registrering",
  missing_from_source: "Mangler i seneste kilde",
  suppressed: "Skjult fra offentlig visning",
};

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function getShelterAddress(shelter: AppV2ShelterDetail) {
  return `${shelter.addressLine1}, ${shelter.postalCode} ${shelter.city}`;
}

function getShelterCanonicalPath(slug: string) {
  return `/beskyttelsesrum/${slug}`;
}

function getGoogleMapsRouteHref(shelter: AppV2ShelterDetail) {
  if (shelter.latitude === null || shelter.longitude === null) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${shelter.latitude},${shelter.longitude}`;
}

function getJsonLd(shelter: AppV2ShelterDetail) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: shelter.name,
    url: `https://findbeskyttelsesrum.dk${getShelterCanonicalPath(shelter.slug)}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: shelter.addressLine1,
      postalCode: shelter.postalCode,
      addressLocality: shelter.city,
      addressCountry: "DK",
    },
  };

  if (shelter.latitude !== null && shelter.longitude !== null) {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: shelter.latitude,
      longitude: shelter.longitude,
    };
  }

  return jsonLd;
}

function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === "") {
    return null;
  }

  return (
    <div className="border-t border-white/10 py-4 first:border-t-0">
      <dt className="text-sm text-gray-400">{label}</dt>
      <dd className="mt-1 text-base text-white">{value}</dd>
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const shelter = await getAppV2PublicShelterBySlug(slug);

  if (!shelter) {
    return {
      title: "Beskyttelsesrum ikke fundet",
    };
  }

  const address = getShelterAddress(shelter);

  return {
    title: `${shelter.name} | Beskyttelsesrum i ${shelter.city}`,
    description: `${address}. Registreret kapacitet: ${shelter.capacity.toLocaleString("da-DK")} pladser. Se placering og nøgleoplysninger for registreringen.`,
    alternates: {
      canonical: getShelterCanonicalPath(shelter.slug),
    },
    openGraph: {
      title: `${shelter.name} | Beskyttelsesrum i ${shelter.city}`,
      description: `${address}. Registreret kapacitet: ${shelter.capacity.toLocaleString("da-DK")} pladser.`,
      type: "article",
      locale: "da_DK",
      siteName: "Find Beskyttelsesrum",
      url: `https://findbeskyttelsesrum.dk${getShelterCanonicalPath(shelter.slug)}`,
    },
  };
}

export default async function ShelterDetailPage({ params }: Props) {
  const { slug } = await params;
  const shelter = await getAppV2PublicShelterBySlug(slug);

  if (!shelter) {
    notFound();
  }

  const lastSeenAt = formatDate(shelter.lastSeenAt);
  const lastImportedAt = formatDate(shelter.lastImportedAt);
  const jsonLd = getJsonLd(shelter);
  const navigationHref = getGoogleMapsRouteHref(shelter);
  const statusLabel = statusLabels[shelter.status] ?? "Status mangler";
  const sourceLabel = shelter.canonicalSourceName ?? null;
  const dataDateLabel = lastImportedAt ?? lastSeenAt ?? null;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jsonLd),
        }}
      />
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <SiteHeader />

      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <article className={`space-y-8 ${navigationHref ? "pb-20 sm:pb-8" : ""}`}>
          <header className="space-y-4">
            <p className="text-sm uppercase tracking-wide text-gray-400">Beskyttelsesrum</p>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">{shelter.name}</h1>
            <p className="text-lg text-gray-300">
              {shelter.addressLine1}, {shelter.postalCode} {shelter.city}
            </p>
          </header>

          {/* Above-the-fold decision block */}
          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-white">Overblik</h2>
                <p className="mt-2 text-gray-300">
                  {shelter.addressLine1}
                  <span className="text-gray-400"> · </span>
                  {shelter.postalCode} {shelter.city}
                </p>
              </div>

              {navigationHref ? (
                <a
                  href={navigationHref}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
                >
                  Navigér hertil
                </a>
              ) : null}
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-[#0f0f0f]/40 p-4">
                <dt className="text-sm text-gray-400">Kapacitet</dt>
                <dd className="mt-1 text-base font-medium text-white">
                  {shelter.capacity.toLocaleString("da-DK")} pladser
                </dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0f0f0f]/40 p-4">
                <dt className="text-sm text-gray-400">Status</dt>
                <dd className="mt-1 text-base font-medium text-white">{statusLabel}</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0f0f0f]/40 p-4">
                <dt className="text-sm text-gray-400">Kilde</dt>
                <dd className="mt-1 text-base text-white">{sourceLabel ?? "Kilde eller dato mangler"}</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0f0f0f]/40 p-4">
                <dt className="text-sm text-gray-400">Data senest hentet</dt>
                <dd className="mt-1 text-base text-white">{dataDateLabel ?? "Kilde eller dato mangler"}</dd>
              </div>
            </dl>

            <p className="mt-4 text-sm text-gray-300/90">Følg altid myndighedernes anvisninger.</p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <p className="text-sm uppercase tracking-wide text-gray-400">Placering i overblikket</p>
            <h2 className="mt-2 text-lg font-semibold text-white">Fra registrering til kommune og land</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Denne side viser én aktiv offentlig registrering. Brug kommunesiden til lokalt liste- og kortoverblik,
              kommuneoversigten til at vælge andre kommuner, og landssiden til national kontekst.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/kommune/${shelter.municipality.slug}`}
                className="inline-flex items-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
              >
                Se {shelter.municipality.name}
              </Link>
              <Link
                href="/kommune"
                className="inline-flex items-center rounded-lg px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
              >
                Kommuner
              </Link>
              <Link
                href="/land"
                className="inline-flex items-center rounded-lg px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
              >
                Hele landet
              </Link>
              <Link
                href="/om-data"
                className="inline-flex items-center rounded-lg px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white"
              >
              Datagrundlag
              </Link>
            </div>
          </section>

          {(shelter.summary || shelter.accessibilityNotes) && (
            <section className="space-y-5 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
              {shelter.summary && (
                <div>
                  <h2 className="text-lg font-semibold text-white">Kort beskrivelse</h2>
                  <p className="mt-2 text-gray-300">{shelter.summary}</p>
                </div>
              )}

              {shelter.accessibilityNotes && (
                <div>
                  <h2 className="text-lg font-semibold text-white">Tilgængelighed</h2>
                  <p className="mt-2 text-gray-300">{shelter.accessibilityNotes}</p>
                </div>
              )}
            </section>
          )}

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Kilde og opdatering</h2>
            {shelter.sourceSummary && <p className="mt-2 text-sm leading-6 text-gray-300">{shelter.sourceSummary}</p>}
            <dl className="mt-3">
              <DetailRow label="Kilde" value={shelter.canonicalSourceName} />
              <DetailRow label="Data senest hentet" value={lastImportedAt ?? lastSeenAt} />
              <DetailRow label="Status for registreringen" value={importStateLabels[shelter.importState]} />
            </dl>
            <Link
              href="/om-data"
              className="mt-4 inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
            >
              Datagrundlag
            </Link>
          </section>
        </article>
      </div>

      {navigationHref ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0a0a0a]/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] backdrop-blur md:hidden">
          <a
            href={navigationHref}
            target="_blank"
            rel="noopener"
            className="inline-flex w-full items-center justify-center rounded-lg bg-white px-4 py-3 text-base font-semibold text-black transition hover:bg-gray-200"
          >
            Navigér hertil
          </a>
        </div>
      ) : null}

      <GlobalFooter />
    </main>
  );
}
