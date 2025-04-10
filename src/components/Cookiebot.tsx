'use client';

import Script from 'next/script';

export default function Cookiebot() {
  return (
    <Script
      id="Cookiebot"
      src="https://consent.cookiebot.com/uc.js"
      data-cbid={process.env.NEXT_PUBLIC_COOKIEBOT_ID}
      data-blockingmode="none"
      data-culture="DA"
      data-framework="IAB"
      data-type="opt-in"
      strategy="afterInteractive"
    />
  );
} 