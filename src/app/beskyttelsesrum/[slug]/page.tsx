import { notFound, permanentRedirect, redirect } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";

import GlobalFooter from "@/components/GlobalFooter";
import ReportShelterIssue from "@/components/ReportShelterIssue";
import ProductMetricView from "@/components/ProductMetricView";
import ShelterDetailMap from "@/components/ShelterDetailMap";
import { shelterMapSectionId } from "@/components/shelter-map-section";
import { ui } from "@/components/ui-classes";
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from "@/lib/anvendelseskoder";
import { getBreadcrumbJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";
import { createPageMetadata } from "@/lib/seo/metadata";
import { siteUrl } from "@/lib/seo/site";
import { getShelterPublicDisplayName } from "@/lib/shelter-display-name";
import { getReadableShelterPathFromStable, getShelterPublicPath } from "@/lib/shelter-public-url";
import {
  getAppV2PublicRelatedShelters,
  getAppV2PublicShelterBySlug,
  getCanonicalReadableSlug,
  resolveAppV2PublicShelter,
  resolveReadableShelterSlug,
  resolveRetiredShelter,
  resolveShelterPathAlias,
  type AppV2PublicShelterDetail,
} from "@/lib/supabase/app-v2-queries";

const municipalityContactUrl = "https://www.borger.dk/om-borger-dk/Find-en-myndighed";

/**
 * Finds the registration for a detail path. Readable paths
 * ("ryesgade-18-8000-aarhus-c") are looked up first; stable
 * ("registrering-<id>") and older importer slugs still resolve and are
 * redirected to the readable path.
 */
const resolveShelterPage = cache(async function resolveShelterPage(slug: string) {
  const readable = await resolveReadableShelterSlug(slug);
  if (readable) {
    const shelter = await getAppV2PublicShelterBySlug(readable.stableSlug);
    if (!shelter) return null;
    return { shelter, canonicalSlug: readable.canonicalSlug, redirect: readable.canonicalSlug !== slug };
  }

  // An earlier readable path (the address changed in BBR), a stable hash path
  // or an older importer slug: redirect to today's readable path.
  const aliasTarget = await resolveShelterPathAlias(slug);
  const legacy = await resolveAppV2PublicShelter(aliasTarget ?? slug);
  if (!legacy) return null;
  const canonicalSlug = await getCanonicalReadableSlug(legacy.shelter);
  return { shelter: legacy.shelter, canonicalSlug, redirect: true };
});

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

function getShelterAddress(shelter: AppV2PublicShelterDetail) {
  return `${shelter.addressLine1}, ${shelter.postalCode} ${shelter.city}`;
}

function getShelterCanonicalPath(slug: string) {
  return getShelterPublicPath(slug);
}

function getGoogleMapsDirectionsHref(shelter: AppV2PublicShelterDetail) {
  if (shelter.latitude === null || shelter.longitude === null) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${shelter.latitude},${shelter.longitude}`;
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

function getJsonLd(shelter: AppV2PublicShelterDetail, displayName: string, canonicalSlug: string) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: displayName,
    description:
      "BBR-registrering af sikringsrumspladser. Offentlig adgang, klargøring og aktuel fysisk stand er ikke bekræftet.",
    url: `${siteUrl}${getShelterCanonicalPath(canonicalSlug)}`,
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

  if (shelter.lastImportedAt) {
    jsonLd.dateModified = shelter.lastImportedAt;
  }

  return jsonLd;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resolution = await resolveShelterPage(slug);
  const shelter = resolution?.shelter ?? null;

  if (!resolution || !shelter) {
    return {
      title: "Beskyttelsesrum ikke fundet",
      robots: { index: false, follow: false },
    };
  }

  const address = getShelterAddress(shelter);
  const title = `${shelter.addressLine1}, ${shelter.postalCode} ${shelter.city}: BBR-registrering`;
  const description = `${address}. ${shelter.capacity.toLocaleString("da-DK")} BBR-registrerede sikringsrumspladser. Adgang og fysisk stand er ikke bekræftet.`;

  return createPageMetadata({
    title,
    description,
    path: getShelterCanonicalPath(resolution.canonicalSlug),
  });
}

export default async function ShelterDetailPage({ params }: Props) {
  const { slug } = await params;
  const [resolution, anvendelseskoder] = await Promise.all([
    resolveShelterPage(slug),
    getAnvendelseskoder(),
  ]);

  if (!resolution) {
    // Normally src/proxy.ts answers 410 for removed registrations before this
    // page runs; this covers the minutes before its list is refreshed.
    if (await resolveRetiredShelter(slug).catch(() => null)) {
      redirect(`${getShelterPublicPath(slug)}/fjernet` as Route);
    }
    notFound();
  }

  const { shelter, canonicalSlug } = resolution;
  if (resolution.redirect) {
    permanentRedirect(getShelterCanonicalPath(canonicalSlug));
  }

  const displayName = getShelterPublicDisplayName(shelter.name, shelter.addressLine1);
  const jsonLd = getJsonLd(shelter, displayName, canonicalSlug);
  const breadcrumbJsonLd = getBreadcrumbJsonLd([
    { name: "Forside", url: siteUrl },
    {
      name: shelter.municipality.name,
      url: `${siteUrl}/kommune/${shelter.municipality.slug}`,
    },
    {
      name: shelter.addressLine1,
      url: `${siteUrl}${getShelterCanonicalPath(canonicalSlug)}`,
    },
  ]);
  const anvendelseRaw = getAnvendelseskodeBeskrivelse(shelter.sourceApplicationCode, anvendelseskoder).trim();
  const anvendelseLabel = anvendelseRaw || null;
  const hasCoords = shelter.latitude !== null && shelter.longitude !== null;
  const directionsHref = hasCoords ? getGoogleMapsDirectionsHref(shelter) : null;
  const relatedShelters = await getAppV2PublicRelatedShelters({
    shelterId: shelter.id,
    municipalityId: shelter.municipality.id,
    postalCode: shelter.postalCode,
    limit: 3,
  }).catch(() => []);

  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      <ProductMetricView eventName="detail_opened" />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jsonLd),
        }}
      />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(breadcrumbJsonLd),
        }}
      />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-12 pt-6 sm:px-6 sm:pt-10 lg:px-8">
        <article>
          <nav aria-label="Brødkrummer">
            <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-400">
              <li>
                <Link className="hover:text-white" href="/">
                  Forside
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link className="hover:text-white" href={`/kommune/${shelter.municipality.slug}`}>
                  {shelter.municipality.name}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="break-safe min-w-0 text-gray-200" aria-current="page">
                {shelter.addressLine1}
              </li>
            </ol>
          </nav>

          <header className="mt-4">
            <h1 className={ui.pageTitle}>{shelter.addressLine1}</h1>
            <p className="mt-2 text-base leading-7 text-gray-200">
              {shelter.postalCode} {shelter.city}
              <span className="text-gray-500" aria-hidden="true"> · </span>
              <span className="sr-only">, </span>
              <strong className="font-semibold text-white">{shelter.capacity.toLocaleString("da-DK")} registrerede pladser</strong>
              {anvendelseLabel ? (
                <>
                  <span className="text-gray-500" aria-hidden="true"> · </span>
                  <span className="sr-only">, </span>
                  {anvendelseLabel}
                </>
              ) : null}
            </p>
            <p className="mt-1 text-sm leading-6 text-gray-400">
              Adgang og stand er ikke bekræftet.{" "}
              <Link href="/om-data" className={ui.textLink}>Læs om data</Link>.
            </p>
          </header>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {directionsHref ? (
              <a href={directionsHref} target="_blank" rel="noopener noreferrer" className={ui.primaryAction}>
                Vis vej i Google Maps
                <span className="sr-only"> (åbner i en ny fane)</span>
              </a>
            ) : null}
            {hasCoords ? (
              <a href={`#${shelterMapSectionId}`} className={ui.secondaryAction}>
                Vis på kort
              </a>
            ) : null}
          </div>

          {hasCoords ? (
            <section id={shelterMapSectionId} className="mt-6 scroll-mt-24" aria-label="Kort">
              <ShelterDetailMap
                latitude={shelter.latitude!}
                longitude={shelter.longitude!}
                addressLabel={`${shelter.addressLine1}, ${shelter.postalCode} ${shelter.city}`}
              />
            </section>
          ) : (
            <p className="mt-6 text-sm text-gray-300">
              Der er ingen koordinater til denne registrering i det viste datasæt.
            </p>
          )}

          <section className="mt-8" aria-labelledby="registration-facts-heading">
            <h2 id="registration-facts-heading" className={ui.sectionTitle}>Registrerede oplysninger</h2>
            <dl className="mt-3 divide-y divide-white/10 border-y border-white/10 text-base">
              {[
                ["Registrerede pladser", `${shelter.capacity.toLocaleString("da-DK")} pladser`],
                ["Bygningens registrerede anvendelse", anvendelseLabel ?? "Ikke oplyst"],
                ["Offentlig adgang", "Ikke oplyst i datasættet"],
                ["Aktuel fysisk stand", "Ikke verificeret"],
                ["Datakilde", "BBR og DAR via Datafordeler"],
                ["Seneste dataimport", formatDataDate(shelter.lastImportedAt)],
              ].map(([term, value]) => (
                <div key={term} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-gray-400">{term}</dt>
                  <dd className="text-white sm:text-right">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              Spørgsmål om adgang til rummet: kontakt ejeren af bygningen eller{" "}
              <a href={municipalityContactUrl} target="_blank" rel="noopener noreferrer" className={ui.textLink}>kommunen via Borger.dk</a>.
            </p>
          </section>

          {relatedShelters.length > 0 ? (
            <section className="mt-8" aria-labelledby="related-heading">
              <h2 id="related-heading" className={ui.sectionTitle}>Andre registreringer i området</h2>
              <ul className="mt-3 divide-y divide-white/10 border-y border-white/10">
                {relatedShelters.map((related) => (
                  <li key={related.id}>
                    <Link
                      href={getReadableShelterPathFromStable(related) as Route}
                      className="flex min-h-[56px] items-center justify-between gap-4 py-2.5 text-base hover:bg-white/[0.04]"
                    >
                      <span>
                        <span className="break-safe block font-medium text-white underline decoration-white/30 underline-offset-4">{related.addressLine1}</span>
                        <span className="block text-sm text-gray-400">{related.postalCode} {related.city}</span>
                      </span>
                      <span className="shrink-0 text-right text-sm text-gray-300">
                        {related.capacity.toLocaleString("da-DK")} pladser
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                <Link href={`/kommune/${shelter.municipality.slug}`} className={ui.textLink}>
                  Alle registreringer i {shelter.municipality.name}
                </Link>
              </p>
            </section>
          ) : null}

          <section className="mt-8" aria-labelledby="report-heading">
            <h2 id="report-heading" className={ui.sectionTitle}>Er noget forkert?</h2>
            <p className="mt-2 text-sm leading-6 text-gray-300">
              Send en observation til moderationskøen. Rapporten ændrer ikke registreringen automatisk.
            </p>
            <div className="mt-3">
              <ReportShelterIssue shelterId={shelter.id} shelterAddress={shelter.addressLine1} />
            </div>
          </section>
        </article>
      </div>

      <GlobalFooter />
    </main>
  );
}
