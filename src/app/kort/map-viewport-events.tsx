"use client";

import { useEffect } from "react";
import type { LeafletEvent, Map as LeafletMap } from "leaflet";
import { useMapEvents } from "react-leaflet";
import type { CountryMapViewport } from "@/types/country-map";

type Props = {
  onViewportChange: (viewport: CountryMapViewport) => void;
};

function readViewport(map: LeafletMap): CountryMapViewport {
  const bounds = map.getBounds();
  const round = (value: number) => Number(value.toFixed(4));

  return {
    north: round(bounds.getNorth()),
    south: round(bounds.getSouth()),
    east: round(bounds.getEast()),
    west: round(bounds.getWest()),
    zoom: Math.round(map.getZoom()),
  };
}

export default function MapViewportEvents({ onViewportChange }: Props) {
  const report = (event: LeafletEvent) => {
    onViewportChange(readViewport(event.target as LeafletMap));
  };
  const map = useMapEvents({ moveend: report, zoomend: report });

  useEffect(() => {
    onViewportChange(readViewport(map));
  }, [map, onViewportChange]);

  return null;
}
