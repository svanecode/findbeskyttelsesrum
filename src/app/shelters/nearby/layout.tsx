import type { Metadata } from "next";

import { siteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Nærmeste beskyttelsesrum",
  description:
    "Resultater efter adresse eller placering: kort og liste over registrerede beskyttelsesrum i nærheden.",
  alternates: { canonical: "/shelters/nearby" },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Nærmeste beskyttelsesrum",
    description:
      "Resultater efter adresse eller placering: kort og liste over registrerede beskyttelsesrum i nærheden.",
    type: "website",
    url: `${siteUrl}/shelters/nearby`,
    siteName: "Find Beskyttelsesrum",
    locale: "da_DK",
  },
};

export default function NearbyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
