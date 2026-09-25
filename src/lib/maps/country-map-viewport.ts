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

// Values already on the grid must stay put despite floating-point division.
const gridTolerance = 1e-9;

function floorToStep(value: number, step: number) {
  return Number((Math.floor(value / step + gridTolerance) * step).toFixed(6));
}

function ceilToStep(value: number, step: number) {
  return Number((Math.ceil(value / step - gridTolerance) * step).toFixed(6));
}

/** Canonical server cache boundary for a validated viewport. */
export function quantizeCountryMapViewport(viewport: CountryMapViewport): CountryMapViewport {
  const zoom = Math.round(viewport.zoom);
  const step = coordinateStepForZoom(zoom);

  return {
    north: clamp(ceilToStep(viewport.north, step), latitudeRange.min, latitudeRange.max),
    south: clamp(floorToStep(viewport.south, step), latitudeRange.min, latitudeRange.max),
    east: clamp(ceilToStep(viewport.east, step), longitudeRange.min, longitudeRange.max),
    west: clamp(floorToStep(viewport.west, step), longitudeRange.min, longitudeRange.max),
    zoom,
  };
}

function roundToStepMultiple(value: number, step: number) {
  return Number((Math.max(1, Math.round(value / step)) * step).toFixed(6));
}

/**
 * Fixed request grid per zoom level. A cell is about two 256-px map tiles
 * wide; in latitude it is shorter because a degree of longitude is ~0.6 of a
 * degree of latitude at Danish latitudes. Cell sizes are whole multiples of
 * the server step, so the server's quantization leaves grid bounds unchanged.
 */
export function countryMapGridCell(zoom: number) {
  const step = coordinateStepForZoom(zoom);
  const tileWidthDegrees = 360 / 2 ** zoom;
  const longitude = roundToStepMultiple(tileWidthDegrees * 2, step);
  const latitude = roundToStepMultiple(longitude * 0.6, step);
  return { latitude, longitude };
}

/**
 * The area the browser requests for a visible viewport: a 20 % margin for
 * small pans, snapped outward to the zoom level's fixed grid so visitors
 * looking at the same area send identical, CDN-cacheable URLs.
 */
export function createBufferedCountryMapViewport(viewport: CountryMapViewport): CountryMapViewport {
  const zoom = Math.round(viewport.zoom);
  const cell = countryMapGridCell(zoom);
  const latitudePadding = (viewport.north - viewport.south) * 0.2;
  const longitudePadding = (viewport.east - viewport.west) * 0.2;

  return quantizeCountryMapViewport({
    north: clamp(ceilToStep(viewport.north + latitudePadding, cell.latitude), latitudeRange.min, latitudeRange.max),
    south: clamp(floorToStep(viewport.south - latitudePadding, cell.latitude), latitudeRange.min, latitudeRange.max),
    east: clamp(ceilToStep(viewport.east + longitudePadding, cell.longitude), longitudeRange.min, longitudeRange.max),
    west: clamp(floorToStep(viewport.west - longitudePadding, cell.longitude), longitudeRange.min, longitudeRange.max),
    zoom,
  });
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
