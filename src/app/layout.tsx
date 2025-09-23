import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./globals.css";

// Initialize error tracking for production
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  import('@/lib/errorTracking');
}

const inter = Inter({ subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Find Beskyttelsesrum | Oversigt over alle beskyttelsesrum i Danmark",
    template: "%s | Find Beskyttelsesrum"
  },
  description: "Find beskyttelsesrum i dit område. Komplet oversigt over alle offentlige beskyttelsesrum i Danmark. Søg efter beskyttelsesrum i din kommune eller find det nærmeste baseret på din lokation. Data kommer fra BBR og DAR.",
  keywords: ["find beskyttelsesrum", "beskyttelsesrum", "find nærmeste beskyttelsesrum", "nødstilfælde", "sikkerhed", "Danmark", "shelter", "emergency", "BBR", "DAR", "sikringspladser", "civilforsvar", "nødsituation", "beskyttelse", "sikkerhedsrum"],
  authors: [{ name: "Find Beskyttelsesrum" }],
  creator: "Find Beskyttelsesrum",
  publisher: "Find Beskyttelsesrum",
  applicationName: "Find Beskyttelsesrum",
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
  metadataBase: new URL('https://findbeskyttelsesrum.dk'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: "Find Beskyttelsesrum | Oversigt over alle beskyttelsesrum i Danmark",
    description: "Find beskyttelsesrum i dit område. Komplet oversigt over alle offentlige beskyttelsesrum i Danmark. Søg efter beskyttelsesrum i din kommune eller find det nærmeste baseret på din lokation.",
    url: 'https://findbeskyttelsesrum.dk',
    siteName: 'Find Beskyttelsesrum',
    locale: 'da_DK',
    type: 'website',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Find Beskyttelsesrum - Oversigt over alle beskyttelsesrum i Danmark',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Find Beskyttelsesrum | Oversigt over alle beskyttelsesrum i Danmark",
    description: "Find beskyttelsesrum i dit område. Komplet oversigt over alle offentlige beskyttelsesrum i Danmark.",
    creator: '@beskyttelsesrum',
    images: ['/og-image.jpg'],
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
  verification: {
    google: 'your-google-site-verification',
    yandex: 'your-yandex-verification',
    yahoo: 'your-yahoo-verification',
  },
  other: {
    'disclaimer': 'Denne tjeneste er uafhængig og er ikke tilknyttet, drevet eller godkendt af den danske stat eller nogen offentlige myndigheder.',
    'data-source': 'Data kommer fra BBR og DAR. Private hjem og steder med færre end 40 pladser er udeladt.',
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
  return (
    <html lang="da">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1a1a1a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Beskyttelsesrum" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className={`${inter.className} ${spaceGrotesk.className} antialiased`}>
        <ErrorBoundary>
          {children}
          {process.env.NODE_ENV === "production" && (
            <>
              <Analytics />
              <SpeedInsights />
              <ServiceWorkerRegistration />
            </>
          )}
        </ErrorBoundary>
      </body>
    </html>
  );
}
