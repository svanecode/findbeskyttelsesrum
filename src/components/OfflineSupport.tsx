"use client";

import { useEffect } from "react";

/**
 * Registers the offline fallback worker (public/offline-sw.js) in production.
 * Registration waits until the page is idle so it never competes with the
 * first search. The worker only caches public pages, static assets and
 * public nearby tiles.
 */
export default function OfflineSupport() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
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
  }, []);

  return null;
}
