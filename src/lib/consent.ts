/**
 * The visitor's choice for optional processing. Storing this choice is itself
 * strictly necessary, so it needs no consent. Anonymous statistics stay off
 * until `statistics` is true. The offline copy is no longer part of this
 * choice (see src/lib/offline-copy.ts); `offline` is only read from choices
 * stored before that change.
 */
export type ConsentChoice = {
  version: 1;
  statistics: boolean;
  /** Legacy: set by the old "offlinekopi" consent option. */
  offline?: boolean;
  decidedAt: string;
};

export const consentStorageKey = "findbeskyttelsesrum.consent.v1";
export const consentChangeEvent = "findbeskyttelsesrum:consent-change";

function parseConsent(raw: string | null): ConsentChoice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ConsentChoice>;
    if (value?.version !== 1 || typeof value.statistics !== "boolean") return null;
    return {
      version: 1,
      statistics: value.statistics,
      ...(typeof value.offline === "boolean" ? { offline: value.offline } : {}),
      decidedAt: String(value.decidedAt ?? ""),
    };
  } catch {
    return null;
  }
}

let cachedRaw: string | null | undefined;
let cachedChoice: ConsentChoice | null = null;
// Used only when localStorage is unavailable (blocked storage, private modes).
let memoryChoice: ConsentChoice | null = null;

/** The stored choice, or null when the visitor has not decided yet. */
export function readConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(consentStorageKey);
  } catch {
    return memoryChoice;
  }
  if (raw === null && memoryChoice) return memoryChoice;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedChoice = parseConsent(raw);
  }
  return cachedChoice;
}

export function saveConsent(choice: { statistics: boolean }) {
  const value: ConsentChoice = { version: 1, statistics: choice.statistics, decidedAt: new Date().toISOString() };
  memoryChoice = value;
  try {
    window.localStorage.setItem(consentStorageKey, JSON.stringify(value));
  } catch {
    // Blocked storage: the choice lasts until the page is reloaded.
  }
  window.dispatchEvent(new Event(consentChangeEvent));
}

export function hasStatisticsConsent() {
  return readConsent()?.statistics === true;
}
