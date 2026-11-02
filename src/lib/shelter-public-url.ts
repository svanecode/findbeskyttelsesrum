const stableShelterSlugPrefix = "registrering-";

export function getStableShelterSlug(shelterId: string) {
  const compactId = shelterId.trim().toLowerCase().replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/.test(compactId)) {
    throw new Error("A stable shelter slug requires a valid UUID.");
  }

  return `${stableShelterSlugPrefix}${compactId}`;
}

const maxPublicSlugLength = 240;

/**
 * True when `slug` could be a public path: 1 to 240 lower case letters, digits
 * and hyphens. Stable, readable, older importer and municipality slugs all have
 * this shape, so anything else is answered as not found without a lookup.
 */
export function isPlausiblePublicSlug(slug: string) {
  return slug.length >= 1 && slug.length <= maxPublicSlugLength && /^[\p{Ll}\p{N}-]+$/u.test(slug);
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
  /** True for the registration that already owns the plain path; it keeps it while it is public. */
  ownsPlainPath?: boolean;
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

/**
 * The registration at an address that keeps the plain path: the one that
 * already owns it, otherwise the one with the most places (then lowest id).
 * Same rule as app_v2.shelter_readable_path_v1.
 */
export function pickPrimaryRegistration<T extends Pick<ReadableShelterFields, "id" | "capacity" | "ownsPlainPath">>(members: T[]): T | null {
  return [...members].sort((a, b) =>
    Number(b.ownsPlainPath === true) - Number(a.ownsPlainPath === true) || b.capacity - a.capacity || a.id.localeCompare(b.id))[0] ?? null;
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

/**
 * Link slugs for many registrations at once, keyed by id, when the owner of
 * each plain path is unknown (client lists, structured data). A registration
 * alone at its address gets the plain path; at a shared address each gets its
 * suffixed path, which always resolves to it and redirects to the plain path
 * when it is the owner.
 */
export function getUnambiguousShelterSlugs<T extends Pick<ReadableShelterFields, "id" | "addressLine1" | "postalCode" | "city">>(shelters: T[]) {
  const counts = new Map<string, number>();
  for (const shelter of shelters) {
    const base = getReadableShelterBaseSlug(shelter);
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  const result = new Map<string, string>();
  for (const shelter of shelters) {
    const base = getReadableShelterBaseSlug(shelter);
    result.set(shelter.id, (counts.get(base) ?? 0) > 1 ? getSuffixedShelterSlug(shelter) : base);
  }
  return result;
}

export type ShelterRedirectKind = "temporary" | "permanent";

/**
 * How a detail path forwards to its canonical path. Only a readable path that
 * forwards to another readable path because of ownership is temporary: who owns
 * a plain path can change later. Stable, legacy and alias paths never change
 * target, so they stay permanent.
 */
export function getShelterRedirectKind(resolvedAsReadable: boolean): ShelterRedirectKind {
  return resolvedAsReadable ? "temporary" : "permanent";
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
 * Links for the registrations at one address, keyed by stable slug. With
 * several, each gets its suffixed path: which one owns the plain path is only
 * known on the server, and a suffixed path always resolves to the right
 * registration (and redirects to the plain path when that one owns it). A
 * lone registration keeps the plain path.
 */
export function getReadableMemberPaths(
  address: { addressLine1: string; postalCode: string; city: string },
  members: Array<{ slug: string; capacity: number }>,
) {
  const hasAddress = address.addressLine1.trim() !== "" && address.postalCode.trim() !== "";
  const paths = new Map<string, string>();
  for (const member of members) {
    const id = idFromStableSlug(member.slug);
    const slug = !id || !hasAddress
      ? member.slug
      : members.length > 1
        ? getSuffixedShelterSlug({ ...address, id })
        : getReadableShelterBaseSlug(address);
    paths.set(member.slug, getShelterPublicPath(slug));
  }
  return paths;
}

/**
 * The link for an address: the registration with the most places, by its
 * suffixed path when the address has several (see getReadableMemberPaths).
 */
export function getReadableGroupPrimaryPath(
  address: { addressLine1: string; postalCode: string; city: string },
  members: Array<{ slug: string; capacity: number }>,
) {
  const primary = pickPrimaryRegistration(
    members.map((member) => ({ ...member, id: idFromStableSlug(member.slug) ?? member.slug })),
  );
  return primary ? getReadableMemberPaths(address, members).get(primary.slug) ?? null : null;
}
