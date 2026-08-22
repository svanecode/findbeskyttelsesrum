import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import GlobalFooter from "@/components/GlobalFooter";
import BackLinkButton from "@/components/BackLinkButton";
import RegistrationNotice, { RegistrationStatusLabels } from "@/components/RegistrationNotice";
import ReportShelterIssue from "@/components/ReportShelterIssue";
import ProductMetricView from "@/components/ProductMetricView";
import ShelterOsmEmbedMap from "@/components/ShelterOsmEmbedMap";
import { ui } from "@/components/ui-classes";
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from "@/lib/anvendelseskoder";
import { getBreadcrumbJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";
import { siteUrl } from "@/lib/seo/site";
import { getShelterPublicDisplayName } from "@/lib/shelter-display-name";
import { getShelterPublicPath } from "@/lib/shelter-public-url";
import {
  getAppV2PublicRelatedShelters,
  resolveAppV2PublicShelter,
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
  return getShelterPublicPath(slug);
}

function getGoogleMapsPlaceHref(shelter: AppV2PublicShelterDetail) {
  if (shelter.latitude === null || shelter.longitude === null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${shelter.latitude},${shelter.longitude}`;
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

  if (shelter.lastImportedAt) {
    jsonLd.dateModified = shelter.lastImportedAt;
  }

  return jsonLd;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resolution = await resolveAppV2PublicShelter(slug);
  const shelter = resolution?.shelter ?? null;

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
  const [resolution, anvendelseskoder] = await Promise.all([
    resolveAppV2PublicShelter(slug),
    getAnvendelseskoder(),
  ]);

  if (!resolution) {
    notFound();
  }

  const { shelter } = resolution;
  if (resolution.isAlias) {
    permanentRedirect(getShelterCanonicalPath(shelter.slug));
  }

  const displayName = getShelterPublicDisplayName(shelter.name, shelter.addressLine1);
  const jsonLd = getJsonLd(shelter, displayName);
  const breadcrumbJsonLd = getBreadcrumbJsonLd([
    { name: "Forside", url: siteUrl },
    {
      name: shelter.municipality.name,
      url: `${siteUrl}/kommune/${shelter.municipality.slug}`,
    },
    {
      name: `Registrering ved ${shelter.addressLine1}`,
      url: `${siteUrl}${getShelterCanonicalPath(shelter.slug)}`,
    },
  ]);
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
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <article className="space-y-8">
          <nav aria-label="Brødkrummer">
            <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-400">
              <li>
                <Link className="transition hover:text-white" href="/">
                  Forside
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  className="transition hover:text-white"
                  href={`/kommune/${shelter.municipality.slug}`}
                >
                  {shelter.municipality.name}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="break-safe min-w-0 text-gray-200" aria-current="page">
                Registrering ved {shelter.addressLine1}
              </li>
            </ol>
          </nav>

          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Side">
            <BackLinkButton
              fallbackHref={`/kommune/${shelter.municipality.slug}`}
              label={`Tilbage til ${shelter.municipality.name}`}
              shortLabel="Tilbage"
            />
          </nav>

          <header className="space-y-4">
            <p className="text-sm uppercase tracking-wide text-gray-300">BBR-registrering</p>
            <h1 className={ui.pageTitle}>
              Registrering ved {shelter.addressLine1}
            </h1>
            <p className="text-lg text-gray-300">
              {shelter.postalCode} {shelter.city}
            </p>
            <RegistrationStatusLabels />
          </header>

          <RegistrationNotice />

          <section className={`${ui.panel} p-5 sm:p-6`}>
            <h2 className="text-lg font-semibold text-white">Registrerede oplysninger</h2>

            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className={`${ui.panelInset} p-4`}>
                <dt className="text-sm text-gray-300">Registrerede pladser</dt>
                <dd className="mt-1 text-base font-medium text-white">
                  {shelter.capacity.toLocaleString("da-DK")} pladser
                </dd>
              </div>
              <div className={`${ui.panelInset} p-4`}>
                <dt className="text-sm text-gray-300">Bygningens registrerede anvendelse</dt>
                <dd className="mt-1 text-base font-medium text-white">{anvendelseLabel ?? "Ikke oplyst"}</dd>
              </div>
              <div className={`${ui.panelInset} p-4`}>
                <dt className="text-sm text-gray-300">Datakilde</dt>
                <dd className="mt-1 text-base font-medium text-white">BBR og DAR via Datafordeler</dd>
              </div>
              <div className={`${ui.panelInset} p-4`}>
                <dt className="text-sm text-gray-300">Seneste dataimport</dt>
                <dd className="mt-1 text-base font-medium text-white">{formatDataDate(shelter.lastImportedAt)}</dd>
              </div>
              <div className={`${ui.panelInset} p-4`}>
                <dt className="text-sm text-gray-300">Offentlig adgang</dt>
                <dd className="mt-1 text-base font-medium text-white">Ikke oplyst i datasættet</dd>
              </div>
              <div className={`${ui.panelInset} p-4`}>
                <dt className="text-sm text-gray-300">Aktuel fysisk stand</dt>
                <dd className="mt-1 text-base font-medium text-white">Ikke verificeret</dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {hasCoords ? (
                <a
                  href="#registrering-kort"
                  className={ui.primaryAction}
                >
                  Vis på kort
                </a>
              ) : null}
              {mapHref ? (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ui.secondaryAction}
                  aria-label="Se adressen i Google Maps"
                >
                  Se adressen i kort
                </a>
              ) : null}
              <a
                href={municipalityContactUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={ui.secondaryAction}
              >
                Find kommunen på Borger.dk
              </a>
              <Link
                href={`/kommune/${shelter.municipality.slug}`}
                className={ui.quietAction}
              >
                Se andre registreringer i {shelter.municipality.name}
              </Link>
            </div>
          </section>

          {hasCoords ? (
            <section id="registrering-kort" className={`scroll-mt-24 p-5 sm:p-6 ${ui.panel}`}>
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
            <section className={`${ui.panel} p-5 sm:p-6`}>
              <h2 className="text-lg font-semibold text-white">Kort</h2>
              <p className="mt-2 text-sm text-gray-300">
                Der er ingen koordinater til denne registrering i det viste datasæt.
              </p>
            </section>
          )}

          <section className={`${ui.panel} p-5 sm:p-6`}>
            <h2 className="text-lg font-semibold text-white">Er noget forkert?</h2>
            <p className="mt-2 text-sm leading-6 text-gray-300">
              Send en observation til moderationskøen. Rapporten ændrer ikke registreringen automatisk.
            </p>
            <div className="mt-4">
              <ReportShelterIssue shelterId={shelter.id} shelterAddress={shelter.addressLine1} />
            </div>
          </section>

          {relatedShelters.length > 0 ? (
            <section className={`${ui.panel} p-5 sm:p-6`}>
              <h2 className="text-lg font-semibold text-white">Andre registreringer i samme område</h2>
              <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
                {relatedShelters.map((related) => (
                  <li key={related.id}>
                    <Link
                      href={`/beskyttelsesrum/${related.slug}`}
                      className="flex min-h-[64px] items-center justify-between gap-4 py-3 text-sm hover:text-orange-200"
                    >
                      <span>
                        <span className="break-safe block font-medium text-white">{related.addressLine1}</span>
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
