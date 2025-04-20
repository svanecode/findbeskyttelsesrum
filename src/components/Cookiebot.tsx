'use client';

import Script from 'next/script';

declare global {
  interface Window {
    Cookiebot?: any;
  }
}

export default function Cookiebot() {
  return (
    <Script
      id="Cookiebot"
      src="https://consent.cookiebot.com/uc.js"
      data-cbid={process.env.NEXT_PUBLIC_COOKIEBOT_ID}
      type="text/javascript"
      async
    />
  );
} 