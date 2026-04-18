import proj4 from "proj4";

import type { OfficialSourceAdapter } from "@/lib/importer/source-adapter";
import type { ImporterSnapshot } from "@/lib/importer/source-adapter";
import type {
  ImportedShelterRecord,
  ImporterFetchResult,
  ImporterWarning,
} from "@/lib/importer/types";
import { DatafordelerGraphqlClient } from "@/lib/importer/clients/datafordeler";
import {
  getMunicipalityMetadataByCode,
  type MunicipalityMetadata,
} from "@/lib/municipalities/metadata";

type BbrBuildingNode = {
  id_lokalId: string;
  kommunekode: string;
  status: string | null;
  husnummer: string | null;
  byg007Bygningsnummer: string | null;
  byg021BygningensAnvendelse: string | null;
  byg069Sikringsrumpladser: number | string | null;
  byg404Koordinat?: {
    wkt?: string | null;
  } | null;
};

type DarHouseNumberNode = {
  id_lokalId: string;
  status: string | null;
  navngivenVej?: string | null;
  husnummertekst?: string | null;
  postnummer?: string | null;
};

type DarNamedRoadNode = {
  id_lokalId: string;
  vejnavn?: string | null;
};

type DarPostalCodeNode = {
  id_lokalId: string;
  postnr?: string | null;
  navn?: string | null;
};

type Connection<TNode> = {
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
  edges: Array<{
    node: TNode;
  }>;
};

type BbrBuildingsResponse = {
  BBR_Bygning: Connection<BbrBuildingNode>;
};

type DarHouseNumbersResponse = {
  DAR_Husnummer: Connection<DarHouseNumberNode>;
};

type DarNamedRoadsResponse = {
  DAR_NavngivenVej: Connection<DarNamedRoadNode>;
};

type DarPostalCodesResponse = {
  DAR_Postnummer: Connection<DarPostalCodeNode>;
};

type DatafordelerAdapterConfig = {
  apiKey: string;
  bbrGraphqlUrl: string;
  darGraphqlUrl: string;
  municipalityCodes: string[];
  municipalityOverrides: Record<string, MunicipalityMetadata>;
  shelterUsageCodes: Set<string>;
  acceptedDarStatuses: Set<string>;
  pageSize: number;
  requestTimeoutMs: number;
  bitemporalTimestamp: string;
};

type AdapterCounters = {
  acceptedAfterCapacityFilter: number;
  skippedRecords: number;
  missingOrNonPositiveCapacityCount: number;
  missingAddressCount: number;
  missingMunicipalityCount: number;
  acceptedWithCoordinatesCount: number;
  acceptedWithoutCoordinatesCount: number;
  missingCoordinatesCount: number;
  coordinateParseFailureCount: number;
  darFailedBatchCount: number;
  acceptedRecordsSkippedDueToDarFailure: number;
  skipReasonCounts: Map<string, number>;
};

type DarLookupMaps = {
  houseNumbers: Map<string, DarHouseNumberNode>;
  namedRoads: Map<string, DarNamedRoadNode>;
  postalCodes: Map<string, DarPostalCodeNode>;
  failedHouseNumberIds: Set<string>;
  failedNamedRoadIds: Set<string>;
  failedPostalCodeIds: Set<string>;
};

const CANONICAL_SOURCE_NAME = "datafordeler-bbr-dar";
const BBR_DOCS_URL = "https://datafordeler.dk/dataoversigt/bygnings-og-boligregistret-bbr/bbr-graphql/";
const ETRS89_UTM32 = "EPSG:25832";
const WGS84 = "EPSG:4326";
const safeDarBatchSize = 100;

proj4.defs(
  ETRS89_UTM32,
  "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs",
);

const BBR_ACTIVE_STATUS = "6";

