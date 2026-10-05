/**
 * The offline copy is something the visitor asks for ("Gem til brug uden
 * net"), not a consent choice: it stores public pages, the site's own files
 * and public registration tiles on the device, plus, when saved from a result
 * page, that one search. Statistics consent does not affect it.
 *
 * public/offline-sw.js does the caching. This module registers it, asks it to
 * save a list of URLs and remembers when that happened.
 */

import { readConsent } from "@/lib/consent";

export type SavedOfflineSearch = {
  label: string;
  latitude: number;
  longitude: number;
};

export type OfflineCopyRecord = {
  version: 1;
  savedAt: string;
  search?: SavedOfflineSearch;
};

export const offlineCopyStorageKey = "findbeskyttelsesrum.offline-copy.v1";
export const offlineCopyChangeEvent = "findbeskyttelsesrum:offline-copy-change";
export const offlineWorkerPath = "/offline-sw.js";

/** Pages every offline copy holds. */
export const offlinePages = ["/", "/naer-dig", "/om-data", "/privatliv"];

function isSavedSearch(value: unknown): value is SavedOfflineSearch {
  if (!value || typeof value !== "object") return false;
  const search = value as Partial<SavedOfflineSearch>;
  return typeof search.label === "string"
    && typeof search.latitude === "number" && Number.isFinite(search.latitude)
    && typeof search.longitude === "number" && Number.isFinite(search.longitude);
}

export function parseOfflineCopyRecord(raw: string | null): OfflineCopyRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OfflineCopyRecord>;
    if (value?.version !== 1 || typeof value.savedAt !== "string" || Number.isNaN(Date.parse(value.savedAt))) return null;
    return {
      version: 1,
      savedAt: value.savedAt,
      ...(isSavedSearch(value.search) ? { search: { label: value.search.label.slice(0, 120), latitude: value.search.latitude, longitude: value.search.longitude } } : {}),
    };
  } catch {
    return null;
  }
}

let cachedRaw: string | null | undefined;
let cachedRecord: OfflineCopyRecord | null = null;

/** The saved copy, or null. */
export function readOfflineCopy(): OfflineCopyRecord | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(offlineCopyStorageKey);
  } catch {
    return null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedRecord = parseOfflineCopyRecord(raw);
  }
  return cachedRecord;
}

function writeRecord(record: OfflineCopyRecord | null) {
  try {
    if (record) window.localStorage.setItem(offlineCopyStorageKey, JSON.stringify(record));
    else window.localStorage.removeItem(offlineCopyStorageKey);
  } catch {
    // Blocked storage: the copy still works, but its date is not remembered.
  }
  window.dispatchEvent(new Event(offlineCopyChangeEvent));
}

export function isOfflineCopySupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "caches" in window;
}

/** The site's own script and style files this page has loaded, so the saved pages can start offline. */
function loadedStaticAssets() {
  try {
    return performance
      .getEntriesByType("resource")
      .map((entry) => new URL(entry.name, window.location.href))
      .filter((url) => url.origin === window.location.origin && url.pathname.startsWith("/_next/static/"))
      .map((url) => url.pathname + url.search);
  } catch {
    return [];
  }
}

async function activeWorker() {
  await navigator.serviceWorker.register(offlineWorkerPath, { scope: "/" });
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active;
  if (!worker) throw new Error("The offline worker did not activate");
  return worker;
}

function askWorkerToSave(worker: ServiceWorker, urls: string[]) {
  return new Promise<{ saved: number; failed: number }>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => reject(new Error("The offline worker did not answer")), 60_000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      const data = event.data as { saved?: number; failed?: number } | null;
      resolve({ saved: Number(data?.saved ?? 0), failed: Number(data?.failed ?? 0) });
    };
    worker.postMessage({ type: "save-offline-copy", urls }, [channel.port2]);
  });
}

/**
 * Saves the offline copy: the standard pages, every site file this page has
 * loaded, and the given extra URLs (the tiles behind a result list).
 * Resolves with the new record; rejects when nothing could be saved.
 */
export async function saveOfflineCopy(options: { extraUrls?: string[]; search?: SavedOfflineSearch } = {}) {
  if (!isOfflineCopySupported()) throw new Error("Offline copies are not supported in this browser");
  const worker = await activeWorker();
  const urls = Array.from(new Set([
    ...offlinePages,
    window.location.pathname,
    ...loadedStaticAssets(),
    ...(options.extraUrls ?? []),
  ]));
  const result = await askWorkerToSave(worker, urls);
  if (result.saved === 0) throw new Error("Nothing could be saved for offline use");

  const previous = readOfflineCopy();
  const search = options.search ?? previous?.search;
  const record: OfflineCopyRecord = {
    version: 1,
    savedAt: new Date().toISOString(),
    ...(search ? { search } : {}),
  };
  writeRecord(record);
  return { record, failed: result.failed };
}

/** Removes the worker, everything it stored and the record. */
export async function removeOfflineCopy() {
  if (typeof window === "undefined") return;
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => registration.active?.scriptURL.endsWith(offlineWorkerPath) ?? true)
        .map((registration) => registration.unregister()),
    );
  }
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("offline-v")).map((name) => caches.delete(name)));
  }
  writeRecord(null);
}

/**
 * Before the offline copy became its own action, it was a consent option.
 * A visitor who allowed it keeps the copy they have; the flag then leaves the
 * consent choice.
 */
export function migrateLegacyOfflineConsent() {
  if (typeof window === "undefined") return;
  const legacy = readConsent();
  if (legacy?.offline === undefined) return;
  if (legacy.offline && !readOfflineCopy()) {
    writeRecord({ version: 1, savedAt: Date.parse(legacy.decidedAt) ? legacy.decidedAt : new Date().toISOString() });
  }
  forgetLegacyOfflineConsent();
}

function forgetLegacyOfflineConsent() {
  try {
    const key = "findbeskyttelsesrum.consent.v1";
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value && typeof value === "object" && "offline" in value) {
      delete value.offline;
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Nothing to clean up.
  }
}

/** "2. okt. kl. 11.44": when the copy was saved, short enough for one line. */
export function formatOfflineSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short" }).format(date);
  const time = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit" }).format(date);
  return `${day} kl. ${time}`;
}
