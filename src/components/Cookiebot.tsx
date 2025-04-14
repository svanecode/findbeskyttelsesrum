'use client';

import Script from 'next/script';

declare global {
  interface Window {
    Cookiebot?: any;
  }
}

export default function Cookiebot() {
  return (
    <>
      <Script
        id="Cookiebot"
        src="https://consent.cookiebot.com/uc.js"
        data-cbid={process.env.NEXT_PUBLIC_COOKIEBOT_ID}
        data-blockingmode="auto"
        data-culture="DA"
        data-framework="IAB"
        data-type="opt-in"
        strategy="afterInteractive"
        onLoad={() => {
          console.log('Cookiebot script loaded');
          if (window.Cookiebot) {
            console.log('Cookiebot object available');
          } else {
            console.error('Cookiebot object not available');
          }
        }}
        onError={(e) => {
          console.error('Error loading Cookiebot:', e);
        }}
      />
    </>
  );
} 