function buildFetchBbrBuildingsQuery(options: {
  hasMunicipalityFilter: boolean;
  hasUsageCodeFilter: boolean;
}) {
  const variableDefinitions = [
    "$first: Int!",
    "$after: String",
    "$registreringstid: DafDateTime",
    "$virkningstid: DafDateTime",
  ];

  if (options.hasMunicipalityFilter) {
    variableDefinitions.push("$municipalityCodes: [String!]");
  }

  if (options.hasUsageCodeFilter) {
    variableDefinitions.push("$usageCodes: [String!]");
  }

  const whereParts = [`status: { eq: "${BBR_ACTIVE_STATUS}" }`];

  if (options.hasMunicipalityFilter) {
    whereParts.push("kommunekode: { in: $municipalityCodes }");
  }

  if (options.hasUsageCodeFilter) {
    whereParts.push("byg021BygningensAnvendelse: { in: $usageCodes }");
  }

  return `
    query FetchBbrBuildings(
      ${variableDefinitions.join("\n      ")}
    ) {
      BBR_Bygning(
        first: $first
        after: $after
        registreringstid: $registreringstid
        virkningstid: $virkningstid
        where: {
          ${whereParts.join("\n          ")}
        }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id_lokalId
            kommunekode
            status
            husnummer
            byg007Bygningsnummer
            byg021BygningensAnvendelse
            byg069Sikringsrumpladser
            byg404Koordinat {
              wkt
            }
          }
        }
      }
    }
  `;
}

const fetchDarHouseNumbersQuery = `
  query FetchDarHouseNumbers(
    $first: Int!
    $houseNumberIds: [String!]
    $registreringstid: DafDateTime
    $virkningstid: DafDateTime
  ) {
    DAR_Husnummer(
      first: $first
      registreringstid: $registreringstid
      virkningstid: $virkningstid
      where: {
        id_lokalId: { in: $houseNumberIds }
      }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id_lokalId
          status
          husnummertekst
          navngivenVej
          postnummer
        }
      }
    }
  }
`;

const fetchDarNamedRoadsQuery = `
  query FetchDarNamedRoads(
    $first: Int!
    $roadIds: [String!]
    $registreringstid: DafDateTime
    $virkningstid: DafDateTime
  ) {
    DAR_NavngivenVej(
      first: $first
      registreringstid: $registreringstid
      virkningstid: $virkningstid
      where: {
        id_lokalId: { in: $roadIds }
      }
    ) {
      edges {
        node {
          id_lokalId
          vejnavn
        }
      }
    }
  }
`;

const fetchDarPostalCodesQuery = `
  query FetchDarPostalCodes(
    $first: Int!
    $postalCodeIds: [String!]
    $registreringstid: DafDateTime
    $virkningstid: DafDateTime
  ) {
    DAR_Postnummer(
      first: $first
      registreringstid: $registreringstid
      virkningstid: $virkningstid
      where: {
        id_lokalId: { in: $postalCodeIds }
      }
    ) {
      edges {
        node {
          id_lokalId
          postnr
          navn
        }
      }
    }
  }
`;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

