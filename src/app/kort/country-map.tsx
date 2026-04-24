"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import type { CountryMapShelterMarker, CountryShelterMarkersResponse } from "@/types/country-map";

const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });
const MarkerClusterGroup = dynamic(
  () => import("@/components/MarkerClusterGroup").then((mod) => mod.default),
  { ssr: false },
);

function makeShelterIcon(L: typeof import("leaflet")) {
  const size = 26;
  const border = 3;
  const color = "#F97316";
  const shadow = "0 3px 8px rgba(0,0,0,0.4)";
  return L.divIcon({
    className: "shelter-marker",
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:${border}px solid white;border-radius:50%;box-shadow:${shadow};"></div>`,
    iconSize: [size + 8, size + 8],
    iconAnchor: [(size + 8) / 2, (size + 8) / 2],
    popupAnchor: [0, -((size + 8) / 2)],
  });
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPopupHtml(shelter: CountryMapShelterMarker) {
  const postalLine = [shelter.postalCode, shelter.city].filter(Boolean).join(" ").trim();
  const hasAddress = Boolean(shelter.addressLine1) || Boolean(postalLine);
  const cap = shelter.capacity.toLocaleString("da-DK");
  const slugSeg = encodeURIComponent(shelter.slug);

  const addressBlock = hasAddress
    ? `<div style="margin-top:4px;font-size:0.875rem;color:#4b5563;line-height:1.35;">
        ${shelter.addressLine1 ? `<p style="margin:0;">${escapeHtml(shelter.addressLine1)}</p>` : ""}
        ${postalLine ? `<p style="margin:0;">${escapeHtml(postalLine)}</p>` : ""}
      </div>`
    : "";

  return `<div style="min-width:220px;padding:4px;font-family:system-ui,-apple-system,sans-serif;">
    <p style="margin:0;font-weight:600;color:#111827;">${escapeHtml(shelter.name)}</p>
    ${addressBlock}
    <p style="margin:8px 0 0;font-size:0.875rem;font-weight:500;color:#ea580c;">${escapeHtml(cap)} pladser</p>
    <a href="/beskyttelsesrum/${slugSeg}" style="margin-top:8px;display:block;font-size:0.75rem;color:#2563eb;text-decoration:underline;">Se detaljer →</a>
  </div>`;
}

function MapLoadingSkeleton() {
  return (
    <div
      className="relative h-[60vh] min-h-[60vh] w-full overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] md:h-[calc(100vh-12rem)] md:min-h-[70vh]"
      role="status"
      aria-live="polite"
      aria-label="Indlæser kort over beskyttelsesrum"
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

const denmarkMaxBounds: [[number, number], [number, number]] = [
  [54, 8],
  [58, 15],
];

type MarkerClusterLike = {
  clearLayers(): void;
  addLayers(layers: import("leaflet").Layer[]): void;
};

type MarkerLoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; shelters: CountryMapShelterMarker[]; generatedAt: string; count: number };

export default function CountryMap() {
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const [shelterMarkerIcon, setShelterMarkerIcon] = useState<import("leaflet").DivIcon | null>(null);
  const clusterRef = useRef<MarkerClusterLike | null>(null);
  const [clusterReady, setClusterReady] = useState(false);
  const [markerState, setMarkerState] = useState<MarkerLoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((leaflet) => {
      if (cancelled) return;
      const L = leaflet.default;
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "/leaflet/marker-icon.png",
        iconRetinaUrl: "/leaflet/marker-icon-2x.png",
        shadowUrl: "/leaflet/marker-shadow.png",
      });
      leafletRef.current = L;
      setShelterMarkerIcon(makeShelterIcon(L));
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

    const BATCH = 1200;
    let cancelled = false;
    let rafId: number | null = null;

    cg.clearLayers();

    const shelters = markerState.shelters;
    const pump = (from: number) => {
      if (cancelled) return;
      const slice = shelters.slice(from, from + BATCH);
      if (slice.length === 0) return;
      const layers: import("leaflet").Marker[] = [];
      for (const s of slice) {
        const marker = L.marker([s.latitude, s.longitude], { icon });
        marker.bindPopup(buildPopupHtml(s), { maxWidth: 320 });
        marker.on("click", () => {
          marker.openPopup();
        });
        layers.push(marker);
      }
      cg.addLayers(layers);
      const next = from + BATCH;
      if (next < shelters.length) {
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          pump(next);
        });
      }
    };

    if (shelters.length > 0) {
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        pump(0);
      });
    }

    return () => {
      cancelled = true;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      cg.clearLayers();
    };
  }, [markerState, shelterMarkerIcon, clusterReady]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadMarkers = async () => {
      try {
        setMarkerState({ status: "loading" });
        const response = await fetch("/api/country-shelters", {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error(`Marker endpoint failed with ${response.status}`);
        }

        const payload = (await response.json()) as CountryShelterMarkersResponse;

        if (cancelled) return;
        setMarkerState({
          status: "loaded",
          shelters: payload.shelters,
          generatedAt: payload.generatedAt,
          count: payload.count,
        });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMarkerState({ status: "error" });
      }
    };

    void loadMarkers();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const clusterIconCreate = useCallback((cluster: { getChildCount: () => number }) => {
    const Leaf = leafletRef.current!;
    const count = cluster.getChildCount();
    const cls =
      count < 10 ? "marker-cluster-small" : count < 50 ? "marker-cluster-medium" : "marker-cluster-large";
    return Leaf.divIcon({
      html: `<div><span>${count}</span></div>`,
      className: `marker-cluster ${cls}`,
      iconSize: Leaf.point(40, 40),
    });
  }, []);

  const center: [number, number] = [56.26, 9.5];

  if (!shelterMarkerIcon || markerState.status === "loading") {
    return <MapLoadingSkeleton />;
  }

  if (markerState.status === "error") {
    return (
      <div
        className="relative h-[60vh] min-h-[60vh] w-full overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] md:h-[calc(100vh-12rem)] md:min-h-[70vh]"
        role="alert"
      >
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="text-sm text-gray-300">Kortdata kunne ikke indlæses. Prøv igen om lidt.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-[60vh] min-h-[60vh] w-full overflow-hidden rounded-lg border border-white/10 md:h-[calc(100vh-12rem)] md:min-h-[70vh]"
      aria-label="Kort over registrerede beskyttelsesrum i Danmark"
    >
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
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

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
    </div>
  );
}
