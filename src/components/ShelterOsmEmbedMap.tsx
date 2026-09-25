'use client';

import { useEffect, useState } from "react";

import { shelterMapSectionId } from "./shelter-map-section";

type Props = {
  latitude: number;
  longitude: number;
  title: string;
};

/** Small bbox around a point for OSM embed (lon,lat order in bbox). */
function osmEmbedSrc(latitude: number, longitude: number) {
  const pad = 0.012;
  const bbox = `${longitude - pad},${latitude - pad},${longitude + pad},${latitude + pad}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}

export default function ShelterOsmEmbedMap({ latitude, longitude, title }: Props) {
  // OpenStreetMap is only contacted after the visitor asks for the map, as the
  // privacy page promises.
  const [isActive, setIsActive] = useState(false);
  const src = osmEmbedSrc(latitude, longitude);

  useEffect(() => {
    const activateFromHash = () => {
      if (window.location.hash === `#${shelterMapSectionId}`) setIsActive(true);
    };
    activateFromHash();
    window.addEventListener("hashchange", activateFromHash);
    return () => window.removeEventListener("hashchange", activateFromHash);
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[color:var(--surface-inset)]">
      {isActive ? (
        <iframe
          title={title}
          src={src}
          className="aspect-[4/3] min-h-[17rem] w-full border-0 sm:min-h-[22rem]"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-popups allow-same-origin"
        />
      ) : (
        <div className="flex aspect-[4/3] min-h-[17rem] w-full flex-col items-center justify-center gap-3 p-6 text-center sm:min-h-[22rem]">
          <p className="max-w-xs text-sm leading-6 text-gray-300">
            Kortet hentes fra OpenStreetMap, når du vælger at vise det.
          </p>
          <button
            type="button"
            onClick={() => setIsActive(true)}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]"
          >
            Vis kortet
          </button>
        </div>
      )}
      <p className="border-t border-white/10 px-3 py-2 text-xs text-gray-400">
        Kort:{" "}
        <a
          href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-200 underline decoration-white/30 underline-offset-2 hover:text-white"
        >
          OpenStreetMap{" "}
          <span aria-hidden="true" className="inline-block translate-y-[0.5px]">
            →
          </span>
        </a>
      </p>
    </div>
  );
}
