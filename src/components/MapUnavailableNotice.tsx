"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

type BaseProps = {
  onRetry: () => void;
  fallbackLabel: string;
};

type Props = BaseProps & (
  | { fallbackHref: string; onFallback?: never }
  | { fallbackHref?: never; onFallback: () => void }
);

const buttonClass =
  "inline-flex min-h-[44px] items-center rounded-md px-2 text-sm font-semibold text-white underline underline-offset-4 hover:bg-white/10";

/**
 * A narrow bar across the top of the map when the background tiles cannot be
 * loaded (3.4). Markers stay visible and usable below it. The bar publishes
 * its height as --map-notice-height on the map frame, so Leaflet's controls and
 * the legend move down instead of hiding under it (src/app/globals.css).
 */
export default function MapUnavailableNotice({
  onRetry,
  fallbackLabel,
  fallbackHref,
  onFallback,
}: Props) {
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      retryButtonRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, []);

  useEffect(() => {
    const bar = barRef.current;
    const frame = bar?.parentElement;
    if (!bar || !frame) return;
    const publish = () => frame.style.setProperty("--map-notice-height", `${bar.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      frame.style.removeProperty("--map-notice-height");
    };
  }, []);

  return (
    <div
      ref={barRef}
      className="absolute inset-x-0 top-0 z-[1000] flex flex-wrap items-center gap-x-3 border-b border-white/15 bg-[#141619]/95 py-0.5 pl-3 pr-1 text-sm leading-5 shadow-lg"
      role="alert"
      aria-live="assertive"
    >
      {/* One line of text, with the buttons beside it or, on a narrow map, under it. */}
      <p className="min-w-0 basis-full truncate pt-1.5 text-gray-200 sm:flex-1 sm:basis-0 sm:py-1.5">
        <span className="font-semibold text-white">Kortbaggrunden er ikke tilgængelig.</span>{" "}
        <span className="sr-only">Adresser og registreringer virker stadig.</span>
      </p>
      <div className="-ml-2 flex shrink-0 items-center sm:ml-0">
        <button ref={retryButtonRef} type="button" onClick={onRetry} className={buttonClass}>
          Prøv kortet igen
        </button>
        {fallbackHref ? (
          <Link href={fallbackHref} className={buttonClass}>
            {fallbackLabel}
          </Link>
        ) : (
          <button type="button" onClick={onFallback} className={buttonClass}>
            {fallbackLabel}
          </button>
        )}
      </div>
    </div>
  );
}
