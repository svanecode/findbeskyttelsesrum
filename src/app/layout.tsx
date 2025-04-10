import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import CookiebotWrapper from "@/components/CookiebotWrapper";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Find Beskyttelsesrum",
    template: "%s | Find Beskyttelsesrum"
  },
  description: "Find det nærmeste beskyttelsesrum i dit område. Vores platform hjælper dig med at lokalisere sikre steder i nødstilfælde. Data kommer fra BBR og DAR.",
  keywords: ["beskyttelsesrum", "nødstilfælde", "sikkerhed", "Danmark", "shelter", "emergency", "BBR", "DAR", "sikringspladser"],
  authors: [{ name: "Find Beskyttelsesrum" }],
  creator: "Find Beskyttelsesrum",
  publisher: "Find Beskyttelsesrum",
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
    title: "Find Beskyttelsesrum",
    description: "Find det nærmeste beskyttelsesrum i dit område. Vores platform hjælper dig med at lokalisere sikre steder i nødstilfælde. Data kommer fra BBR og DAR.",
    url: 'https://findbeskyttelsesrum.dk',
    siteName: 'Find Beskyttelsesrum',
    locale: 'da_DK',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Find Beskyttelsesrum",
    description: "Find det nærmeste beskyttelsesrum i dit område. Vores platform hjælper dig med at lokalisere sikre steder i nødstilfælde. Data kommer fra BBR og DAR.",
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
  verification: {
    google: 'your-google-site-verification',
  },
  other: {
    'disclaimer': 'Denne tjeneste er uafhængig og er ikke tilknyttet, drevet eller godkendt af den danske stat eller nogen offentlige myndigheder.',
    'data-source': 'Data kommer fra BBR og DAR. Private hjem og steder med færre end 40 pladser er udeladt.',
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
        <CookiebotWrapper />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#ffffff" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      console.log('ServiceWorker registration successful');
                    },
                    function(err) {
                      console.log('ServiceWorker registration failed: ', err);
                    }
                  );
                });
              }
            `,
          }}
        />
      </head>
      <body className={`${inter.className} ${spaceGrotesk.className} antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
