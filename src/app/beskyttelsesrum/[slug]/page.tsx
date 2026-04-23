import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import SiteHeader from "@/components/SiteHeader";
import { getAppV2ShelterBySlug, type AppV2ShelterDetail } from "@/lib/supabase/app-v2-queries";

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

const statusLabels: Record<AppV2ShelterDetail["status"], string> = {
  active: "Aktivt",
  temporarily_closed: "Midlertidigt lukket",
  under_review: "Under gennemgang",
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
  const shelter = await getAppV2ShelterBySlug(slug);

  if (!shelter) {
    return {
      title: "Beskyttelsesrum ikke fundet",
    };
  }

  const address = getShelterAddress(shelter);

  return {
    title: `${shelter.name} | Beskyttelsesrum i ${shelter.municipality.name}`,
    description: `${address}. Registreret kapacitet: ${shelter.capacity.toLocaleString("da-DK")} registrerede pladser. Registerfelter fra kildedata.`,
    alternates: {
      canonical: getShelterCanonicalPath(shelter.slug),
    },
    openGraph: {
      title: `${shelter.name} | Beskyttelsesrum i ${shelter.municipality.name}`,
      description: `${address}. Registreret kapacitet: ${shelter.capacity.toLocaleString("da-DK")} registrerede pladser.`,
      type: "article",
      locale: "da_DK",
      siteName: "Find Beskyttelsesrum",
      url: `https://findbeskyttelsesrum.dk${getShelterCanonicalPath(shelter.slug)}`,
    },
  };
}

export default async function ShelterDetailPage({ params }: Props) {
  const { slug } = await params;
  const shelter = await getAppV2ShelterBySlug(slug);

  if (!shelter) {
    notFound();
  }

  const lastSeenAt = formatDate(shelter.lastSeenAt);
  const lastImportedAt = formatDate(shelter.lastImportedAt);
  const jsonLd = getJsonLd(shelter);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <SiteHeader />

      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <article className="space-y-8">
          <header className="space-y-4">
            <p className="text-sm uppercase tracking-wide text-gray-400">Beskyttelsesrum</p>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">{shelter.name}</h1>
            <p className="text-lg text-gray-300">
              {shelter.addressLine1}, {shelter.postalCode} {shelter.city}
            </p>
            <p className="max-w-2xl text-sm leading-6 text-gray-400">
              Oplysningerne bygger på de felter, der aktuelt er registreret og egner sig til offentlig visning.
            </p>
          </header>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Nøgleoplysninger</h2>
            <dl className="mt-3">
              <DetailRow label="Adresse" value={getShelterAddress(shelter)} />
              <DetailRow label="Kommune" value={shelter.municipality.name} />
              <DetailRow
                label="Registreret kapacitet"
                value={`${shelter.capacity.toLocaleString("da-DK")} registrerede pladser`}
              />
              <DetailRow label="Status" value={statusLabels[shelter.status]} />
              <DetailRow label="Datalagets tilstand" value={importStateLabels[shelter.importState]} />
              <DetailRow
                label="Koordinater"
                value={
                  shelter.latitude !== null && shelter.longitude !== null
                    ? `${shelter.latitude.toFixed(6)}, ${shelter.longitude.toFixed(6)}`
                    : null
                }
              />
            </dl>
            <p className="mt-4 text-sm leading-6 text-gray-400">
              Registreret kapacitet og status er registerfelter. De siger ikke i sig selv, om rummet er klargjort,
              fysisk tilgængeligt eller kan bruges i en konkret situation.
            </p>
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
                Om data
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
              <DetailRow label="Datakilde" value={shelter.canonicalSourceName} />
              <DetailRow label="Kildereference" value={shelter.canonicalSourceReference} />
              <DetailRow label="Senest set i kilden" value={lastSeenAt} />
              <DetailRow label="Senest importeret" value={lastImportedAt} />
            </dl>
            <Link
              href="/om-data"
              className="mt-4 inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
            >
              Om data
            </Link>
          </section>
        </article>
      </div>

      <GlobalFooter />
    </main>
  );
}
