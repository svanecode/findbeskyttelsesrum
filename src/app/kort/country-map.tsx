"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "@/styles/leaflet-overrides.css";
import type {
  CountryMapFeature,
  CountryMapFeaturesResponse,
  CountryMapShelterMarker,
  CountryMapViewport,
} from "@/types/country-map";
import MapUnavailableNotice from "@/components/MapUnavailableNotice";
import type { MapTileStatus } from "@/components/ResilientMapTileLayer";
import { ensureLeafletPopupStyles } from "@/lib/leaflet/ensure-popup-styles";
import { setupLeafletDefaults } from "@/lib/leaflet/setup-defaults";
import { getAnvendelseskodeBeskrivelse, getAnvendelseskoder } from "@/lib/anvendelseskoder";
import type { Anvendelseskode } from "@/types/anvendelseskode";
import { buildLeafletPopupHtml } from "@/lib/leaflet/popup-html";
import { denmarkMaxBounds } from "@/lib/maps/denmark-bounds";
import { getShelterPublicDisplayName } from "@/lib/shelter-display-name";
import {
  countryMapViewportContains,
  createBufferedCountryMapViewport,
} from "@/lib/maps/country-map-viewport";

const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false },
);
const ResilientMapTileLayer = dynamic(() => import("@/components/ResilientMapTileLayer"), { ssr: false });
const MapViewportEvents = dynamic(() => import("./map-viewport-events"), { ssr: false });
const ServerClusterLayer = dynamic(() => import("./server-cluster-layer"), { ssr: false });
const MarkerClusterGroup = dynamic(
  () => import("@/components/MarkerClusterGroup").then((mod) => mod.default),
  { ssr: false },
);

function makeShelterIcon(L: typeof import("leaflet")) {
  const size = 26;
  const border = 3;
  const color = "var(--accent)";
  const shadow = "0 3px 8px rgba(0,0,0,0.4)";
  return L.divIcon({
    className: "shelter-marker",
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:${border}px solid white;border-radius:50%;box-shadow:${shadow};"></div>`,
    iconSize: [size + 8, size + 8],
    iconAnchor: [(size + 8) / 2, (size + 8) / 2],
    popupAnchor: [0, -((size + 8) / 2)],
  });
}

function buildPopupHtml(shelter: CountryMapShelterMarker, anvendelse: string) {
  const postalLine = [shelter.postalCode, shelter.city].filter(Boolean).join(" ").trim();
  const title = shelter.addressLine1?.trim()
    ? shelter.addressLine1.trim()
    : getShelterPublicDisplayName(shelter.name, shelter.addressLine1 ?? "");
  const slugSeg = encodeURIComponent(shelter.slug);
  return buildLeafletPopupHtml({
    title,
    usageLine: anvendelse,
    postalLine,
    capacity: shelter.capacity,
    href: `/beskyttelsesrum/${slugSeg}`,
  });
}

function MapLoadingSkeleton() {
  return (
    <div
      className="relative h-[60vh] min-h-[60vh] w-full overflow-hidden rounded-lg border border-white/10 bg-[var(--surface-elevated)] md:h-[calc(100vh-12rem)] md:min-h-[70vh]"
      role="status"
      aria-live="polite"
      aria-label="Indlæser kort over BBR-registreringer"
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500/30 border-t-orange-500" />
          <p className="text-sm text-gray-400">Indlæser kort...</p>
        </div>
      </div>
    </div>
  );
}

type MarkerClusterLike = {
  clearLayers(): void;
  addLayers(layers: import("leaflet").Layer[]): void;
};

type MarkerLoadState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "loaded";
      features: CountryMapFeature[];
      generatedAt: string;
      featureCount: number;
      markerCount: number;
      clusterCount: number;
      availableCount: number;
      truncated: boolean;
      refreshing: boolean;
      refreshError: boolean;
    };

const noFeatures: CountryMapFeature[] = [];

