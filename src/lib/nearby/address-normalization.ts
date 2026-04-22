type LegacyAddressParts = {
  address?: string | null
  vejnavn?: string | null
  husnummer?: string | null
  postnummer?: string | null
}

type AppV2AddressParts = {
  addressLine1?: string | null
  postalCode?: string | null
}

export const nearbyAddressKeyStrategy =
  'street-house-postal-v1: prefer split street/house/postal fields; ignore city suffixes for deterministic comparison'

export function normalizeNearbyAddressText(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getLegacyNearbyAddressKey(row: LegacyAddressParts) {
  const splitAddress = [row.vejnavn, row.husnummer].filter(Boolean).join(' ')

  if (splitAddress && row.postnummer) {
    return normalizeNearbyAddressText([splitAddress, row.postnummer].join(' '))
  }

  if (row.address && row.postnummer) {
    const addressWithoutSuffix = row.address.split(',')[0]
    return normalizeNearbyAddressText([addressWithoutSuffix, row.postnummer].join(' '))
  }

  return normalizeNearbyAddressText(row.address || splitAddress || row.postnummer || '')
}

export function getAppV2NearbyAddressKey(row: AppV2AddressParts) {
  return normalizeNearbyAddressText([row.addressLine1, row.postalCode].filter(Boolean).join(' '))
}
