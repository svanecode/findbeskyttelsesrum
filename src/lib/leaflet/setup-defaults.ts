import L from "leaflet";

/** Configure default marker icon URLs (Leaflet + local assets under /public/leaflet). */
export function setupLeafletDefaults(Leaf: typeof L) {
  delete (Leaf.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  Leaf.Icon.Default.mergeOptions({
    iconUrl: "/leaflet/marker-icon.png",
    iconRetinaUrl: "/leaflet/marker-icon-2x.png",
    shadowUrl: "/leaflet/marker-shadow.png",
  });
}