function getOptionalNumber(name: string, fallback: number) {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number.`);
  }

  return parsed;
}

function getOptionalCsvEnv(name: string) {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getDatafordelerShelterUsageCodes() {
  const next = process.env.DATAFORDELER_BBR_SHELTER_USAGE_CODES?.trim();

  if (next) {
    return next
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return getOptionalCsvEnv("DATAFORDELER_BBR_USAGE_CODES");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseMunicipalityOverrides(raw: string | undefined) {
  if (!raw?.trim()) {
    return {};
  }

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return Object.fromEntries(
    entries.map((entry) => {
      const [code, slug, name, regionName] = entry.split(":").map((part) => part.trim());

      if (!code || !slug || !name) {
        throw new Error(
          "DATAFORDELER_MUNICIPALITY_METADATA must use code:slug:name:region format for each entry.",
        );
      }

      return [
        code,
        {
          code,
          slug,
          name,
          regionName: regionName || null,
        } satisfies MunicipalityMetadata,
      ];
    }),
  ) as Record<string, MunicipalityMetadata>;
}

function buildShelterSlug(input: {
  municipalitySlug: string;
  addressLine1: string;
  canonicalSourceReference: string;
}) {
  const addressPart = slugify(input.addressLine1);
  const referencePart = slugify(input.canonicalSourceReference).slice(-12);

  return [input.municipalitySlug, addressPart || "shelter", referencePart].filter(Boolean).join("-");
}

function buildShelterName(addressLine1: string) {
  return `Shelter at ${addressLine1}`;
}

function buildSummary() {
  return "Imported from Datafordeler BBR and DAR. Shelter-specific capacity, accessibility, and readiness details are still being confirmed.";
}

function incrementSkipReason(counters: AdapterCounters, code: string) {
  counters.skipReasonCounts.set(code, (counters.skipReasonCounts.get(code) ?? 0) + 1);
}

function parsePositiveShelterCapacity(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(",", ".").trim());

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed > 0 ? Math.trunc(parsed) : 0;
}

function parseBbrCoordinateWkt(
  value: string | null | undefined,
): { latitude: number | null; longitude: number | null; isParseFailure: boolean } {
  if (!value) {
    return {
      latitude: null,
      longitude: null,
      isParseFailure: false,
    };
  }

  const match = value.match(/POINT\s*\(\s*([0-9.+-]+)\s+([0-9.+-]+)\s*\)/i);

  if (!match) {
    return {
      latitude: null,
      longitude: null,
      isParseFailure: true,
    };
  }

  const [, eastingRaw, northingRaw] = match;
  const easting = Number(eastingRaw);
  const northing = Number(northingRaw);

  if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
    return {
      latitude: null,
      longitude: null,
      isParseFailure: true,
    };
  }

  const [longitude, latitude] = proj4(ETRS89_UTM32, WGS84, [easting, northing]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      latitude: null,
      longitude: null,
      isParseFailure: true,
    };
  }

  return {
    latitude,
    longitude,
    isParseFailure: false,
  };
}

function chunkValues(values: string[], size: number) {
  const chunks: string[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function getConfig(): DatafordelerAdapterConfig {
  return {
    apiKey: getRequiredEnv("DATAFORDELER_API_KEY"),
    bbrGraphqlUrl:
      process.env.DATAFORDELER_BBR_GRAPHQL_URL?.trim() || "https://graphql.datafordeler.dk/BBR/v1",
    darGraphqlUrl:
      process.env.DATAFORDELER_DAR_GRAPHQL_URL?.trim() || "https://graphql.datafordeler.dk/DAR/v1",
    municipalityCodes: getOptionalCsvEnv("DATAFORDELER_MUNICIPALITY_CODES"),
    municipalityOverrides: {
      ...parseMunicipalityOverrides(process.env.DATAFORDELER_MUNICIPALITY_METADATA),
    },
    shelterUsageCodes: new Set(getDatafordelerShelterUsageCodes()),
    acceptedDarStatuses: new Set(
      getOptionalCsvEnv("DATAFORDELER_DAR_ACTIVE_STATUSES").length > 0
        ? getOptionalCsvEnv("DATAFORDELER_DAR_ACTIVE_STATUSES")
        : ["3"],
    ),
    pageSize: getOptionalNumber("DATAFORDELER_PAGE_SIZE", 200),
    requestTimeoutMs: getOptionalNumber("DATAFORDELER_REQUEST_TIMEOUT_MS", 30000),
    bitemporalTimestamp: process.env.DATAFORDELER_BITEMPORAL_TIMESTAMP?.trim() || new Date().toISOString(),
  };
}

export class DatafordelerOfficialSourceAdapter implements OfficialSourceAdapter {
  readonly sourceName = CANONICAL_SOURCE_NAME;
  readonly sourceUrl = BBR_DOCS_URL;
  private readonly config: DatafordelerAdapterConfig;
  private readonly bbrClient: DatafordelerGraphqlClient;
  private readonly darClient: DatafordelerGraphqlClient;

  constructor() {
    this.config = getConfig();
    this.bbrClient = new DatafordelerGraphqlClient({
      endpoint: this.config.bbrGraphqlUrl,
      apiKey: this.config.apiKey,
      requestTimeoutMs: this.config.requestTimeoutMs,
    });
    this.darClient = new DatafordelerGraphqlClient({
      endpoint: this.config.darGraphqlUrl,
      apiKey: this.config.apiKey,
      requestTimeoutMs: this.config.requestTimeoutMs,
    });
  }

  async fetchRecords(snapshot: ImporterSnapshot): Promise<ImporterFetchResult> {
    console.log(
      `[importer] datafordeler: starting nationwide BBR status-${BBR_ACTIVE_STATUS} fetch${this.config.municipalityCodes.length > 0 ? ` with municipality narrowing (${this.config.municipalityCodes.join(", ")})` : ""}${this.config.shelterUsageCodes.size > 0 ? ` and usage-code narrowing (${Array.from(this.config.shelterUsageCodes).join(", ")})` : ""}`,
    );

    const warnings: ImporterWarning[] = [];
    const warnedMunicipalityCodes = new Set<string>();
    const counters: AdapterCounters = {
      acceptedAfterCapacityFilter: 0,
      skippedRecords: 0,
      missingOrNonPositiveCapacityCount: 0,
      missingAddressCount: 0,
      missingMunicipalityCount: 0,
      acceptedWithCoordinatesCount: 0,
      acceptedWithoutCoordinatesCount: 0,
      missingCoordinatesCount: 0,
      coordinateParseFailureCount: 0,
      darFailedBatchCount: 0,
      acceptedRecordsSkippedDueToDarFailure: 0,
      skipReasonCounts: new Map(),
    };

    const buildings = await this.fetchAllBbrBuildings(warnings, snapshot);
    console.log(`[importer] datafordeler: fetched ${buildings.length} BBR building records`);

    const eligibleBuildings = buildings.filter((building) => this.isEligibleBuilding(building, counters));
    console.log(
      `[importer] datafordeler: ${eligibleBuildings.length} BBR records passed status and capacity filtering`,
    );

    const darLookupMaps = await this.fetchDarLookups(eligibleBuildings, warnings, counters);
    console.log(
      `[importer] datafordeler: fetched ${darLookupMaps.houseNumbers.size} DAR house-number rows, ${darLookupMaps.namedRoads.size} named roads, and ${darLookupMaps.postalCodes.size} postal codes`,
    );

    const records: ImportedShelterRecord[] = [];

    for (const building of eligibleBuildings) {
      const record = this.normalizeRecord(
        building,
        darLookupMaps,
        warnings,
        warnedMunicipalityCodes,
        counters,
      );

      if (!record) {
        counters.skippedRecords += 1;
        continue;
      }

      records.push(record);
    }

    if (counters.missingCoordinatesCount > 0) {
      warnings.push({
        level: "warning",
        code: "bbr_missing_coordinates",
        message: `${counters.missingCoordinatesCount} accepted records were normalized without usable BBR coordinates.`,
      });
    }

    console.log(
      `[importer] datafordeler: normalized ${records.length} shelter records, skipped ${counters.skippedRecords}`,
    );

    return {
      records,
      warnings,
      stats: {
        fetchedRecords: buildings.length,
        acceptedAfterCapacityFilter: counters.acceptedAfterCapacityFilter,
        normalizedRecords: records.length,
        skippedRecords: counters.skippedRecords,
        missingOrNonPositiveCapacityCount: counters.missingOrNonPositiveCapacityCount,
        missingAddressCount: counters.missingAddressCount,
        missingMunicipalityCount: counters.missingMunicipalityCount,
        acceptedWithCoordinatesCount: counters.acceptedWithCoordinatesCount,
        acceptedWithoutCoordinatesCount: counters.acceptedWithoutCoordinatesCount,
        missingCoordinatesCount: counters.missingCoordinatesCount,
        coordinateParseFailureCount: counters.coordinateParseFailureCount,
        darBatchSizeUsed: safeDarBatchSize,
        darFailedBatchCount: counters.darFailedBatchCount,
        acceptedRecordsSkippedDueToDarFailure: counters.acceptedRecordsSkippedDueToDarFailure,
        skipReasonCounts: Array.from(counters.skipReasonCounts.entries())
          .map(([code, count]) => ({ code, count }))
          .sort((left, right) => right.count - left.count),
      },
    };
  }

  private async fetchAllBbrBuildings(
    warnings: ImporterWarning[],
    snapshot: ImporterSnapshot,
  ) {
    const nodes: BbrBuildingNode[] = [];
    let after: string | null = snapshot.resumeCursor ?? null;
    let page = (snapshot.resumePage ?? 0) + 1;
    const hasMunicipalityFilter = this.config.municipalityCodes.length > 0;
    const hasUsageCodeFilter = this.config.shelterUsageCodes.size > 0;
    const query = buildFetchBbrBuildingsQuery({
      hasMunicipalityFilter,
      hasUsageCodeFilter,
    });

    while (true) {
      console.log(`[importer] datafordeler: fetching BBR page ${page}`);

      let payload: BbrBuildingsResponse;

      try {
        payload = await this.bbrClient.query<BbrBuildingsResponse, Record<string, unknown>>({
          operationName: "FetchBbrBuildings",
          query,
          variables: {
            first: this.config.pageSize,
            after,
            registreringstid: this.config.bitemporalTimestamp,
            virkningstid: this.config.bitemporalTimestamp,
            ...(hasMunicipalityFilter
              ? { municipalityCodes: this.config.municipalityCodes }
              : {}),
            ...(hasUsageCodeFilter
              ? { usageCodes: Array.from(this.config.shelterUsageCodes) }
              : {}),
          },
        });
      } catch (error) {
        throw new Error(
          `BBR fetch failed on page ${page}: ${error instanceof Error ? error.message : "Unknown error."}`,
        );
      }

      nodes.push(...payload.BBR_Bygning.edges.map((edge) => edge.node));
      const nextCursor = payload.BBR_Bygning.pageInfo.endCursor ?? null;

      await snapshot.onPageFetched?.({
        cursor: nextCursor,
        pagesFetched: page,
        fetchedRecords: nodes.length,
      });

      if (payload.BBR_Bygning.edges.length === 0) {
        warnings.push({
          level: "warning",
          code: "bbr_empty_page",
          message: `BBR returned an empty page ${page}.`,
        });
      }

      if (!payload.BBR_Bygning.pageInfo.hasNextPage || !payload.BBR_Bygning.pageInfo.endCursor) {
        break;
      }

      if (snapshot.maxPages && page >= snapshot.maxPages) {
        warnings.push({
          level: "warning",
          code: "bbr_max_pages_reached",
          message: `Stopped the validation run after ${snapshot.maxPages} BBR pages because --max-pages was set.`,
        });
        break;
      }

      after = nextCursor;
      page += 1;
    }

    return nodes;
  }

  private async fetchDarLookups(
    buildings: BbrBuildingNode[],
    warnings: ImporterWarning[],
    counters: AdapterCounters,
  ): Promise<DarLookupMaps> {
    const houseNumberIds = Array.from(
      new Set(buildings.map((building) => building.husnummer).filter((value): value is string => Boolean(value))),
    );

    if (houseNumberIds.length === 0) {
      return {
        houseNumbers: new Map(),
        namedRoads: new Map(),
        postalCodes: new Map(),
        failedHouseNumberIds: new Set(),
        failedNamedRoadIds: new Set(),
        failedPostalCodeIds: new Set(),
      };
    }

    console.log(
      `[importer] datafordeler: DAR relation-id queries use batchSize=${safeDarBatchSize} (Datafordeler in-limit safe cap)`,
    );

    const batches = chunkValues(houseNumberIds, safeDarBatchSize);
    const houseNumbers = new Map<string, DarHouseNumberNode>();
    const failedHouseNumberIds = new Set<string>();

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];

      console.log(
        `[importer] datafordeler: fetching DAR house-number batch ${batchIndex + 1}/${batches.length} (batchSize=${batch.length})`,
      );

      let payload: DarHouseNumbersResponse;

      try {
        payload = await this.darClient.query<DarHouseNumbersResponse, Record<string, unknown>>({
          operationName: "FetchDarHouseNumbers",
          query: fetchDarHouseNumbersQuery,
          variables: {
            first: batch.length,
            houseNumberIds: batch,
            registreringstid: this.config.bitemporalTimestamp,
            virkningstid: this.config.bitemporalTimestamp,
          },
        });
      } catch (error) {
        counters.darFailedBatchCount += 1;
        batch.forEach((id: string) => failedHouseNumberIds.add(id));
        warnings.push({
          level: "warning",
          code: "dar_house_number_batch_failed",
          message: `DAR house-number batch ${batchIndex + 1} failed at batch size ${batch.length} and was skipped: ${error instanceof Error ? error.message : "Unknown error."}`,
        });
        continue;
      }

      for (const edge of payload.DAR_Husnummer.edges) {
        houseNumbers.set(edge.node.id_lokalId, edge.node);
      }
    }

    const missingIds = houseNumberIds.filter((id) => !houseNumbers.has(id));

    if (missingIds.length > 0) {
      warnings.push({
        level: "warning",
        code: "dar_missing_house_numbers",
        message: `DAR did not return ${missingIds.length} referenced house-number rows.`,
      });
    }

    const houseNumberRows = Array.from(houseNumbers.values());
    const namedRoadIds = Array.from(
      new Set(houseNumberRows.map((houseNumber) => houseNumber.navngivenVej).filter((value): value is string => Boolean(value))),
    );
    const postalCodeIds = Array.from(
      new Set(houseNumberRows.map((houseNumber) => houseNumber.postnummer).filter((value): value is string => Boolean(value))),
    );

    const namedRoadLookup = await this.fetchDarNamedRoads(namedRoadIds, warnings, counters);
    const postalCodeLookup = await this.fetchDarPostalCodes(postalCodeIds, warnings, counters);

    return {
      houseNumbers,
      namedRoads: namedRoadLookup.records,
      postalCodes: postalCodeLookup.records,
      failedHouseNumberIds,
      failedNamedRoadIds: namedRoadLookup.failedIds,
      failedPostalCodeIds: postalCodeLookup.failedIds,
    };
  }

  private async fetchDarNamedRoads(
    roadIds: string[],
    warnings: ImporterWarning[],
    counters: AdapterCounters,
  ) {
    if (roadIds.length === 0) {
      return {
        records: new Map<string, DarNamedRoadNode>(),
        failedIds: new Set<string>(),
      };
    }

    const batches = chunkValues(roadIds, safeDarBatchSize);
    const namedRoads = new Map<string, DarNamedRoadNode>();
    const failedIds = new Set<string>();

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];

      console.log(
        `[importer] datafordeler: fetching DAR named-road batch ${batchIndex + 1}/${batches.length} (batchSize=${batch.length})`,
      );

      let payload: DarNamedRoadsResponse;

      try {
        payload = await this.darClient.query<DarNamedRoadsResponse, Record<string, unknown>>({
          operationName: "FetchDarNamedRoads",
          query: fetchDarNamedRoadsQuery,
          variables: {
            first: batch.length,
            roadIds: batch,
            registreringstid: this.config.bitemporalTimestamp,
            virkningstid: this.config.bitemporalTimestamp,
          },
        });
      } catch (error) {
        counters.darFailedBatchCount += 1;
        batch.forEach((id: string) => failedIds.add(id));
        warnings.push({
          level: "warning",
          code: "dar_named_road_batch_failed",
          message: `DAR named-road batch ${batchIndex + 1} failed at batch size ${batch.length} and was skipped: ${error instanceof Error ? error.message : "Unknown error."}`,
        });
        continue;
      }

      for (const edge of payload.DAR_NavngivenVej.edges) {
        namedRoads.set(edge.node.id_lokalId, edge.node);
      }
    }

    return {
      records: namedRoads,
      failedIds,
    };
  }

  private async fetchDarPostalCodes(
    postalCodeIds: string[],
    warnings: ImporterWarning[],
    counters: AdapterCounters,
  ) {
    if (postalCodeIds.length === 0) {
      return {
        records: new Map<string, DarPostalCodeNode>(),
        failedIds: new Set<string>(),
      };
    }

    const batches = chunkValues(postalCodeIds, safeDarBatchSize);
    const postalCodes = new Map<string, DarPostalCodeNode>();
    const failedIds = new Set<string>();

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];

      console.log(
        `[importer] datafordeler: fetching DAR postal-code batch ${batchIndex + 1}/${batches.length} (batchSize=${batch.length})`,
      );

      let payload: DarPostalCodesResponse;

      try {
        payload = await this.darClient.query<DarPostalCodesResponse, Record<string, unknown>>({
          operationName: "FetchDarPostalCodes",
          query: fetchDarPostalCodesQuery,
          variables: {
            first: batch.length,
            postalCodeIds: batch,
            registreringstid: this.config.bitemporalTimestamp,
            virkningstid: this.config.bitemporalTimestamp,
          },
        });
      } catch (error) {
        counters.darFailedBatchCount += 1;
        batch.forEach((id: string) => failedIds.add(id));
        warnings.push({
          level: "warning",
          code: "dar_postal_code_batch_failed",
          message: `DAR postal-code batch ${batchIndex + 1} failed at batch size ${batch.length} and was skipped: ${error instanceof Error ? error.message : "Unknown error."}`,
        });
        continue;
      }

      for (const edge of payload.DAR_Postnummer.edges) {
        postalCodes.set(edge.node.id_lokalId, edge.node);
      }
    }

    return {
      records: postalCodes,
      failedIds,
    };
  }

  private isEligibleBuilding(
    building: BbrBuildingNode,
    counters: AdapterCounters,
  ) {
    if (building.status !== BBR_ACTIVE_STATUS) {
      counters.skippedRecords += 1;
      incrementSkipReason(counters, "bbr_ineligible_status");
      return false;
    }

    const shelterCapacity = parsePositiveShelterCapacity(building.byg069Sikringsrumpladser);

    if (shelterCapacity === null || shelterCapacity <= 0) {
      counters.missingOrNonPositiveCapacityCount += 1;
      counters.skippedRecords += 1;
      incrementSkipReason(counters, "bbr_missing_or_non_positive_capacity");
      return false;
    }

    if (
      this.config.municipalityCodes.length > 0 &&
      !this.config.municipalityCodes.includes(building.kommunekode)
    ) {
      counters.skippedRecords += 1;
      incrementSkipReason(counters, "bbr_excluded_municipality_filter");
      return false;
    }

    if (
      this.config.shelterUsageCodes.size > 0 &&
      (!building.byg021BygningensAnvendelse ||
        !this.config.shelterUsageCodes.has(building.byg021BygningensAnvendelse))
    ) {
      counters.skippedRecords += 1;
      incrementSkipReason(counters, "bbr_excluded_usage_filter");
      return false;
    }

    if (!building.husnummer) {
      counters.missingAddressCount += 1;
      counters.skippedRecords += 1;
      incrementSkipReason(counters, "bbr_missing_house_number");
      return false;
    }

    counters.acceptedAfterCapacityFilter += 1;

    return true;
  }

  private normalizeRecord(
    building: BbrBuildingNode,
    darLookupMaps: DarLookupMaps,
    warnings: ImporterWarning[],
    warnedMunicipalityCodes: Set<string>,
    counters: AdapterCounters,
  ): ImportedShelterRecord | null {
    const municipality = this.getMunicipalityMetadata(
      building.kommunekode,
      warnings,
      warnedMunicipalityCodes,
    );

    if (!municipality) {
      counters.missingMunicipalityCount += 1;
      return null;
    }

    const houseNumber = darLookupMaps.houseNumbers.get(building.husnummer ?? "");

    if (!houseNumber) {
      const skippedDueToDarFailure =
        !!building.husnummer && darLookupMaps.failedHouseNumberIds.has(building.husnummer);

      if (skippedDueToDarFailure) {
        counters.acceptedRecordsSkippedDueToDarFailure += 1;
        incrementSkipReason(counters, "dar_house_number_lookup_failed");
      }

      warnings.push({
        level: "warning",
        code: skippedDueToDarFailure ? "dar_house_number_lookup_failed" : "dar_house_number_not_found",
        message: skippedDueToDarFailure
          ? "Skipped building because the referenced DAR house-number batch failed."
          : "Skipped building because the referenced DAR house-number row was not returned.",
        reference: building.id_lokalId,
      });
      counters.missingAddressCount += 1;
      return null;
    }

    if (!houseNumber.status || !this.config.acceptedDarStatuses.has(houseNumber.status)) {
      warnings.push({
        level: "warning",
        code: "dar_ineligible_status",
        message: `Skipped building because DAR house-number status ${houseNumber.status ?? "unknown"} is not active.`,
        reference: building.id_lokalId,
      });
      counters.missingAddressCount += 1;
      return null;
    }

    const namedRoad = houseNumber.navngivenVej
      ? darLookupMaps.namedRoads.get(houseNumber.navngivenVej)
      : undefined;
    const postalCodeRecord = houseNumber.postnummer
      ? darLookupMaps.postalCodes.get(houseNumber.postnummer)
      : undefined;
    const roadName = namedRoad?.vejnavn?.trim() ?? "";
    const houseNumberText = houseNumber.husnummertekst?.trim() ?? "";
    const postalCode = postalCodeRecord?.postnr?.trim() ?? "";
    const city = postalCodeRecord?.navn?.trim() ?? "";

    if (!roadName || !houseNumberText || !postalCode || !city) {
      const skippedDueToDarFailure =
        (!!houseNumber.navngivenVej && darLookupMaps.failedNamedRoadIds.has(houseNumber.navngivenVej)) ||
        (!!houseNumber.postnummer && darLookupMaps.failedPostalCodeIds.has(houseNumber.postnummer));

      if (skippedDueToDarFailure) {
        counters.acceptedRecordsSkippedDueToDarFailure += 1;
        incrementSkipReason(counters, "dar_related_lookup_failed");
      }

      warnings.push({
        level: "warning",
        code: skippedDueToDarFailure ? "dar_related_lookup_failed" : "dar_incomplete_address",
        message: skippedDueToDarFailure
          ? "Skipped building because a DAR related lookup batch failed."
          : "Skipped building because DAR address data was incomplete.",
        reference: building.id_lokalId,
      });
      counters.missingAddressCount += 1;
      return null;
    }

    const addressLine1 = `${roadName} ${houseNumberText}`.trim();
    const canonicalSourceReference = building.id_lokalId;
    const shelterCapacity = parsePositiveShelterCapacity(building.byg069Sikringsrumpladser);

    if (shelterCapacity === null || shelterCapacity <= 0) {
      counters.missingOrNonPositiveCapacityCount += 1;
      incrementSkipReason(counters, "bbr_missing_or_non_positive_capacity");
      return null;
    }

    const coordinates = parseBbrCoordinateWkt(building.byg404Koordinat?.wkt ?? null);

    if (coordinates.latitude === null || coordinates.longitude === null) {
      counters.missingCoordinatesCount += 1;
      counters.acceptedWithoutCoordinatesCount += 1;

      if (coordinates.isParseFailure) {
        counters.coordinateParseFailureCount += 1;
        warnings.push({
          level: "warning",
          code: "bbr_coordinate_parse_failed",
          message: "Accepted shelter record had a malformed BBR coordinate WKT value.",
          reference: building.id_lokalId,
        });
      }
    } else {
      counters.acceptedWithCoordinatesCount += 1;
    }

    return {
      municipality,
      shelter: {
        slug: buildShelterSlug({
          municipalitySlug: municipality.slug,
          addressLine1,
          canonicalSourceReference,
        }),
        name: buildShelterName(addressLine1),
        addressLine1,
        postalCode,
        city,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        capacity: shelterCapacity,
        sourceApplicationCode: building.byg021BygningensAnvendelse,
        status: "under_review",
        accessibilityNotes: null,
        summary: buildSummary(),
      },
      source: {
        canonicalSourceName: CANONICAL_SOURCE_NAME,
        canonicalSourceReference,
        sourceName: "Datafordeler BBR + DAR",
        sourceType: "official",
        sourceUrl: BBR_DOCS_URL,
        sourceReference: canonicalSourceReference,
        lastVerifiedAt: null,
        notes: `Normalized from BBR building ${building.byg007Bygningsnummer ?? canonicalSourceReference} with DAR address enrichment.`,
      },
      lifecycle: {
        importState: "active",
      },
    };
  }

  private getMunicipalityMetadata(
    code: string,
    warnings: ImporterWarning[],
    warnedMunicipalityCodes: Set<string>,
  ) {
    const known = this.config.municipalityOverrides[code] ?? getMunicipalityMetadataByCode(code);

    if (known) {
      return known;
    }

    if (!warnedMunicipalityCodes.has(code)) {
      warnedMunicipalityCodes.add(code);
      warnings.push({
        level: "warning",
        code: "municipality_metadata_fallback",
        message: `No municipality metadata mapping was available for municipality code ${code}. Using a generated fallback value once for this code.`,
        reference: code,
      });
    }

    return {
      code,
      slug: `kommune-${code}`,
      name: `Municipality ${code}`,
      regionName: null,
    } satisfies MunicipalityMetadata;
  }
}
