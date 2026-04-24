export type CountryMapShelterMarker = {
  slug: string;
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  capacity: number;
  latitude: number;
  longitude: number;
};

export type CountryShelterMarkersResponse = {
  shelters: CountryMapShelterMarker[];
  generatedAt: string;
  count: number;
};
