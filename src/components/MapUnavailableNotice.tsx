"use client";

import Link from "next/link";

type BaseProps = {
  onRetry: () => void;
  fallbackLabel: string;
};

type Props = BaseProps & (
  | { fallbackHref: string; onFallback?: never }
  | { fallbackHref?: never; onFallback: () => void }
);

export default function MapUnavailableNotice({
  onRetry,
  fallbackLabel,
  fallbackHref,
  onFallback,
}: Props) {
  return (
    <div
      className="absolute inset-0 z-[1000] flex items-center justify-center bg-[#111]/95 p-5 text-center backdrop-blur-sm"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-sm rounded-lg border border-white/15 bg-[#171717] p-5 shadow-xl">
        <p className="font-semibold text-white">Kortbaggrunden er ikke tilgængelig</p>
        <p className="mt-2 text-sm leading-6 text-gray-300">
          Adresser og registreringer virker stadig. Brug listen, eller prøv kortet igen.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-gray-200"
          >
            Prøv kortet igen
          </button>
          {fallbackHref ? (
            <Link
              href={fallbackHref}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              {fallbackLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onFallback}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              {fallbackLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
