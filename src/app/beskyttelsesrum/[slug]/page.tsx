import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import GlobalFooter from "@/components/GlobalFooter";
import BackLinkButton from "@/components/BackLinkButton";
import RegistrationNotice, { RegistrationStatusLabels } from "@/components/RegistrationNotice";
import ReportShelterIssue from "@/components/ReportShelterIssue";
import ShelterOsmEmbedMap from "@/components/ShelterOsmEmbedMap";
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from "@/lib/anvendelseskoder";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { siteUrl } from "@/lib/seo/site";
import { getShelterPublicDisplayName } from "@/lib/shelter-display-name";
import {
  getAppV2PublicRelatedShelters,
  getAppV2PublicShelterBySlug,
  type AppV2PublicShelterDetail,
} from "@/lib/supabase/app-v2-queries";

const municipalityContactUrl = "https://www.borger.dk/om-borger-dk/Find-en-myndighed";

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

function getShelterAddress(shelter: AppV2PublicShelterDetail) {
  return `${shelter.addressLine1}, ${shelter.postalCode} ${shelter.city}`;
}

function getShelterCanonicalPath(slug: string) {
  return `/beskyttelsesrum/${slug}`;
}

function getGoogleMapsPlaceHref(shelter: AppV2PublicShelterDetail) {
  if (shelter.latitude === null || shelter.longitude === null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${shelter.latitude},${shelter.longitude}`;
}

function getMunicipalityAuthorityName(name: string) {
  return /kommune$/i.test(name.trim()) ? name.trim() : `${name.trim()} Kommune`;
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

function getJsonLd(shelter: AppV2PublicShelterDetail, displayName: string) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: displayName,
    description:
      "BBR-registrering af sikringsrumspladser. Offentlig adgang, klargøring og aktuel fysisk stand er ikke bekræftet.",
    url: `${siteUrl}${getShelterCanonicalPath(shelter.slug)}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: shelter.addressLine1,
      postalCode: shelter.postalCode,
      addressLocality: shelter.city,
      addressCountry: "DK",
    },
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Registrerede pladser",
        value: shelter.capacity,
      },
      {
        "@type": "PropertyValue",
        name: "Datakilde",
        value: "BBR og DAR via Datafordeler",
      },
    ],
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const shelter = await getAppV2PublicShelterBySlug(slug);

  if (!shelter) {
    return {
      title: "Beskyttelsesrum ikke fundet",
    };
  }

  const displayName = getShelterPublicDisplayName(shelter.name, shelter.addressLine1);
  const address = getShelterAddress(shelter);

  return {
    title: `BBR-registrering ved ${shelter.addressLine1}`,
    description: `${address}. ${shelter.capacity.toLocaleString("da-DK")} BBR-registrerede sikringsrumspladser. Adgang og fysisk stand er ikke bekræftet.`,
    alternates: {
      canonical: getShelterCanonicalPath(shelter.slug),
    },
    openGraph: {
      title: `BBR-registrering ved ${shelter.addressLine1}`,
      description: `${address}. ${shelter.capacity.toLocaleString("da-DK")} BBR-registrerede sikringsrumspladser. Adgang og fysisk stand er ikke bekræftet.`,
      type: "website",
      locale: "da_DK",
      siteName: "Find Beskyttelsesrum",
      url: `${siteUrl}${getShelterCanonicalPath(shelter.slug)}`,
    },
  };
}

