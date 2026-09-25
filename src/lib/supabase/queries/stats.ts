import { createAppV2PublicClient } from "@/lib/app-v2-public";
import { createAppV2AdminClient } from "@/lib/supabase/app-v2";
import { normalizePublicStat } from "./shared";

type ShelterCountOptions = {
  includeMissing?: boolean;
};

const shelterCapacityPageSize = 1000;
export async function getAppV2ShelterCount(options: ShelterCountOptions = {}) {
  const supabase = createAppV2AdminClient();
  const query = supabase.from("shelters").select("id", { count: "exact", head: true });
  const scopedQuery = options.includeMissing ? query : query.eq("import_state", "active");
  const { count, error } = await scopedQuery;

  if (error) {
    console.warn(`Could not count app_v2 shelters: ${error.message}`);
    return 0;
  }

  return count ?? 0;
}

type PublicDataStatsRow = {
  public_registrations: number | string | null;
  public_capacity: number | string | null;
  mapped_registrations: number | string | null;
  mapped_capacity: number | string | null;
  latest_public_import_at: string | null;
};

export type AppV2PublicDataStats = {
  publicRegistrations: number;
  publicCapacity: number;
  mappedRegistrations: number;
  mappedCapacity: number;
  latestPublicImportAt: string | null;
};

type PublicDataFunnelRow = {
  active_source_registrations: number | string | null;
  active_source_capacity: number | string | null;
  capacity_threshold_registrations: number | string | null;
  capacity_threshold_capacity: number | string | null;
  application_eligible_registrations: number | string | null;
  application_eligible_capacity: number | string | null;
  published_registrations: number | string | null;
  published_capacity: number | string | null;
};

export type AppV2PublicDataFunnel = {
  activeSourceRegistrations: number;
  activeSourceCapacity: number;
  capacityThresholdRegistrations: number;
  capacityThresholdCapacity: number;
  applicationEligibleRegistrations: number;
  applicationEligibleCapacity: number;
  publishedRegistrations: number;
  publishedCapacity: number;
};

export async function getAppV2PublicDataStats(): Promise<AppV2PublicDataStats> {
  const supabase = createAppV2PublicClient();
  const { data, error } = await supabase
    .from("public_data_stats_v1")
    .select(
      "public_registrations, public_capacity, mapped_registrations, mapped_capacity, latest_public_import_at",
    )
    .single();

  if (error) {
    throw new Error(`Could not load public app_v2 data stats: ${error.message}`);
  }

  const row = data as PublicDataStatsRow;
  return {
    publicRegistrations: normalizePublicStat(row.public_registrations),
    publicCapacity: normalizePublicStat(row.public_capacity),
    mappedRegistrations: normalizePublicStat(row.mapped_registrations),
    mappedCapacity: normalizePublicStat(row.mapped_capacity),
    latestPublicImportAt: row.latest_public_import_at,
  };
}

export async function getAppV2PublicDataFunnel(): Promise<AppV2PublicDataFunnel> {
  const admin = createAppV2AdminClient();
  const { data, error } = await admin.rpc("get_public_data_funnel_v1");

  if (error) {
    throw new Error(`Could not load app_v2 public data funnel: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as PublicDataFunnelRow | null;
  if (!row) {
    throw new Error("Could not load app_v2 public data funnel: no aggregate row returned.");
  }

  return {
    activeSourceRegistrations: normalizePublicStat(row.active_source_registrations),
    activeSourceCapacity: normalizePublicStat(row.active_source_capacity),
    capacityThresholdRegistrations: normalizePublicStat(row.capacity_threshold_registrations),
    capacityThresholdCapacity: normalizePublicStat(row.capacity_threshold_capacity),
    applicationEligibleRegistrations: normalizePublicStat(row.application_eligible_registrations),
    applicationEligibleCapacity: normalizePublicStat(row.application_eligible_capacity),
    publishedRegistrations: normalizePublicStat(row.published_registrations),
    publishedCapacity: normalizePublicStat(row.published_capacity),
  };
}

export async function getAppV2TotalShelterCapacity() {
  const supabase = createAppV2AdminClient();
  let totalCapacity = 0;
  let from = 0;

  while (true) {
    const to = from + shelterCapacityPageSize - 1;
    const { data, error } = await supabase
      .from("shelters")
      .select("capacity")
      .eq("import_state", "active")
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error("Could not load app_v2 shelter capacity.");
    }

    const rows = (data ?? []) as Array<{ capacity: number | null }>;

    for (const row of rows) {
      totalCapacity += row.capacity ?? 0;
    }

    if (rows.length < shelterCapacityPageSize) {
      break;
    }

    from += shelterCapacityPageSize;
  }

  return totalCapacity;
}