export default function CountryMap({
  initialDatasetRevision,
}: {
  initialDatasetRevision: string;
}) {
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const [shelterMarkerIcon, setShelterMarkerIcon] = useState<import("leaflet").DivIcon | null>(null);
  const clusterRef = useRef<MarkerClusterLike | null>(null);
  const [clusterReady, setClusterReady] = useState(false);
  const [markerState, setMarkerState] = useState<MarkerLoadState>({ status: "loading" });
  /** First marker batch applied — until then show on-map status for a11y. */
  const [markerChunkReady, setMarkerChunkReady] = useState(false);
  const [anvendelseskoder, setAnvendelseskoderState] = useState<Anvendelseskode[]>([]);
  const [viewport, setViewport] = useState<CountryMapViewport | null>(null);
  const [datasetRevision, setDatasetRevision] = useState(initialDatasetRevision);
  const [markerRetryKey, setMarkerRetryKey] = useState(0);
  const [tileStatus, setTileStatus] = useState<MapTileStatus>("loading");
  const [tileRetryKey, setTileRetryKey] = useState(0);
  const features = markerState.status === "loaded" ? markerState.features : noFeatures;
  const shelters = useMemo(
    () => features.filter((feature) => feature.kind === "marker"),
    [features],
  );
  const serverClusters = useMemo(
    () => features.filter((feature) => feature.kind === "cluster"),
    [features],
  );

  useEffect(() => {
    ensureLeafletPopupStyles();
    let cancelled = false;
    import("leaflet").then((leaflet) => {
      if (cancelled) return;
      const L = leaflet.default;
      setupLeafletDefaults(L);
      leafletRef.current = L;
      setShelterMarkerIcon(makeShelterIcon(L));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAnvendelseskoder().then((codes) => {
      if (cancelled) return;
      setAnvendelseskoderState(codes);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const icon = shelterMarkerIcon;
    const cg = clusterRef.current;
    if (!L || !icon || !cg) return;
    if (markerState.status !== "loaded") return;

    const BATCH = 500;
    let cancelled = false;
    let rafId: number | null = null;

    cg.clearLayers();

    if (shelters.length === 0) {
      return () => {
        cancelled = true;
        if (rafId !== null) window.cancelAnimationFrame(rafId);
        cg.clearLayers();
      };
    }

    const scheduleNext = (fn: () => void) => {
      rafId = window.requestAnimationFrame(() => {
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          fn();
        });
      });
    };

    const pump = (from: number) => {
      if (cancelled) return;
      const slice = shelters.slice(from, from + BATCH);
      if (slice.length === 0) return;
      const layers: import("leaflet").Marker[] = [];
      for (const s of slice) {
        const anvendelse = getAnvendelseskodeBeskrivelse(s.sourceApplicationCode ?? null, anvendelseskoder);
        const marker = L.marker([s.latitude, s.longitude], {
          icon,
          title: `${s.addressLine1}, ${s.postalCode} ${s.city}`.trim(),
          alt: `BBR-registrering ved ${s.addressLine1}`,
        });
        // Match kommune-kortets popup sizing (use popup-html + shared CSS)
        marker.bindPopup(buildPopupHtml(s, anvendelse), { className: "fb-popup" });
        marker.on("click", () => {
          marker.openPopup();
        });
        layers.push(marker);
      }
      cg.addLayers(layers);
      if (from === 0) {
        setMarkerChunkReady(true);
      }
      const next = from + BATCH;
      if (next < shelters.length) {
        scheduleNext(() => pump(next));
      }
    };

    if (shelters.length > 0) {
      scheduleNext(() => pump(0));
    }

    return () => {
      cancelled = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      cg.clearLayers();
    };
  }, [markerState.status, shelters, shelterMarkerIcon, clusterReady, anvendelseskoder]);

  useEffect(() => {
    if (!viewport) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const search = new URLSearchParams({
        format: "features",
        revision: datasetRevision,
        north: String(viewport.north),
        south: String(viewport.south),
        east: String(viewport.east),
        west: String(viewport.west),
        zoom: String(viewport.zoom),
      });

      const loadMarkers = async () => {
        try {
          setMarkerState((current) => current.status === "loaded"
            ? { ...current, refreshing: true, refreshError: false }
            : { status: "loading" });
          const response = await fetch(`/api/country-shelters?${search.toString()}`, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          });

          if (response.status === 409) {
            const changed = (await response.json()) as { currentRevision?: unknown };
            if (typeof changed.currentRevision === "string" && changed.currentRevision !== datasetRevision) {
              setDatasetRevision(changed.currentRevision);
              return;
            }
          }

          if (!response.ok) {
            throw new Error(`Marker endpoint failed with ${response.status}`);
          }

          const payload = (await response.json()) as CountryMapFeaturesResponse;

          if (
            payload.contract !== "country-map-features-v2"
            || payload.datasetRevision !== datasetRevision
            || !Array.isArray(payload.features)
          ) {
            throw new Error("Marker endpoint returned an invalid contract");
          }

          if (cancelled) return;
          setMarkerChunkReady(false);
          setMarkerState({
            status: "loaded",
            features: payload.features,
            generatedAt: payload.generatedAt,
            featureCount: payload.featureCount,
            markerCount: payload.markerCount,
            clusterCount: payload.clusterCount,
            availableCount: payload.availableCount,
            truncated: payload.truncated,
            refreshing: false,
            refreshError: false,
          });
        } catch (error) {
          if (cancelled) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setMarkerState((current) => current.status === "loaded"
            ? { ...current, refreshing: false, refreshError: true }
            : { status: "error" });
        }
      };

      void loadMarkers();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [viewport, markerRetryKey, datasetRevision]);

  const handleViewportChange = useCallback((nextViewport: CountryMapViewport) => {
    setViewport((current) => {
      if (current && countryMapViewportContains(current, nextViewport)) {
        return current;
      }
      return createBufferedCountryMapViewport(nextViewport);
    });
  }, []);

  const handleTileStatusChange = useCallback((status: MapTileStatus) => {
    setTileStatus(status);
  }, []);

  const retryTiles = useCallback(() => {
    setTileStatus("loading");
    setTileRetryKey((key) => key + 1);
  }, []);

  const clusterIconCreate = useCallback((cluster: { getChildCount: () => number }) => {
    const Leaf = leafletRef.current!;
    const count = cluster.getChildCount();
    const cls =
      count < 10 ? "marker-cluster-small" : count < 50 ? "marker-cluster-medium" : "marker-cluster-large";
    return Leaf.divIcon({
      html: `<div><span class="sr-only">Åbn gruppe med </span><span>${count}</span><span class="sr-only"> adresser</span></div>`,
      className: `marker-cluster ${cls}`,
      iconSize: Leaf.point(40, 40),
    });
  }, []);

  const center: [number, number] = [56.26, 9.5];

  if (markerState.status === "error") {
    return (
      <div
        className="relative flex min-h-[60vh] w-full flex-col items-center justify-center rounded-lg border border-white/10 bg-[var(--surface-elevated)] px-6 py-10 text-center md:min-h-[70vh]"
        role="alert"
      >
        <p className="text-gray-200">Kortdata kunne ikke indlæses lige nu.</p>
        <p className="mt-2 max-w-md text-sm text-gray-400">Prøv at genindlæse siden, eller gå til forsiden og søg adresse eller placering.</p>
        <div className="mt-6 flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={() => {
              setMarkerState({ status: "loading" });
              setMarkerRetryKey((key) => key + 1);
            }}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
          >
            Genindlæs siden
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15"
          >
            Til forsiden
          </Link>
          <Link
            href="/kommune"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Kommuneoversigt
          </Link>
        </div>
      </div>
    );
  }

  if (!shelterMarkerIcon) {
    return <MapLoadingSkeleton />;
  }

  const markersReady = markerState.status === "loaded" && (markerChunkReady || markerState.markerCount === 0);

  return (
    <div
      className="relative h-[60vh] min-h-[60vh] w-full overflow-hidden rounded-lg border border-white/10 md:h-[calc(100vh-12rem)] md:min-h-[70vh]"
      aria-label="Kort over BBR-registreringer af sikringsrumspladser i Danmark. Zoom og klik på klynger for at se enkeltsteder."
    >
      {!markersReady || (markerState.status === "loaded" && markerState.refreshing) ? (
        <div
          className="pointer-events-none absolute bottom-4 left-4 z-[5000] max-w-[min(100%,18rem)] rounded-lg border border-white/15 bg-[var(--surface-elevated)]/95 px-3 py-2 text-sm text-gray-100 shadow-lg"
          role="status"
          aria-live="polite"
        >
          Indlæser steder på kortet…
        </div>
      ) : null}
      {markerState.status === "loaded" && markerState.refreshError ? (
        <div
          className="absolute left-4 top-4 z-[700] max-w-[min(100%,22rem)] rounded-lg border border-amber-300/30 bg-[var(--surface-elevated)]/95 px-3 py-2 text-sm text-gray-100 shadow-lg"
          role="alert"
        >
          <p>Området kunne ikke opdateres. De senest hentede kortdata vises stadig.</p>
          <button
            type="button"
            className="mt-2 min-h-[44px] rounded-lg bg-white/10 px-3 py-2 font-semibold text-white hover:bg-white/15"
            onClick={() => setMarkerRetryKey((key) => key + 1)}
          >
            Prøv igen
          </button>
        </div>
      ) : markerState.status === "loaded" && markerState.truncated ? (
        <div
          className="pointer-events-none absolute left-4 top-4 z-[700] max-w-[min(100%,22rem)] rounded-lg border border-white/15 bg-[var(--surface-elevated)]/95 px-3 py-2 text-sm text-gray-100 shadow-lg"
          role="status"
          aria-live="polite"
        >
          Området indeholder {markerState.availableCount.toLocaleString("da-DK")} registreringer. Zoom ind for at se alle adresser.
        </div>
      ) : null}
      <MapContainer
        center={center}
        zoom={7}
        minZoom={6}
        maxZoom={18}
        maxBounds={denmarkMaxBounds}
        maxBoundsViscosity={1}
        style={{ width: "100%", height: "100%" }}
        className="leaflet-container z-0"
      >
        <ResilientMapTileLayer key={tileRetryKey} onStatusChange={handleTileStatusChange} />
        <MapViewportEvents onViewportChange={handleViewportChange} />
        <ServerClusterLayer clusters={serverClusters} />

        <MarkerClusterGroup
          ref={(instance) => {
            clusterRef.current = instance as MarkerClusterLike | null;
            setClusterReady(Boolean(instance));
          }}
          chunkedLoading
          chunkInterval={200}
          chunkDelay={50}
          animateAddingMarkers={false}
          maxClusterRadius={72}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          zoomToBoundsOnClick
          iconCreateFunction={clusterIconCreate}
        >
          {null}
        </MarkerClusterGroup>
      </MapContainer>
      {tileStatus === "error" ? (
        <MapUnavailableNotice
          onRetry={retryTiles}
          fallbackLabel="Brug kommuneoversigten"
          fallbackHref="/kommune"
        />
      ) : null}
    </div>
  );
}
