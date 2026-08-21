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

export type CountryShelterMarkersResponse = {
  shelters: CountryMapShelterMarker[];
  generatedAt: string;
  count: number;
  availableCount: number;
  truncated: boolean;
  viewport?: {
    north: number;
    south: number;
    east: number;
    west: number;
    zoom: number;
  };
};
