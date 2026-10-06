"use client";

import { useState, useSyncExternalStore } from "react";

import {
  formatOfflineSavedAt,
  isOfflineCopySupported,
  removeOfflineCopy,
  saveOfflineCopy,
  type SavedOfflineSearch,
} from "@/lib/offline-copy";
import { useOfflineCopy } from "@/lib/use-offline-copy";

type Props = {
  /** Extra URLs to save, such as the tiles behind a result list. */
  extraUrls?: string[];
  /** The search to remember for offline use, when saved from a result page. */
  search?: SavedOfflineSearch;
  className?: string;
};

type Status = "idle" | "saving" | "removing" | "error";

const subscribeNever = () => () => {};

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * The result page and its map load as separate chunks, nested several levels
 * deep, and a phone fetches the map only when the "Kort" tab is opened.
 * Loading them from their own import sites (the bundler names chunks per
 * site) puts the same files among those the copy keeps, so the map also
 * works offline. Resolves false when a chunk could not be fetched, so the
 * visitor gets the partial-copy message.
 */
function loadNearbyChunks() {
  return import("@/app/naer-dig/map-wrapper")
    .then((mod) => mod.preloadNearbyResultPage())
    .then(() => true, () => false);
}

/**
 * "Gem til brug uden net": a choice the visitor makes, separate from the
 * statistics consent. Shows when the copy was saved and lets the visitor
 * update or delete it.
 */
export default function OfflineCopyControl({ extraUrls, search, className = "" }: Props) {
  const copy = useOfflineCopy();
  const supported = useSyncExternalStore(subscribeNever, isOfflineCopySupported, () => true);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  // Saving needs the network, so offline the control only shows the copy and "Slet".
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  if (!supported) {
    return (
      <p className={`text-sm leading-6 text-gray-400 ${className}`}>
        Din browser kan ikke gemme siden til brug uden net.
      </p>
    );
  }

  const savedAt = copy && copy !== "pending" ? formatOfflineSavedAt(copy.savedAt) : null;

  const save = async () => {
    setStatus("saving");
    setMessage("");
    try {
      const chunksLoaded = await loadNearbyChunks();
      const { failed } = await saveOfflineCopy({ extraUrls, search });
      setStatus("idle");
      setMessage(failed > 0 || !chunksLoaded ? "Gemt. Enkelte dele kunne ikke hentes og virker kun med net." : "Gemt. Siden virker nu også uden net.");
    } catch {
      setStatus("error");
      setMessage("Siden kunne ikke gemmes. Tjek forbindelsen, og prøv igen.");
    }
  };

  const remove = async () => {
    setStatus("removing");
    setMessage("");
    try {
      await removeOfflineCopy();
      setStatus("idle");
      setMessage("Offlinekopien er slettet fra din enhed.");
    } catch {
      setStatus("error");
      setMessage("Offlinekopien kunne ikke slettes. Prøv igen.");
    }
  };

  const busy = status === "saving" || status === "removing";
  const savedSearch = copy && copy !== "pending" ? copy.search : undefined;
  const linkClass = "inline-flex min-h-[44px] items-center font-medium text-white underline decoration-white/40 underline-offset-4 hover:decoration-white disabled:cursor-wait disabled:opacity-60";
  // A successful save shows in the status line itself; the message is for screen readers.
  const messageIsNotice = status === "error" || message.startsWith("Gemt. Enkelte");

  return (
    <div className={`text-sm leading-6 text-gray-300 ${className}`}>
      {savedAt ? (
        // One line (3.3): when, for which search, and what can be done.
        <div className="flex flex-wrap items-center gap-x-4">
          <span className="text-gray-300">Gemt {savedAt}{savedSearch ? ` for ${savedSearch.label}` : ""}</span>
          {online ? (
            <button type="button" onClick={save} disabled={busy} className={linkClass} aria-label={status === "saving" ? undefined : "Opdatér kopien til brug uden net"}>
              {status === "saving" ? "Gemmer …" : "Opdatér"}
            </button>
          ) : null}
          <button type="button" onClick={remove} disabled={busy} className={linkClass} aria-label="Slet kopien til brug uden net">
            Slet
          </button>
        </div>
      ) : online ? (
        <button type="button" onClick={save} disabled={busy} className={linkClass}>
          {status === "saving" ? "Gemmer …" : "Gem til brug uden net"}
        </button>
      ) : null}
      <p
        className={messageIsNotice ? (status === "error" ? "text-yellow-100" : "text-gray-400") : "sr-only"}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
    </div>
  );
}
