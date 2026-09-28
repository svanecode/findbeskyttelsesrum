-- 1. The moderator "exclude" action inserts source = 'moderator_report', which
--    the original check constraint never allowed, so excluding a registration
--    from /admin always failed with a check violation.
alter table app_v2.shelter_exclusions
drop constraint if exists shelter_exclusions_source_check;
alter table app_v2.shelter_exclusions
add constraint shelter_exclusions_source_check
check (source in ('legacy_excluded_shelters', 'manual', 'other', 'moderator_report'));

-- 2. The public view applies an exclusion by shelter id, canonical source
--    pair or normalized address. An address-only exclusion lapses as soon as
--    the importer rewrites the address after a DAR change. When the address
--    identifies exactly one shelter, pin that shelter's id and source pair so
--    the exclusion survives later address changes.
create or replace function app_v2.normalize_exclusion_address_v1(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(trim(both from replace(p_value, ',', ' '))), '[[:space:]]+', ' ', 'g');
$$;

revoke all on function app_v2.normalize_exclusion_address_v1(text)
from public, anon, authenticated;

create or replace function app_v2.pin_shelter_exclusion_identity_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  matched_ids uuid[];
  matched app_v2.shelters%rowtype;
begin
  if new.shelter_id is not null or new.address_line1 is null or new.postal_code is null then
    return new;
  end if;

  select array_agg(shelter.id)
  into matched_ids
  from app_v2.shelters shelter
  where app_v2.normalize_exclusion_address_v1(shelter.address_line1)
      = app_v2.normalize_exclusion_address_v1(new.address_line1)
    and trim(both from shelter.postal_code) = trim(both from new.postal_code)
    and (
      new.city is null
      or app_v2.normalize_exclusion_address_v1(shelter.city) = app_v2.normalize_exclusion_address_v1(new.city)
    );

  -- An ambiguous address keeps matching by address only, as before.
  if coalesce(array_length(matched_ids, 1), 0) <> 1 then
    return new;
  end if;

  select shelter.* into matched from app_v2.shelters shelter where shelter.id = matched_ids[1];
  new.shelter_id := matched.id;
  if new.canonical_source_name is null and matched.canonical_source_name is not null
    and matched.canonical_source_reference is not null then
    new.canonical_source_name := matched.canonical_source_name;
    new.canonical_source_reference := matched.canonical_source_reference;
  end if;
  return new;
end;
$$;

revoke all on function app_v2.pin_shelter_exclusion_identity_v1()
from public, anon, authenticated;

drop trigger if exists app_v2_pin_shelter_exclusion_identity on app_v2.shelter_exclusions;
create trigger app_v2_pin_shelter_exclusion_identity
before insert or update on app_v2.shelter_exclusions
for each row execute function app_v2.pin_shelter_exclusion_identity_v1();

-- Backfill existing active exclusions through the trigger.
update app_v2.shelter_exclusions exclusion
set updated_at = exclusion.updated_at
where exclusion.is_active = true
  and exclusion.shelter_id is null
  and exclusion.address_line1 is not null
  and exclusion.postal_code is not null;

-- 3. Rows whose only identity is a legacy field satisfy the identity check but
--    are never applied by the public view, so they silently exclude nothing.
--    New or changed active rows must carry an identity the view applies. NOT
--    VALID leaves any existing legacy-only row in place for manual review;
--    `npm run parity:exclusions` reports the identities of active rows.
alter table app_v2.shelter_exclusions
drop constraint if exists app_v2_shelter_exclusions_applied_identity_check;
alter table app_v2.shelter_exclusions
add constraint app_v2_shelter_exclusions_applied_identity_check
check (
  not is_active
  or shelter_id is not null
  or (canonical_source_name is not null and canonical_source_reference is not null)
  or (address_line1 is not null and postal_code is not null)
) not valid;

comment on function app_v2.pin_shelter_exclusion_identity_v1() is
'Pins an address-identified exclusion to the single shelter it matches, so the exclusion survives later address changes from the importer.';
