const stableShelterSlugPrefix = "registrering-";

export function getStableShelterSlug(shelterId: string) {
  const compactId = shelterId.trim().toLowerCase().replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/.test(compactId)) {
    throw new Error("A stable shelter slug requires a valid UUID.");
  }

  return `${stableShelterSlugPrefix}${compactId}`;
}

export function getShelterPublicPath(slug: string) {
  return `/beskyttelsesrum/${encodeURIComponent(slug)}`;
}

/*
 * Readable detail addresses: /beskyttelsesrum/ryesgade-18-8000-aarhus-c.
 *
 * The path is built from the address, so it needs no database column. When
 * several registrations share an address, the one with the most places (then
 * the lowest id) keeps the plain path and the others add the first six
 * characters of their id: ryesgade-22a-8000-aarhus-c-281be9. Every
 * registration also answers on its suffixed path, so a link made without
 * knowing the other registrations at the address still works; the page then
 * redirects to the canonical path.
 */

export type ReadableShelterFields = {
  id: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  capacity: number;
};

const shortIdLength = 6;

/** Lower case ASCII words joined by "-": æ, ø and å become ae, oe and aa. */
export function slugifyDanish(value: string) {
  return value
    .toLocaleLowerCase("da-DK")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getReadableShelterBaseSlug(shelter: Pick<ReadableShelterFields, "addressLine1" | "postalCode" | "city">) {
  return slugifyDanish(`${shelter.addressLine1} ${shelter.postalCode} ${shelter.city}`);
}

export function getShortShelterId(id: string) {
  return id.replace(/-/g, "").toLowerCase().slice(0, shortIdLength);
}

/** The registration at an address that keeps the plain path. */
export function pickPrimaryRegistration<T extends Pick<ReadableShelterFields, "id" | "capacity">>(members: T[]): T | null {
  return [...members].sort((a, b) => b.capacity - a.capacity || a.id.localeCompare(b.id))[0] ?? null;
}

/** The suffixed path, valid for every registration. */
export function getSuffixedShelterSlug(shelter: Pick<ReadableShelterFields, "id" | "addressLine1" | "postalCode" | "city">) {
  return `${getReadableShelterBaseSlug(shelter)}-${getShortShelterId(shelter.id)}`;
}

/**
 * The canonical readable slug for `shelter`, given every registration at the
 * same address (including itself). Pass only the shelter when it is alone.
 */
export function getCanonicalShelterSlug<T extends ReadableShelterFields>(shelter: T, sameAddress: T[] = [shelter]) {
  const base = getReadableShelterBaseSlug(shelter);
  const members = sameAddress.filter((member) => getReadableShelterBaseSlug(member) === base);
  if (!members.some((member) => member.id === shelter.id)) members.push(shelter);
  return pickPrimaryRegistration(members)?.id === shelter.id ? base : getSuffixedShelterSlug(shelter);
}

/** Canonical paths for many registrations at once, keyed by id. */
export function getCanonicalShelterSlugs<T extends ReadableShelterFields>(shelters: T[]) {
  const byBase = new Map<string, T[]>();
  for (const shelter of shelters) {
    const base = getReadableShelterBaseSlug(shelter);
    byBase.set(base, [...(byBase.get(base) ?? []), shelter]);
  }
  const result = new Map<string, string>();
  for (const [base, members] of byBase) {
    const primaryId = pickPrimaryRegistration(members)?.id;
    for (const member of members) {
      result.set(member.id, member.id === primaryId ? base : `${base}-${getShortShelterId(member.id)}`);
    }
  }
  return result;
}

/** Paths of the stable form "registrering-<uuid>" and older importer slugs are looked up as before. */
export function isStableShelterSlug(slug: string) {
  return slug.startsWith(stableShelterSlugPrefix);
}

/**
 * Candidate postcodes in a readable slug, last first: "ryesgade-18-8000-aarhus-c" gives ["8000"].
 * A house number can also have four digits, so every four digit part is a candidate.
 */
export function readableSlugPostcodes(slug: string) {
  return Array.from(slug.matchAll(/(?:^|-)(\d{4})(?=-)/g), (match) => match[1]!).reverse();
}

/** The short id at the end of a suffixed slug, or null. */
export function readableSlugShortId(slug: string) {
  return new RegExp(`-([0-9a-f]{${shortIdLength}})$`).exec(slug)?.[1] ?? null;
}

/** The id key a stable slug encodes ("registrering-<32 hex>"), or null. */
export function idFromStableSlug(slug: string) {
  if (!isStableShelterSlug(slug)) return null;
  const compact = slug.slice(stableShelterSlugPrefix.length);
  return /^[0-9a-f]{32}$/.test(compact) ? compact : null;
}

/**
 * The readable path for a registration known by its stable slug, when the
 * other registrations at the address are unknown (map popups, related
 * lists). Falls back to the stable slug when it carries no id.
 */
export function getReadableShelterPathFromStable(shelter: { slug: string; addressLine1: string; postalCode: string; city: string }) {
  const id = idFromStableSlug(shelter.slug);
  if (!id || !shelter.addressLine1.trim() || !shelter.postalCode.trim()) return getShelterPublicPath(shelter.slug);
  return getShelterPublicPath(getSuffixedShelterSlug({ id, addressLine1: shelter.addressLine1, postalCode: shelter.postalCode, city: shelter.city }));
}

/**
 * Readable paths for the registrations at one address, keyed by stable slug.
 * `members` are the registrations at that address with their stable slugs.
 */
export function getReadableGroupPaths(
  address: { addressLine1: string; postalCode: string; city: string },
  members: Array<{ slug: string; capacity: number }>,
) {
  const withIds = members
    .map((member) => ({ ...member, id: idFromStableSlug(member.slug) }))
    .filter((member): member is typeof member & { id: string } => member.id !== null);
  const canonical = getCanonicalShelterSlugs(withIds.map((member) => ({ ...address, id: member.id, capacity: member.capacity })));
  const paths = new Map<string, string>();
  for (const member of members) {
    const id = idFromStableSlug(member.slug);
    const slug = id ? canonical.get(id) : undefined;
    paths.set(member.slug, getShelterPublicPath(slug ?? member.slug));
  }
  return paths;
}

/** The path of the registration that represents an address (the one with the most places). */
export function getReadableGroupPrimaryPath(
  address: { addressLine1: string; postalCode: string; city: string },
  members: Array<{ slug: string; capacity: number }>,
) {
  if (members.length === 0) return null;
  const paths = getReadableGroupPaths(address, members);
  const primary = pickPrimaryRegistration(
    members.map((member) => ({ ...member, id: idFromStableSlug(member.slug) ?? member.slug })),
  );
  return primary ? paths.get(primary.slug) ?? null : null;
}
