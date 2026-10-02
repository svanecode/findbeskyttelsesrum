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

/**
 * The result page and its map load as separate chunks, nested several levels
 * deep, and a phone fetches the map only when the "Kort" tab is opened.
 * Loading them from their own import sites (the bundler names chunks per
 * site) puts the same files among those the copy keeps, so the map also
 * works offline.
 */
function loadNearbyChunks() {
  return import("@/app/naer-dig/map-wrapper")
    .then((mod) => mod.preloadNearbyResultPage())
    .catch(() => undefined);
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
      await loadNearbyChunks();
      const { failed } = await saveOfflineCopy({ extraUrls, search });
      setStatus("idle");
      setMessage(failed > 0 ? "Gemt. Enkelte dele kunne ikke hentes og virker kun med net." : "Gemt. Siden virker nu også uden net.");
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

  return (
    <div className={`text-sm leading-6 text-gray-300 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={save}
          disabled={status === "saving" || status === "removing"}
          className="inline-flex min-h-[44px] items-center font-medium text-white underline decoration-white/40 underline-offset-4 hover:decoration-white disabled:cursor-wait disabled:opacity-60"
        >
          {status === "saving" ? "Gemmer …" : savedAt ? "Opdatér kopien til brug uden net" : "Gem til brug uden net"}
        </button>
        {savedAt ? (
          <>
            <span className="text-gray-400">Gemt {savedAt}{copy && copy !== "pending" && copy.search ? `, med søgningen ${copy.search.label}` : ""}</span>
            <button
              type="button"
              onClick={remove}
              disabled={status === "saving" || status === "removing"}
              className="inline-flex min-h-[44px] items-center text-gray-300 underline underline-offset-4 hover:text-white disabled:opacity-60"
            >
              Slet kopien
            </button>
          </>
        ) : null}
      </div>
      <p className={status === "error" ? "text-yellow-100" : "text-gray-400"} role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
