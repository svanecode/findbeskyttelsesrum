import { normalizeShelterName } from "@/lib/leaflet/popup-html";

const ENGLISH_SHELTER_AT = /^shelter at /i;

/**
 * Public-facing shelter label: prefer Danish/address over importer English placeholders.
 */
export function getShelterPublicDisplayName(name: string, addressLine1: string): string {
  const n = name.trim();
  const addr = addressLine1.trim();
  if (ENGLISH_SHELTER_AT.test(n) && addr.length > 0) {
    return addr;
  }
  if (ENGLISH_SHELTER_AT.test(n)) {
    return normalizeShelterName(n);
  }
  if (n.length > 0) {
    return n;
  }
  if (addr.length > 0) {
    return addr;
  }
  return "Beskyttelsesrum";
}
