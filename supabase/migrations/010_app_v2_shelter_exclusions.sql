create table if not exists app_v2.shelter_exclusions (
  id uuid primary key default gen_random_uuid(),
  shelter_id uuid references app_v2.shelters(id) on delete set null,
  canonical_source_name text,
  canonical_source_reference text,
  address_line1 text,
  postal_code text,
  city text,
  legacy_address text,
  legacy_vejnavn text,
  legacy_husnummer text,
  legacy_postnummer text,
  legacy_bygning_id text,
  reason text,
  notes text,
  source text not null default 'legacy_excluded_shelters'
    check (source in ('legacy_excluded_shelters', 'manual', 'other')),
  is_active boolean not null default true,
  created_by text,
  updated_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_v2_shelter_exclusions_source_pair_check
    check (
      (canonical_source_name is null and canonical_source_reference is null)
      or (canonical_source_name is not null and canonical_source_reference is not null)
    ),
  constraint app_v2_shelter_exclusions_identity_check
    check (
      shelter_id is not null
      or (canonical_source_name is not null and canonical_source_reference is not null)
      or (address_line1 is not null and postal_code is not null)
      or legacy_address is not null
      or (legacy_vejnavn is not null and legacy_husnummer is not null and legacy_postnummer is not null)
      or legacy_bygning_id is not null
    )
);

create index if not exists app_v2_shelter_exclusions_active_shelter_idx
on app_v2.shelter_exclusions (shelter_id)
where is_active = true
  and shelter_id is not null;

create index if not exists app_v2_shelter_exclusions_active_source_idx
on app_v2.shelter_exclusions (canonical_source_name, canonical_source_reference)
where is_active = true
  and canonical_source_name is not null
  and canonical_source_reference is not null;

create index if not exists app_v2_shelter_exclusions_active_address_idx
on app_v2.shelter_exclusions (lower(address_line1), postal_code, lower(city))
where is_active = true
  and address_line1 is not null
  and postal_code is not null;

create index if not exists app_v2_shelter_exclusions_active_legacy_address_idx
on app_v2.shelter_exclusions (lower(legacy_address))
where is_active = true
  and legacy_address is not null;

create index if not exists app_v2_shelter_exclusions_active_legacy_split_address_idx
on app_v2.shelter_exclusions (legacy_vejnavn, legacy_husnummer, legacy_postnummer)
where is_active = true
  and legacy_vejnavn is not null
  and legacy_husnummer is not null
  and legacy_postnummer is not null;

create index if not exists app_v2_shelter_exclusions_active_legacy_bygning_idx
on app_v2.shelter_exclusions (legacy_bygning_id)
where is_active = true
  and legacy_bygning_id is not null;

create trigger app_v2_set_shelter_exclusions_updated_at
before update on app_v2.shelter_exclusions
for each row
execute function app_v2.set_updated_at();

alter table app_v2.shelter_exclusions enable row level security;

grant all privileges on app_v2.shelter_exclusions to service_role;

comment on table app_v2.shelter_exclusions is
'Manual and migrated exclusion requests used to keep future app_v2 public read models from showing owner-requested excluded shelters.';

comment on column app_v2.shelter_exclusions.legacy_bygning_id is
'Legacy sheltersv2 bygning_id retained for parity with public.excluded_shelters matching.';

comment on column app_v2.shelter_exclusions.source is
'Origin of the exclusion request. legacy_excluded_shelters is reserved for migrated public.excluded_shelters rows.';
