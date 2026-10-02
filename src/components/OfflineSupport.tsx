"use client";

import { useEffect } from "react";

import { migrateLegacyOfflineConsent, offlineWorkerPath, readOfflineCopy, removeOfflineCopy } from "@/lib/offline-copy";
import { useOfflineCopy } from "@/lib/use-offline-copy";

/**
 * Keeps the offline worker (public/offline-sw.js) in step with the visitor's
 * own choice to save an offline copy. With a saved copy, the worker is
 * registered once the page is idle, so it keeps the copy fresh on later
 * visits. Without one, any earlier worker and its caches are removed. The
 * statistics consent plays no part.
 */
export default function OfflineSupport() {
  const copy = useOfflineCopy();
  const hasCopy = copy === "pending" ? null : copy !== null;

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (hasCopy === null) return;
    // A visitor who allowed the old "offlinekopi" consent keeps the copy. The
    // migration must finish before the decision below, which otherwise still
    // sees "no copy" from this render and would delete the migrated one.
    migrateLegacyOfflineConsent();
    if (!hasCopy && !readOfflineCopy()) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        // Checked again: a copy saved meanwhile must not be removed.
        if (readOfflineCopy()) return;
        if (registrations.some((registration) => registration.active?.scriptURL.endsWith(offlineWorkerPath))) {
          return removeOfflineCopy();
        }
      }).catch(() => {
        // Best effort; the worker only serves public data.
      });
      return;
    }
    if (window.location.pathname.startsWith("/admin")) return;

    const register = () => {
      navigator.serviceWorker.register(offlineWorkerPath, { scope: "/" }).catch(() => {
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
  }, [hasCopy]);

  return null;
}
