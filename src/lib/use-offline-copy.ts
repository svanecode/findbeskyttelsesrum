"use client";

import { useSyncExternalStore } from "react";

import { offlineCopyChangeEvent, offlineCopyStorageKey, readOfflineCopy, type OfflineCopyRecord } from "@/lib/offline-copy";

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === offlineCopyStorageKey) onChange();
  };
  window.addEventListener(offlineCopyChangeEvent, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(offlineCopyChangeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved offline copy. "pending" during server rendering and hydration. */
export function useOfflineCopy(): OfflineCopyRecord | null | "pending" {
  return useSyncExternalStore<OfflineCopyRecord | null | "pending">(subscribe, readOfflineCopy, () => "pending");
}
