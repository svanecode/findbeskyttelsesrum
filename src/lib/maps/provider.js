// Zero-cost browser tiles. Keep this swappable and follow OSMF's tile policy:
// visible attribution, normal browser caching, and no bulk/offline prefetching.
export const osmTileOrigin = "https://tile.openstreetmap.org";
export const osmTileUrl = `${osmTileOrigin}/{z}/{x}/{y}.png`;
export const osmTileAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const osmTileMaxZoom = 18;
