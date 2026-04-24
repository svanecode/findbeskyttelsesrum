import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import ErrorBoundary from "@/components/ErrorBoundary";
import SiteHeader from "@/components/SiteHeader";
import VercelWebMetrics from "@/components/VercelWebMetrics";
import { getWebsiteJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";
import { siteLocale, siteName, siteUrl } from "@/lib/seo/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  variable: "--font-inter",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: {
    default: "Find Beskyttelsesrum | Find nærmeste registrerede beskyttelsesrum",
    template: "%s | Find Beskyttelsesrum"
  },
  description:
    "Find nærmeste beskyttelsesrum i Danmark. Bygger på offentlige registerdata. Følg altid myndighedernes anvisninger.",
  keywords: ["find beskyttelsesrum", "beskyttelsesrum", "find nærmeste beskyttelsesrum", "nødstilfælde", "sikkerhed", "Danmark", "shelter", "emergency", "BBR", "DAR", "sikringspladser", "civilforsvar", "nødsituation", "beskyttelse", "sikkerhedsrum"],
  authors: [{ name: siteName }],
  creator: siteName,
  publisher: siteName,
  applicationName: siteName,
  category: "Sikkerhed",
  classification: "Public Service",
  icons: {
    icon: [
      { url: '/favicons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicons/favicon.ico', sizes: '48x48', type: 'image/x-icon' },
    ],
    apple: [
      { url: '/favicons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/favicons/safari-pinned-tab.svg',
        color: '#F97316',
      },
    ],
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: "Find Beskyttelsesrum | Find nærmeste registrerede beskyttelsesrum",
    description:
      "Find nærmeste beskyttelsesrum i Danmark. Bygger på offentlige registerdata. Følg altid myndighedernes anvisninger.",
    url: siteUrl,
    siteName,
    locale: siteLocale,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Find Beskyttelsesrum | Find nærmeste registrerede beskyttelsesrum",
    description:
      "Find nærmeste beskyttelsesrum i Danmark. Bygger på offentlige registerdata. Følg altid myndighedernes anvisninger.",
    creator: '@beskyttelsesrum',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  other: {
    'disclaimer': 'Denne tjeneste er uafhængig og er ikke tilknyttet, drevet eller godkendt af den danske stat eller nogen offentlige myndigheder.',
    'data-source': 'Oversigten bygger på offentlige registerdata og kan have begrænsninger.',
    'geo.region': 'DK',
    'geo.placename': 'Danmark',
    'version': '1.0.0',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const websiteJsonLd = getWebsiteJsonLd();

  return (
    <html lang="da" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
        <link rel="preload" href="/grid.svg" as="image" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1a1a1a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Beskyttelsesrum" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }}
        />
      </head>
      <body className={`${inter.className} antialiased`}>
        <ErrorBoundary>
          <SiteHeader />
          {children}
          {process.env.NODE_ENV === "production" ? <VercelWebMetrics /> : null}
        </ErrorBoundary>
      </body>
    </html>
  );
}
