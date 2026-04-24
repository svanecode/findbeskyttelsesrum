"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Analytics = dynamic(() => import("@vercel/analytics/react").then((m) => m.Analytics), { ssr: false });
const SpeedInsights = dynamic(() => import("@vercel/speed-insights/next").then((m) => m.SpeedInsights), {
  ssr: false,
});

function scheduleIdle(callback: () => void, timeoutMs: number) {
  const ric = typeof window !== "undefined" ? window.requestIdleCallback : undefined;
  if (ric) {
    const id = ric(callback, { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, Math.min(1500, timeoutMs));
  return () => window.clearTimeout(id);
}

export default function VercelWebMetrics() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return scheduleIdle(() => setReady(true), 4000);
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
