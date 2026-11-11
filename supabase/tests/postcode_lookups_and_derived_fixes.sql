begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

-- Review of 10 November 2026: M1b (postcode lookups through the base index),
-- M4 (a live path never answers 410), M5 (a postcode forgets a lost
-- position) and the publication lock of the path alias refresh.

insert into app_v2.municipalities (id, code, slug, name)
values ('83000000-0000-0000-0000-000000000001', '9967', 'livsti-test-kommune', 'Livsti Test Kommune');

insert into app_v2.application_code_eligibility (source_name, application_code, label, is_nearby_eligible)
values ('datafordeler-bbr-dar', '967', 'Livsti fixture', true)
on conflict (source_name, application_code) do update set is_nearby_eligible = true;

insert into app_v2.shelters (
  id, municipality_id, slug, name, address_line1, postal_code, city, latitude, longitude,
  capacity, status, summary, publication_state, import_state, source_application_code,
  canonical_source_name, canonical_source_reference
) values
  ('83000000-0000-0000-0000-000000000011', '83000000-0000-0000-0000-000000000001', 'livsti-a', 'A',
   'Livevej 1', '9967', 'Testby', 56.300000, 10.300000, 200, 'active', 'A', 'published', 'active', '967',
   'datafordeler-bbr-dar', 'livsti-a'),
  ('83000000-0000-0000-0000-000000000012', '83000000-0000-0000-0000-000000000001', 'livsti-b', 'B',
   'Livevej 1', '9967', 'Testby', 56.300010, 10.300010, 60, 'active', 'B', 'published', 'active', '967',
   'datafordeler-bbr-dar', 'livsti-b'),
  ('83000000-0000-0000-0000-000000000013', '83000000-0000-0000-0000-000000000001', 'livsti-c', 'C',
   'Flyttevej 2', '9967', 'Testby', 56.300100, 10.300100, 200, 'active', 'C', 'published', 'active', '967',
   'datafordeler-bbr-dar', 'livsti-c'),
  ('83000000-0000-0000-0000-000000000014', '83000000-0000-0000-0000-000000000001', 'livsti-d', 'D',
   'Nyvej 3', '9968', 'Testby', 56.310000, 10.310000, 200, 'active', 'D', 'published', 'active', '967',
   'datafordeler-bbr-dar', 'livsti-d'),
  ('83000000-0000-0000-0000-000000000015', '83000000-0000-0000-0000-000000000001', 'livsti-e', 'E',
   'Enevej 1', '9969', 'Testby', 56.320000, 10.320000, 200, 'active', 'E', 'published', 'active', '967',
   'datafordeler-bbr-dar', 'livsti-e');

-- Public whatever the publication triggers did.
update app_v2.shelters
set publication_state = 'published', import_state = 'active', source_application_code = '967'
where id::text like '83000000-%';

select app_v2.refresh_shelter_path_aliases_v1();

-- 1. M1b: the postcode lookup gives the rows the view gives.
select ok(
  exists (select 1 from pg_indexes where schemaname = 'app_v2' and indexname = 'app_v2_shelters_postal_code_idx'),
  'shelters has a postcode index'
);
select results_eq(
  $sql$ select * from app_v2.public_shelters_in_postcode_v1('9967') $sql$,
  $sql$
    select id, slug, address_line1, postal_code, city, capacity
    from app_v2.shelter_public_v2 where postal_code = '9967'
  $sql$,
  'the postcode lookup equals the view filtered on postcode'
);
select is(
  (select count(*)::integer from app_v2.public_shelters_in_postcode_v1('9967')),
  3,
  'three public registrations in 9967'
);
select is(
  (select count(*)::integer from app_v2.public_shelters_in_postcode_v1('0001')),
  0,
  'an unknown postcode gives nothing'
);

