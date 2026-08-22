# Import Contract

## Authoritative implementation

The production contract is implemented by the Python package in `tools/datafordeler-importer/shelter_importer`. The retired TypeScript importer has been removed so there is one write path.

Each `ShelterRecord` must contain:

- stable `canonical_source_reference`;
- municipality code, slug, name, and optional region;
- shelter slug, name, address, postcode, and city;
- paired valid coordinates or no coordinates;
- non-negative capacity;
- optional source application code;
- a supported source status.

## Database invariants

- Candidate identity is unique by import run and canonical source reference.
- Candidate slug is unique within one run.
- The candidate slug is import metadata only; a database trigger derives the permanent public slug from the shelter UUID and prevents later source updates or rollbacks from changing it.
- Municipality codes and Danish postcodes use four digits.
- Latitude and longitude must either both be present or both be absent.
- Only `service_role` can read or write candidate and snapshot tables.
- Only `service_role` can invoke the publication function.
- New shelter rows default to `withheld`; only the mapping-gated publisher can explicitly release new source rows.
- The private v2 implementation cannot be invoked directly by `service_role`.
- An existing `withheld` decision survives a later source upsert.
- Active manual overrides cannot change address, postcode, or city until the full location tuple can be validated and changed atomically.
- Browser roles cannot invoke the retired direct-write finalizer.
- Private operational reads require an allowlisted MFA moderator.
- Dataset rollback additionally requires the owner role.

## Run result

The secret-free JSON summary includes run status, publication status, publication ID, BBR fetched and eligible counts, DAR linked and missing counts, mapping failures, warnings, mapping ratio, quality-gate result, rejection reasons, and quality metrics. Credentials, authorization headers, and query strings are redacted from failures.
