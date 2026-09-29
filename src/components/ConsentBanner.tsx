"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { readConsent, saveConsent } from "@/lib/consent";
import { useConsent } from "@/lib/use-consent";

const buttonBase =
  "inline-flex min-h-[48px] items-center justify-center rounded-lg px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300";
// Accept and decline carry equal weight, so neither choice is nudged.
const choiceButton = `${buttonBase} border border-white/20 bg-white/[0.06] text-white hover:bg-white/[0.12]`;

function Choices({ onSaved, showCustomize = true }: { onSaved?: () => void; showCustomize?: boolean }) {
  const current = readConsent();
  const [customizing, setCustomizing] = useState(!showCustomize);
  const [statistics, setStatistics] = useState(current?.statistics ?? false);
  const [offline, setOffline] = useState(current?.offline ?? false);
  const statisticsId = useId();
  const offlineId = useId();

  const save = (choice: { statistics: boolean; offline: boolean }) => {
    saveConsent(choice);
    onSaved?.();
  };

  return (
    <div>
      {customizing ? (
        <fieldset className="mt-4 space-y-3">
          <legend className="sr-only">Vælg, hvad du tillader</legend>
          <div className="flex gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
            <input id={statisticsId} type="checkbox" checked={statistics} onChange={(event) => setStatistics(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-orange-500" />
            <label htmlFor={statisticsId} className="text-sm leading-6 text-gray-200">
              <span className="font-semibold text-white">Anonym statistik.</span> Tællinger af sidevisninger og handlinger
              (Vercel Web Analytics og Speed Insights samt tjenestens egne tællere) uden cookies, adresse eller position.
            </label>
          </div>
          <div className="flex gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
            <input id={offlineId} type="checkbox" checked={offline} onChange={(event) => setOffline(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-orange-500" />
            <label htmlFor={offlineId} className="text-sm leading-6 text-gray-200">
              <span className="font-semibold text-white">Offlinekopi.</span> Browseren gemmer sidens filer og de senest hentede
              offentlige kortfliser på din enhed, så søgning med &quot;Brug min placering&quot; kan virke uden net.
            </label>
          </div>
          <div className="flex gap-3 rounded-lg border border-white/10 p-3 text-sm leading-6 text-gray-400">
            <svg aria-hidden viewBox="0 0 20 20" className="mt-1 h-5 w-5 shrink-0 rounded bg-white/15 p-0.5 text-gray-200" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p><span className="font-semibold text-gray-200">Nødvendige funktioner</span> er altid slået til: din søgning i den aktuelle fane og dette valg.</p>
          </div>
          <button type="button" onClick={() => save({ statistics, offline })} className={`${choiceButton} w-full`}>
            Gem valg
          </button>
        </fieldset>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => save({ statistics: true, offline: true })} className={choiceButton}>
          Tillad alle
        </button>
        <button type="button" onClick={() => save({ statistics: false, offline: false })} className={choiceButton}>
          Kun nødvendige
        </button>
      </div>
      {showCustomize && !customizing ? (
        <button type="button" onClick={() => setCustomizing(true)} className="mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-gray-200 underline underline-offset-4 hover:text-white">
          Tilpas valg
        </button>
      ) : null}
    </div>
  );
}

/**
 * First-visit consent dialog. It must be answered, but the search behind it
 * works fully whatever the visitor chooses. Not shown on /privatliv (so the
 * policy can be read first) or in the private admin.
 */
export default function ConsentBanner() {
  const consent = useConsent();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = consent === null && pathname !== "/privatliv" && !pathname.startsWith("/admin");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Start on the dialog itself, not on "Tillad alle", so neither choice is pre-selected.
      dialog.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      tabIndex={-1}
      onCancel={(event) => event.preventDefault()}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain focus:outline-none rounded-xl border border-white/15 bg-[#141517] p-5 text-white shadow-2xl backdrop:bg-black/70 sm:p-6"
    >
      <h2 id={titleId} className="text-xl font-semibold">Cookies og samtykke</h2>
      <p className="mt-3 text-sm leading-6 text-gray-300">
        Søgningen virker fuldt ud, uanset hvad du vælger. Med dit samtykke tæller vi anonymt, hvordan tjenesten bruges, og
        gemmer en offlinekopi på din enhed. Vi bruger ikke cookies til markedsføring eller sporing.
      </p>
      <Choices />
      <p className="mt-3 text-xs leading-5 text-gray-400">
        Du kan altid ændre dit valg under{" "}
        <Link href="/privatliv#samtykke" className="underline underline-offset-4 hover:text-white">Privatliv</Link>.
      </p>
    </dialog>
  );
}

/** The same choices inline on /privatliv, where a visitor can review and change them. */
export function ConsentSettings() {
  const consent = useConsent();
  const [saved, setSaved] = useState(false);

  if (consent === "pending") return <p className="mt-3 text-sm text-gray-400">Indlæser dit valg…</p>;

  return (
    <div className="mt-3">
      <p className="text-sm leading-6 text-gray-300" role="status">
        {consent === null
          ? "Du har ikke truffet et valg endnu. Indtil da er kun nødvendige funktioner slået til."
          : `Dit nuværende valg: anonym statistik ${consent.statistics ? "tilladt" : "fravalgt"}, offlinekopi ${consent.offline ? "tilladt" : "fravalgt"}.`}
        {saved ? " Dit valg er gemt." : ""}
      </p>
      <Choices key={consent === null ? "none" : consent.decidedAt} showCustomize={false} onSaved={() => setSaved(true)} />
    </div>
  );
}
