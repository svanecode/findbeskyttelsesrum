export const shelterReportTypes = [
  { value: "incorrect_address", label: "Adressen er forkert" },
  { value: "building_missing", label: "Bygningen findes ikke længere" },
  { value: "not_a_shelter", label: "Der er ikke et sikringsrum her" },
  { value: "unavailable", label: "Rummet er ikke tilgængeligt" },
  { value: "incorrect_capacity", label: "Kapaciteten ser forkert ud" },
  { value: "duplicate_record", label: "Registreringen er en dublet" },
  { value: "other", label: "Andet" },
] as const;

export type ShelterReportType = (typeof shelterReportTypes)[number]["value"];

const shelterReportTypeSet = new Set<string>(shelterReportTypes.map(({ value }) => value));

export function isShelterReportType(value: unknown): value is ShelterReportType {
  return typeof value === "string" && shelterReportTypeSet.has(value);
}
