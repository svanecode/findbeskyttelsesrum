"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { stripLocationDataFromMetric } from "@/lib/analytics/sanitize-url";
import { hasStatisticsConsent } from "@/lib/consent";
import { useConsent } from "@/lib/use-consent";

const Analytics = dynamic(() => import("@vercel/analytics/next").then((m) => m.Analytics), { ssr: false });
const SpeedInsights = dynamic(() => import("@vercel/speed-insights/next").then((m) => m.SpeedInsights), {
  ssr: false,
});

// Checked per event too, so a withdrawn consent stops sending at once even
// though the loaded scripts stay in the page until the next reload.
function onlyWithConsent<TEvent extends { url: string }>(event: TEvent) {
  return hasStatisticsConsent() ? stripLocationDataFromMetric(event) : null;
}

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
  const consent = useConsent();
  const allowed = typeof consent === "object" && consent?.statistics === true;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    return scheduleIdle(() => setReady(true), 4000);
  }, [allowed]);

  if (!allowed || !ready) {
    return null;
  }

  return (
    <>
      <Analytics beforeSend={onlyWithConsent} />
      <SpeedInsights beforeSend={onlyWithConsent} />
    </>
  );
}
