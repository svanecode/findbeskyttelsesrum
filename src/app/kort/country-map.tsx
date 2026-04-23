"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import type { AppV2CountryShelter } from "@/lib/supabase/app-v2-queries";

const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(() => import("react-leaflet").then((mod) => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((mod) => mod.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), { ssr: false });
const MarkerClusterGroup = dynamic(
  () => import("@/components/MarkerClusterGroup").then((mod) => mod.default),
  { ssr: false },
);

interface Props {
  shelters: AppV2CountryShelter[];
}

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

function MapLoadingSkeleton() {
  return (
    <div className="relative h-[60vh] min-h-[60vh] w-full overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] md:h-[calc(100vh-12rem)] md:min-h-[70vh]">
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

export default function CountryMap({ shelters }: Props) {
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const [shelterMarkerIcon, setShelterMarkerIcon] = useState<import("leaflet").DivIcon | null>(null);

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

  const center: [number, number] = [56.26, 9.5];

  if (!shelterMarkerIcon) {
    return <MapLoadingSkeleton />;
  }

  return (
    <div className="h-[60vh] min-h-[60vh] w-full overflow-hidden rounded-lg border border-white/10 md:h-[calc(100vh-12rem)] md:min-h-[70vh]">
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
          chunkedLoading
          chunkInterval={200}
          chunkDelay={50}
          animateAddingMarkers={false}
          maxClusterRadius={72}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          zoomToBoundsOnClick
          iconCreateFunction={(cluster: { getChildCount: () => number }) => {
            const L = leafletRef.current!;
            const count = cluster.getChildCount();
            const cls =
              count < 10 ? "marker-cluster-small" : count < 50 ? "marker-cluster-medium" : "marker-cluster-large";
            return L.divIcon({
              html: `<div><span>${count}</span></div>`,
              className: `marker-cluster ${cls}`,
              iconSize: L.point(40, 40),
            });
          }}
        >
          {shelters.map((shelter) => {
            const postalLine = [shelter.postalCode, shelter.city].filter(Boolean).join(" ").trim();
            const hasAddress = Boolean(shelter.addressLine1) || Boolean(postalLine);

            return (
              <Marker key={shelter.id} position={[shelter.latitude, shelter.longitude]} icon={shelterMarkerIcon}>
                <Popup>
                  <div className="min-w-[220px] p-1">
                    <p className="font-semibold text-gray-900">{shelter.name}</p>
                    {hasAddress ? (
                      <div className="mt-1 text-sm text-gray-600">
                        {shelter.addressLine1 ? <p>{shelter.addressLine1}</p> : null}
                        {postalLine ? <p>{postalLine}</p> : null}
                      </div>
                    ) : null}
                    <p className="mt-2 text-sm font-medium text-orange-600">
                      {shelter.capacity.toLocaleString("da-DK")} pladser
                    </p>
                    <a
                      href={`/beskyttelsesrum/${shelter.slug}`}
                      className="mt-2 block text-xs text-blue-600 hover:underline"
                    >
                      Se detaljer →
                    </a>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
