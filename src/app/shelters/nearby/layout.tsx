import type { Metadata } from "next";

import { siteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Nærmeste beskyttelsesrum",
  description:
    "Resultater efter adresse eller placering: kort og liste over de nærmeste beskyttelsesrum ud fra offentlige registerdata.",
  alternates: { canonical: "/shelters/nearby" },
  openGraph: {
    title: "Nærmeste beskyttelsesrum",
    description:
      "Resultater efter adresse eller placering: kort og liste over de nærmeste beskyttelsesrum ud fra offentlige registerdata.",
    type: "website",
    url: `${siteUrl}/shelters/nearby`,
    siteName: "Find Beskyttelsesrum",
    locale: "da_DK",
  },
};

export default function NearbyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
