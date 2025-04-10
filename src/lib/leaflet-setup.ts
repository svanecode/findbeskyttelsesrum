import L from 'leaflet';

export function initializeLeaflet() {
  // Delete the default icon URLs
  delete (L.Icon.Default.prototype as any)._getIconUrl;

  // Set default icon options
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/leaflet/images/marker-icon-2x.png',
    iconUrl: '/leaflet/images/marker-icon.png',
    shadowUrl: '/leaflet/images/marker-shadow.png',
  });
}

export const createCustomIcon = (color: string) => new L.Icon({
  iconUrl: `/leaflet/images/marker-icon-2x-${color}.png`,
  shadowUrl: '/leaflet/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
}); 