/**
 * Public read queries for the app_v2 schema, split by domain in
 * src/lib/supabase/queries/. This barrel keeps existing imports working.
 */
export type { AppV2ShelterStatus, AppV2ImportState, AppV2NearbyEligibilityMode, AppV2MunicipalitySummary, AppV2MunicipalityDetail, AppV2ShelterDetail, AppV2PublicShelterDetail, AppV2ImportRunSummary } from "./queries/shared";
export { getAppV2CurrentDatasetPublication, getAppV2PublicDataRevision, getLatestAppV2ImportRun, getLatestSuccessfulAppV2ImportRun } from "./queries/publication";
export type { AppV2CurrentDatasetPublication, AppV2PublicDataRevision } from "./queries/publication";
export { getAppV2ShelterCount, getAppV2PublicDataStats, getAppV2PublicDataFunnel, getAppV2TotalShelterCapacity } from "./queries/stats";
export type { AppV2PublicDataStats, AppV2PublicDataFunnel } from "./queries/stats";
export { getAppV2GroupedNearbySheltersWithDiagnostics, getAppV2PublicNearbyTile } from "./queries/nearby";
export type { AppV2NearbyShelter, AppV2GroupedNearbyShelter, AppV2NearbyDiagnostics, AppV2NearbySheltersResult, AppV2GroupedNearbySheltersResult, AppV2NearbySheltersOptions } from "./queries/nearby";
export { getAppV2MunicipalitySummaries, getAppV2MunicipalitySlugs, getAppV2PublicMunicipalitySummaryCount, getAppV2MunicipalityBySlug, getAppV2PublicMunicipalityShelters, groupMunicipalityShelters } from "./queries/municipalities";
export type { AppV2MunicipalityShelter, AppV2MunicipalityShelterGroup } from "./queries/municipalities";
export { getAppV2PublicCountryMapFeatures, getAppV2CountryShelterMarkers, getAppV2PublicCountryShelterMarkers, getAppV2PublicCountryShelterMarkersInBounds } from "./queries/country-map";
export type { AppV2CountryShelterMarker, AppV2CountryMapCluster, AppV2CountryMapMarkerFeature, AppV2CountryMapFeature, AppV2CountryMapFeatureResult, AppV2CountryShelterMarkerBounds, AppV2CountryMapFeatureRequest } from "./queries/country-map";
export { getAppV2PublicSitemapShelters, getAppV2ShelterBySlug, getAppV2PublicShelterBySlug, resolveAppV2PublicShelter, getAppV2PublicRelatedShelters } from "./queries/shelters";
export type { AppV2RelatedShelter, AppV2SitemapShelterRow } from "./queries/shelters";
