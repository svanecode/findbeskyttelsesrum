-- Helper script for managing app_v2 shelter exclusions.
--
-- Notes:
-- - This repo's product decision is to keep exclusions/overrides as Git-tracked SQL.
-- - `app_v2.shelter_exclusions` is service-role managed (no public read policy).
-- - Use this script as a reference when applying changes via migrations/seed workflows.
--
-- Table: app_v2.shelter_exclusions
-- Identity options (at least one must be present):
-- - shelter_id
-- - (canonical_source_name, canonical_source_reference)
-- - (address_line1, postal_code[, city])
-- - legacy_address
-- - (legacy_vejnavn, legacy_husnummer, legacy_postnummer)
-- - legacy_bygning_id

-- List active exclusions (most recent first)
select
  id,
  is_active,
  shelter_id,
  canonical_source_name,
  canonical_source_reference,
  address_line1,
  postal_code,
  city,
  legacy_address,
  legacy_vejnavn,
  legacy_husnummer,
  legacy_postnummer,
  legacy_bygning_id,
  reason,
  source,
  created_by,
  created_at,
  updated_at
from app_v2.shelter_exclusions
where is_active = true
order by created_at desc;

-- Add a manual exclusion (address identity; prefer shelter_id when available)
-- insert into app_v2.shelter_exclusions (
--   shelter_id,
--   canonical_source_name,
--   canonical_source_reference,
--   address_line1,
--   postal_code,
--   city,
--   legacy_address,
--   legacy_vejnavn,
--   legacy_husnummer,
--   legacy_postnummer,
--   legacy_bygning_id,
--   reason,
--   notes,
--   source,
--   is_active,
--   created_by,
--   updated_by
-- ) values (
--   null,
--   null,
--   null,
--   'Eksempelvej 12',
--   '2100',
--   'København Ø',
--   null,
--   null,
--   null,
--   null,
--   null,
--   'Owner requested exclusion',
--   null,
--   'manual',
--   true,
--   'git-seed',
--   'git-seed'
-- );

-- Deactivate an exclusion (soft delete)
-- update app_v2.shelter_exclusions
-- set is_active = false,
--     updated_by = 'git-seed',
--     updated_at = timezone('utc', now())
-- where id = '00000000-0000-0000-0000-000000000000';