-- A shelter whose active override sets another postcode belongs there, not in
-- its own. Active overrides are capacity-only for now, so the guard is
-- suspended inside this rolled-back transaction (as in retired_shelter_exclusions).
alter table app_v2.shelter_overrides disable trigger app_v2_enforce_capacity_only_shelter_override;
alter table app_v2.shelter_overrides drop constraint app_v2_shelter_overrides_active_location_check;
insert into app_v2.shelter_overrides (shelter_id, address_line1, postal_code, city, reason)
values ('83000000-0000-0000-0000-000000000013', 'Flyttevej 2', '9968', 'Testby', 'Ejeren har rettet postnummeret');
alter table app_v2.shelter_overrides enable trigger app_v2_enforce_capacity_only_shelter_override;

select results_eq(
  $sql$ select * from app_v2.public_shelters_in_postcode_v1('9967') $sql$,
  $sql$
    select id, slug, address_line1, postal_code, city, capacity
    from app_v2.shelter_public_v2 where postal_code = '9967'
  $sql$,
  'an override that moves a shelter away is respected'
);
select results_eq(
  $sql$ select * from app_v2.public_shelters_in_postcode_v1('9968') $sql$,
  $sql$
    select id, slug, address_line1, postal_code, city, capacity
    from app_v2.shelter_public_v2 where postal_code = '9968'
  $sql$,
  'an override that moves a shelter in is respected'
);
select is(
  (select count(*)::integer from app_v2.public_shelters_in_postcode_v1('9968')),
  2,
  'the moved shelter is found in its new postcode through the override'
);

insert into app_v2.shelter_exclusions (shelter_id, source, reason)
values ('83000000-0000-0000-0000-000000000014', 'manual', 'Ejeren har bedt om at få adressen fjernet');
select is(
  (select count(*)::integer from app_v2.public_shelters_in_postcode_v1('9968')),
  1,
  'an excluded shelter is not found'
);
update app_v2.shelter_exclusions set is_active = false
where shelter_id = '83000000-0000-0000-0000-000000000014';

-- 2. M1b: plain path owners, with and without a postcode.
select app_v2.refresh_shelter_path_aliases_v1();
select results_eq(
  $sql$ select * from app_v2.public_plain_path_owner_ids_v1('9967') $sql$,
  $sql$ values ('83000000-0000-0000-0000-000000000011'::uuid) $sql$,
  'the registration with most places owns the plain path of Livevej 1'
);
select results_eq(
  $sql$
    select t.owner from app_v2.public_plain_path_owner_ids_v1(null) as t(owner)
    where t.owner::text like '83000000-%' order by 1
  $sql$,
  $sql$
    select t.owner from (
      select * from app_v2.public_plain_path_owner_ids_v1('9967')
      union all select * from app_v2.public_plain_path_owner_ids_v1('9968')
      union all select * from app_v2.public_plain_path_owner_ids_v1('9969')
    ) as t(owner) order by 1
  $sql$,
  'the owners of all postcodes together equal the owners without a postcode'
);
select ok(
  has_function_privilege('anon', 'app_v2.public_shelters_in_postcode_v1(text)', 'EXECUTE')
  and has_function_privilege('anon', 'app_v2.public_plain_path_owner_ids_v1(text)', 'EXECUTE'),
  'the page can call both postcode functions'
);

-- 3. M4: a path a public registration owns today never answers 410.
-- A leaves BBR, but the path history is not refreshed: its alias is still open
-- on the plain path, which B now owns in the readable-path view.
update app_v2.shelters set import_state = 'missing_from_source'
where id = '83000000-0000-0000-0000-000000000011';

create temporary table live_path_fixture on commit drop as
select
  'livevej-1-9967-testby'::text as plain_path,
  encode(sha256(convert_to('livevej-1-9967-testby', 'UTF8')), 'hex') as plain_hash,
  (select slug from app_v2.shelters where id = '83000000-0000-0000-0000-000000000011') as removed_slug,
  (select encode(sha256(convert_to(slug, 'UTF8')), 'hex') from app_v2.shelters where id = '83000000-0000-0000-0000-000000000011') as slug_hash;

