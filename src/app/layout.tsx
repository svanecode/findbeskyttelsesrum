import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export const metadata: Metadata = {
  title: {
    default: "Find Beskyttelsesrum | Find nærmeste beskyttelsesrum",
    template: "%s | Find Beskyttelsesrum"
  },
  description:
    "Find nærmeste beskyttelsesrum i Danmark. Bygger på offentlige registerdata. Følg altid myndighedernes anvisninger.",
  keywords: ["find beskyttelsesrum", "beskyttelsesrum", "find nærmeste beskyttelsesrum", "nødstilfælde", "sikkerhed", "Danmark", "shelter", "emergency", "BBR", "DAR", "sikringspladser", "civilforsvar", "nødsituation", "beskyttelse", "sikkerhedsrum"],
  authors: [{ name: siteName }],
  creator: siteName,
  publisher: siteName,
  applicationName: siteName,
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Beskyttelsesrum",
    statusBarStyle: "black-translucent",
  },
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
    title: "Find Beskyttelsesrum | Find nærmeste beskyttelsesrum",
    description:
      "Find nærmeste beskyttelsesrum i Danmark. Bygger på offentlige registerdata. Følg altid myndighedernes anvisninger.",
    url: siteUrl,
    siteName,
    locale: siteLocale,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Find Beskyttelsesrum | Find nærmeste beskyttelsesrum",
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
    'mobile-web-app-capable': 'yes',
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
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }}
        />
      </head>
      <body className="font-inter antialiased">
        <ErrorBoundary>
          <a
            href="#main-content"
            className="fixed left-[max(1rem,env(safe-area-inset-left,0px))] top-[env(safe-area-inset-top,0px)] z-[100] -translate-y-full rounded-b-lg bg-white px-4 py-3 text-sm font-semibold text-black shadow-md outline-none transition-transform focus:translate-y-0 focus:ring-2 focus:ring-orange-400/60 focus:ring-offset-2 focus:ring-offset-[#0a0a0a]"
          >
            Spring til indhold
          </a>
          <SiteHeader />
          {children}
          {process.env.NODE_ENV === "production" ? <VercelWebMetrics /> : null}
        </ErrorBoundary>
      </body>
    </html>
  );
}
