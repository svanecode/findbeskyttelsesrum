import "server-only";

import { createAppV2AdminClient } from "@/lib/supabase/app-v2";

export type DailyUsage = {
  day: string;
  searches: number;
  areasChosen: number;
  resultsLoaded: number;
  noResults: number;
  errors: number;
  mapsOpened: number;
  detailsOpened: number;
  /** Average result load time in milliseconds, or null on days without samples. */
  averageLoadMs: number | null;
};

export type AdminStatistics = {
  days: number;
  daily: DailyUsage[];
  reports: {
    weekly: Array<{ week: string; received: number; closed: number }>;
    byType: Record<string, number>;
    byOutcome: Record<string, number>;
    active: number;
    medianHoursToClose: number | null;
  };
  contacts: {
    weekly: Array<{ week: string; received: number }>;
    active: number;
    overdue: number;
    medianHoursToFirstReply: number | null;
  };
};

function count(value: unknown) {
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 ? result : 0;
}

function hours(value: unknown) {
  if (value === null || value === undefined) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function counts(value: unknown) {
  return Object.fromEntries(Object.entries(record(value)).map(([key, total]) => [key, count(total)]));
}

function isoDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Parses app_v2.get_admin_statistics_v1, dropping anything malformed rather than trusting it. */
export function parseAdminStatistics(value: unknown): AdminStatistics {
  const data = record(value);
  const reports = record(data.reports);
  const contacts = record(data.contacts);

  return {
    days: count(data.days),
    daily: list(data.daily).flatMap((row) => {
      const day = isoDate(row.day);
      if (!day) return [];
      const samples = count(row.loadSamples);
      return [{
        day,
        searches: count(row.searches),
        areasChosen: count(row.areasChosen),
        resultsLoaded: count(row.resultsLoaded),
        noResults: count(row.noResults),
        errors: count(row.errors),
        mapsOpened: count(row.mapsOpened),
        detailsOpened: count(row.detailsOpened),
        averageLoadMs: samples > 0 ? Math.round(count(row.loadMsTotal) / samples) : null,
      }];
    }),
    reports: {
      weekly: list(reports.weekly).flatMap((row) => {
        const week = isoDate(row.week);
        return week ? [{ week, received: count(row.received), closed: count(row.closed) }] : [];
      }),
      byType: counts(reports.byType),
      byOutcome: counts(reports.byOutcome),
      active: count(reports.active),
      medianHoursToClose: hours(reports.medianHoursToClose),
    },
    contacts: {
      weekly: list(contacts.weekly).flatMap((row) => {
        const week = isoDate(row.week);
        return week ? [{ week, received: count(row.received) }] : [];
      }),
      active: count(contacts.active),
      overdue: count(contacts.overdue),
      medianHoursToFirstReply: hours(contacts.medianHoursToFirstReply),
    },
  };
}

export async function getAdminStatistics(days = 30): Promise<AdminStatistics> {
  const { data, error } = await createAppV2AdminClient().rpc("get_admin_statistics_v1", { p_days: days });
  if (error) {
    console.error("[admin-statistics] Query failed:", { code: error.code });
    throw new Error("Statistikken kunne ikke indlæses.");
  }
  return parseAdminStatistics(data);
}
