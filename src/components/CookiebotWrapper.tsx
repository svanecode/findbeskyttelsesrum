'use client';

import dynamic from 'next/dynamic';

const Cookiebot = dynamic(() => import('./Cookiebot'), {
  ssr: false
});

export default function CookiebotWrapper() {
  return <Cookiebot />;
} 