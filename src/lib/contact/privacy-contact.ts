export const privacyContactCategories = [
  { value: "privacy_rights", label: "Mine persondata og rettigheder" },
  { value: "service_question", label: "Spørgsmål til tjenesten" },
  { value: "technical_issue", label: "Teknisk problem" },
  { value: "other", label: "Anden henvendelse" },
] as const;

export type PrivacyContactCategory = (typeof privacyContactCategories)[number]["value"];

export const privacyContactStatuses = ["open", "reviewing", "answered", "closed"] as const;
export type PrivacyContactStatus = (typeof privacyContactStatuses)[number];

export type PrivacyContactMessage = {
  id: string;
  authorType: "visitor" | "moderator";
  message: string;
  createdAt: string;
};

export type PrivacyContactCase = {
  reference: string;
  category: PrivacyContactCategory;
  subject: string;
  status: PrivacyContactStatus;
  createdAt: string;
  updatedAt: string;
  responseDueAt: string;
  retentionUntil: string;
  messages: PrivacyContactMessage[];
};

export function isPrivacyContactCategory(value: unknown): value is PrivacyContactCategory {
  return privacyContactCategories.some((category) => category.value === value);
}

export function normalizeContactReference(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function normalizeContactAccessKey(value: unknown) {
  return typeof value === "string" ? value.replace(/[\s-]/g, "").toUpperCase() : "";
}

export function isContactReference(value: string) {
  return /^FBR-[0-9]{4}-[A-Z2-9]{8}$/.test(value);
}

export function isContactAccessKey(value: string) {
  return /^[2-9A-HJ-NP-Z]{32}$/.test(value);
}

export function formatContactAccessKey(value: string) {
  const normalized = normalizeContactAccessKey(value);
  return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
}
