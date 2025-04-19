'use client';

import Script from 'next/script';
import Head from 'next/head';

declare global {
  interface Window {
    Cookiebot?: any;
  }
}

export default function Cookiebot() {
  return (
    <>
      <Head>
        <link
          rel="preconnect"
          href="https://consent.cookiebot.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://consentcdn.cookiebot.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="script"
          href="https://consent.cookiebot.com/uc.js"
        />
      </Head>
      <Script
        id="Cookiebot"
        src="https://consent.cookiebot.com/uc.js"
        data-cbid={process.env.NEXT_PUBLIC_COOKIEBOT_ID}
        data-blockingmode="auto"
        data-culture="DA"
        data-framework="IAB"
        data-type="opt-in"
        strategy="beforeInteractive"
        onLoad={() => {
          if (window.Cookiebot) {
            console.log('Cookiebot initialized successfully');
          } else {
            console.error('Cookiebot initialization failed');
          }
        }}
        onError={(e) => {
          console.error('Error loading Cookiebot:', e);
        }}
      />
    </>
  );
} 