export type CountryMapShelterMarker = {
  slug: string;
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  capacity: number;
  sourceApplicationCode?: string | null;
  latitude: number;
  longitude: number;
};

export type CountryMapMarkerFeature = CountryMapShelterMarker & {
  kind: "marker";
};

export type CountryMapClusterFeature = {
  kind: "cluster";
  id: string;
  latitude: number;
  longitude: number;
  north: number;
  south: number;
  east: number;
  west: number;
  count: number;
  capacity: number;
};

export type CountryMapFeature = CountryMapMarkerFeature | CountryMapClusterFeature;

export type CountryMapViewport = {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
};

export type CountryShelterMarkersResponse = {
  shelters: CountryMapShelterMarker[];
  generatedAt: string;
  count: number;
  availableCount: number;
  truncated: boolean;
  viewport?: CountryMapViewport;
};

export type CountryMapFeaturesResponse = {
  contract: "country-map-features-v1";
  features: CountryMapFeature[];
  generatedAt: string;
  mode: "clusters" | "markers";
  availableCount: number;
  featureCount: number;
  markerCount: number;
  clusterCount: number;
  clusteredRegistrationCount: number;
  truncated: boolean;
  viewport: CountryMapViewport;
};
