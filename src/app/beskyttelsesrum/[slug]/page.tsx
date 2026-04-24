import { notFound } from "next/navigation";
import type { Metadata } from "next";

import GlobalFooter from "@/components/GlobalFooter";
import ShelterOsmEmbedMap from "@/components/ShelterOsmEmbedMap";
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from "@/lib/anvendelseskoder";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { getAppV2PublicShelterBySlug, type AppV2ShelterDetail } from "@/lib/supabase/app-v2-queries";

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

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
    description: `${address}. Registreret kapacitet: ${shelter.capacity.toLocaleString("da-DK")} pladser.`,
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
  const [shelter, anvendelseskoder] = await Promise.all([
    getAppV2PublicShelterBySlug(slug),
    getAnvendelseskoder(),
  ]);

  if (!shelter) {
    notFound();
  }

  const jsonLd = getJsonLd(shelter);
  const navigationHref = getGoogleMapsRouteHref(shelter);
  const anvendelseRaw = getAnvendelseskodeBeskrivelse(shelter.sourceApplicationCode, anvendelseskoder).trim();
  const anvendelseLabel = anvendelseRaw || null;
  const hasCoords = shelter.latitude !== null && shelter.longitude !== null;

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

      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <article className={`space-y-8 ${navigationHref ? "pb-20 sm:pb-8" : ""}`}>
          <header className="space-y-4">
            <p className="text-sm uppercase tracking-wide text-gray-400">Beskyttelsesrum</p>
            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">{shelter.name}</h1>
            <p className="text-lg text-gray-300">
              {shelter.addressLine1}, {shelter.postalCode} {shelter.city}
            </p>
          </header>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-white">Overblik</h2>
              </div>

              {navigationHref ? (
                <a
                  href={navigationHref}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex shrink-0 items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
                >
                  Navigér hertil
                </a>
              ) : null}
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-[#0f0f0f]/40 p-4">
                <dt className="text-sm text-gray-400">Anvendelse</dt>
                <dd className="mt-1 text-base font-medium text-white">{anvendelseLabel ?? "—"}</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0f0f0f]/40 p-4">
                <dt className="text-sm text-gray-400">Pladser</dt>
                <dd className="mt-1 text-base font-medium text-white">
                  {shelter.capacity.toLocaleString("da-DK")} pladser
                </dd>
              </div>
            </dl>

            <p className="mt-4 text-sm text-gray-300/90">Følg altid myndighedernes anvisninger.</p>
          </section>

          {hasCoords ? (
            <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-white">Kort</h2>
              <div className="mt-4">
                <ShelterOsmEmbedMap
                  latitude={shelter.latitude!}
                  longitude={shelter.longitude!}
                  title={`Kort over ${shelter.name}`}
                />
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-white">Kort</h2>
              <p className="mt-2 text-sm text-gray-300">Der er ikke koordinater til dette beskyttelsesrum i datasættet.</p>
            </section>
          )}
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
