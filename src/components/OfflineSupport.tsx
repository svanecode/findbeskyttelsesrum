"use client";

import { useEffect } from "react";

import { useConsent } from "@/lib/use-consent";

async function removeOfflineCopy() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => registration.active?.scriptURL.endsWith("/offline-sw.js") ?? true)
      .map((registration) => registration.unregister()),
  );
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("offline-v")).map((name) => caches.delete(name)));
  }
}

/**
 * Registers the offline fallback worker (public/offline-sw.js) in production,
 * but only once the visitor has allowed the offline copy. Registration waits
 * until the page is idle so it never competes with the first search. The
 * worker only caches public pages, static assets and public nearby tiles.
 * Declining (or withdrawing) removes the worker and everything it stored.
 */
export default function OfflineSupport() {
  const consent = useConsent();
  const decision = consent === "pending" || consent === null ? null : consent.offline;

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (decision === null) return;
    if (decision === false) {
      removeOfflineCopy().catch(() => {
        // Best effort; the worker also only serves public data.
      });
      return;
    }
    if (window.location.pathname.startsWith("/admin")) return;

    const register = () => {
      navigator.serviceWorker.register("/offline-sw.js", { scope: "/" }).catch(() => {
        // Offline support is an enhancement; the site works without it.
      });
    };

    if (document.readyState === "complete") {
      const id = window.setTimeout(register, 3000);
      return () => window.clearTimeout(id);
    }
    const onLoad = () => window.setTimeout(register, 3000);
    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, [decision]);

  return null;
}