export default async function ShelterDetailPage({ params }: Props) {
  const { slug } = await params;
  const [shelter, anvendelseskoder] = await Promise.all([
    getAppV2PublicShelterBySlug(slug),
    getAnvendelseskoder(),
  ]);

  if (!shelter) {
    notFound();
  }

  const displayName = getShelterPublicDisplayName(shelter.name, shelter.addressLine1);
  const jsonLd = getJsonLd(shelter, displayName);
  const anvendelseRaw = getAnvendelseskodeBeskrivelse(shelter.sourceApplicationCode, anvendelseskoder).trim();
  const anvendelseLabel = anvendelseRaw || null;
  const hasCoords = shelter.latitude !== null && shelter.longitude !== null;
  const mapHref = hasCoords ? getGoogleMapsPlaceHref(shelter) : null;
  const relatedShelters = await getAppV2PublicRelatedShelters({
    shelterId: shelter.id,
    municipalityId: shelter.municipality.id,
    postalCode: shelter.postalCode,
    limit: 3,
  }).catch(() => []);

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
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

      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <article className="space-y-8">
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Side">
            <BackLinkButton
              fallbackHref={`/kommune/${shelter.municipality.slug}`}
              label={`Tilbage til ${shelter.municipality.name}`}
              shortLabel="Tilbage"
            />
          </nav>

          <header className="space-y-4">
            <p className="text-sm uppercase tracking-wide text-gray-300">BBR-registrering</p>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Registrering ved {shelter.addressLine1}
            </h1>
            <p className="text-lg text-gray-300">
              {shelter.postalCode} {shelter.city}
            </p>
            <RegistrationStatusLabels />
          </header>

          <RegistrationNotice />

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Registrerede oplysninger</h2>

            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-[#0f0f0f]/40 p-4">
                <dt className="text-sm text-gray-300">Registrerede pladser</dt>
                <dd className="mt-1 text-base font-medium text-white">
                  {shelter.capacity.toLocaleString("da-DK")} pladser
                </dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0f0f0f]/40 p-4">
                <dt className="text-sm text-gray-300">Bygningens registrerede anvendelse</dt>
                <dd className="mt-1 text-base font-medium text-white">{anvendelseLabel ?? "Ikke oplyst"}</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0f0f0f]/40 p-4">
                <dt className="text-sm text-gray-300">Datakilde</dt>
                <dd className="mt-1 text-base font-medium text-white">BBR og DAR via Datafordeler</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0f0f0f]/40 p-4">
                <dt className="text-sm text-gray-300">Seneste dataimport</dt>
                <dd className="mt-1 text-base font-medium text-white">{formatDataDate(shelter.lastImportedAt)}</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0f0f0f]/40 p-4">
                <dt className="text-sm text-gray-300">Offentlig adgang</dt>
                <dd className="mt-1 text-base font-medium text-white">Ikke oplyst i datasættet</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0f0f0f]/40 p-4">
                <dt className="text-sm text-gray-300">Aktuel fysisk stand</dt>
                <dd className="mt-1 text-base font-medium text-white">Ikke verificeret</dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {hasCoords ? (
                <a
                  href="#registrering-kort"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#0a0a0a] hover:bg-[var(--accent-hover)]"
                >
                  Vis på kort
                </a>
              ) : null}
              {mapHref ? (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  aria-label="Se adressen i Google Maps"
                >
                  Se adressen i kort
                </a>
              ) : null}
              <a
                href={municipalityContactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold text-gray-100 hover:bg-white/5"
              >
                Find kontakt til {getMunicipalityAuthorityName(shelter.municipality.name)}
              </a>
              <Link
                href={`/kommune/${shelter.municipality.slug}`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/5 hover:text-white"
              >
                Se andre registreringer i {shelter.municipality.name}
              </Link>
            </div>
          </section>

          {hasCoords ? (
            <section id="registrering-kort" className="scroll-mt-24 rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-white">Kort</h2>
              <div className="mt-4">
                <ShelterOsmEmbedMap
                  latitude={shelter.latitude!}
                  longitude={shelter.longitude!}
                  title={`Kort over ${displayName}`}
                />
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-white">Kort</h2>
              <p className="mt-2 text-sm text-gray-300">
                Der er ingen koordinater til denne registrering i det viste datasæt.
              </p>
            </section>
          )}

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-white">Er noget forkert?</h2>
            <p className="mt-2 text-sm leading-6 text-gray-300">
              Send en observation til moderationskøen. Rapporten ændrer ikke registreringen automatisk.
            </p>
            <div className="mt-4">
              <ReportShelterIssue shelterId={shelter.id} shelterAddress={shelter.addressLine1} />
            </div>
          </section>

          {relatedShelters.length > 0 ? (
            <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-white">Andre registreringer i nærheden</h2>
              <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
                {relatedShelters.map((related) => (
                  <li key={related.id}>
                    <Link
                      href={`/beskyttelsesrum/${related.slug}`}
                      className="flex min-h-[64px] items-center justify-between gap-4 py-3 text-sm hover:text-orange-200"
                    >
                      <span>
                        <span className="block font-medium text-white">{related.addressLine1}</span>
                        <span className="mt-1 block text-gray-400">{related.postalCode} {related.city}</span>
                      </span>
                      <span className="shrink-0 text-right text-gray-300">
                        {related.capacity.toLocaleString("da-DK")} pladser
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      </div>

      <GlobalFooter />
    </main>
  );
}
