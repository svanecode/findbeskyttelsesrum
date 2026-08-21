import type { CountryMapViewport } from "@/types/country-map";

const latitudeRange = { min: -90, max: 90 } as const;
const longitudeRange = { min: -180, max: 180 } as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function coordinateStepForZoom(zoom: number) {
  if (zoom <= 7) return 0.2;
  if (zoom === 8) return 0.1;
  if (zoom === 9) return 0.05;
  if (zoom <= 11) return 0.02;
  if (zoom <= 13) return 0.01;
  return 0.005;
}

function floorToStep(value: number, step: number) {
  return Number((Math.floor(value / step) * step).toFixed(6));
}

function ceilToStep(value: number, step: number) {
  return Number((Math.ceil(value / step) * step).toFixed(6));
}

export function createBufferedCountryMapViewport(viewport: CountryMapViewport): CountryMapViewport {
  const zoom = Math.round(viewport.zoom);
  const step = coordinateStepForZoom(zoom);
  const latitudePadding = Math.max((viewport.north - viewport.south) * 0.2, step);
  const longitudePadding = Math.max((viewport.east - viewport.west) * 0.2, step);

  return {
    north: clamp(ceilToStep(viewport.north + latitudePadding, step), latitudeRange.min, latitudeRange.max),
    south: clamp(floorToStep(viewport.south - latitudePadding, step), latitudeRange.min, latitudeRange.max),
    east: clamp(ceilToStep(viewport.east + longitudePadding, step), longitudeRange.min, longitudeRange.max),
    west: clamp(floorToStep(viewport.west - longitudePadding, step), longitudeRange.min, longitudeRange.max),
    zoom,
  };
}

export function countryMapViewportContains(
  requested: CountryMapViewport,
  visible: CountryMapViewport,
) {
  return requested.zoom === Math.round(visible.zoom)
    && requested.north >= visible.north
    && requested.south <= visible.south
    && requested.east >= visible.east
    && requested.west <= visible.west;
}