select is(
  (select path_slug from app_v2.shelter_readable_path_v1 where shelter_id = '83000000-0000-0000-0000-000000000012'),
  'livevej-1-9967-testby',
  'B owns the plain path in the readable-path view once A has left'
);
select is(
  (select shelter_id from app_v2.shelter_path_aliases where path_slug = 'livevej-1-9967-testby' and valid_to is null),
  '83000000-0000-0000-0000-000000000011'::uuid,
  'the stale alias still points at the removed registration'
);
select is(
  (select count(*)::integer from app_v2.resolve_retired_shelter_v1((select plain_path from live_path_fixture))),
  0,
  'the live plain path does not resolve as a removed registration'
);
select ok(
  not exists (
    select 1 from app_v2.retired_shelter_path_hashes_v1() where path_hash = (select plain_hash from live_path_fixture)
  ),
  'the live plain path is not on the 410 list'
);
select is(
  (select count(*)::integer from app_v2.resolve_retired_shelter_v1((select removed_slug from live_path_fixture))),
  1,
  'the removed registration is still found by its own stable slug'
);
select ok(
  exists (
    select 1 from app_v2.retired_shelter_path_hashes_v1() where path_hash = (select slug_hash from live_path_fixture)
  ),
  'the removed registration stays on the 410 list under its own slug'
);

-- 4. M5: a postcode that lost its registrations forgets their position.
select app_v2.refresh_postal_areas_from_registrations_v1();
select is(
  (select position_source from app_v2.postal_areas where postnr = '9969'),
  'registrations',
  'a postcode with one public registration takes its position'
);

insert into app_v2.shelter_exclusions (shelter_id, source, reason)
values ('83000000-0000-0000-0000-000000000015', 'manual', 'Ejeren har bedt om at få adressen fjernet');

-- A DAR position and an old position without registrations, for the other cases.
insert into app_v2.postal_areas (postnr, name, municipality_codes, latitude, longitude, position_source, has_registrations)
values
  ('9970', 'Dar By', '{9967}', 56.4, 10.4, 'dar_address', false),
  ('9971', 'Gammel By', '{9967}', 56.5, 10.5, 'registrations', false);

select app_v2.refresh_postal_areas_from_registrations_v1();
select ok(
  (select latitude is null and longitude is null and position_source is null and not has_registrations
   from app_v2.postal_areas where postnr = '9969'),
  'the excluded registration''s position is gone from the postcode'
);
select ok(
  not exists (select 1 from app_v2.postal_area_public_v1 where postnr = '9969'),
  'the public postcode list no longer shows it'
);
select ok(
  not exists (
    select 1 from app_v2.postal_areas
    where postnr = '9969' and latitude is not null and municipality_codes <> '{}'
  ),
  'the importer sees the postcode as incomplete (no latitude)'
);
select ok(
  (select latitude = 56.4 and position_source = 'dar_address' from app_v2.postal_areas where postnr = '9970'),
  'a position from DAR is left alone'
);
select ok(
  (select latitude is null and position_source is null from app_v2.postal_areas where postnr = '9971'),
  'an old registrations position without registrations is cleared too'
);

select app_v2.upsert_dar_postal_areas_v1(
  '[{"postnr":"9969","name":"Testby","latitude":56.33,"longitude":10.33,"municipality_codes":["9967"]}]'::jsonb
);
select ok(
  (select latitude = 56.33 and position_source = 'dar_address' from app_v2.postal_areas where postnr = '9969'),
  'DAR fills the postcode in again'
);
select app_v2.refresh_postal_areas_from_registrations_v1();
select ok(
  (select latitude = 56.33 and position_source = 'dar_address' from app_v2.postal_areas where postnr = '9969'),
  'a later refresh keeps the DAR position'
);

-- 5. The path alias refresh holds the publication lock until the transaction ends.
select app_v2.refresh_shelter_path_aliases_v1();
select ok(
  exists (
    select 1
    from pg_locks
    where locktype = 'advisory'
      and pid = pg_backend_pid()
      and granted
      and classid = ((hashtextextended('app_v2:datafordeler-publication', 0) >> 32) & 4294967295)::oid
      and objid = (hashtextextended('app_v2:datafordeler-publication', 0) & 4294967295)::oid
  ),
  'the alias refresh takes the publication advisory lock'
);

select * from finish();
rollback;
