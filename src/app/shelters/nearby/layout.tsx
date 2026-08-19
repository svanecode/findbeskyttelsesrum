import type { Metadata } from "next";

import { siteUrl } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Registreringer i nærheden",
  description:
    "Orienterende kort og liste over BBR-registrerede sikringsrumspladser i nærheden.",
  alternates: { canonical: "/shelters/nearby" },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Registreringer i nærheden",
    description:
      "Orienterende kort og liste over BBR-registrerede sikringsrumspladser i nærheden.",
    type: "website",
    url: `${siteUrl}/shelters/nearby`,
    siteName: "Find Beskyttelsesrum",
    locale: "da_DK",
  },
};

export default function NearbyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
