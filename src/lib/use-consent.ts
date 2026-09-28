"use client";

import { useSyncExternalStore } from "react";

import { consentChangeEvent, readConsent, type ConsentChoice } from "@/lib/consent";

function subscribe(onChange: () => void) {
  window.addEventListener(consentChangeEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(consentChangeEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The current choice. "pending" during server rendering and hydration, so
 * nothing optional renders before the stored choice has been read.
 */
export function useConsent(): ConsentChoice | null | "pending" {
  return useSyncExternalStore<ConsentChoice | null | "pending">(subscribe, readConsent, () => "pending");
}
