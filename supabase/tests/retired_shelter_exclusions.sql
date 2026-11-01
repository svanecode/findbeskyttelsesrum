begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- A registration that BBR drops must not reappear on the public 410 page when
-- the owner had it excluded, and an owner's correction must still apply there.

insert into app_v2.municipalities (id, code, slug, name)
values ('82000000-0000-0000-0000-000000000001', '9965', 'udgaaet-test-kommune', 'Udgået Test Kommune');

insert into app_v2.application_code_eligibility (source_name, application_code, label, is_nearby_eligible)
values ('datafordeler-bbr-dar', '965', 'Retired fixture', true)
on conflict (source_name, application_code) do update set is_nearby_eligible = true;

insert into app_v2.shelters (
  id, municipality_id, slug, name, address_line1, postal_code, city, latitude, longitude,
  capacity, status, summary, publication_state, import_state, source_application_code,
  canonical_source_name, canonical_source_reference
) values
  ('82000000-0000-0000-0000-000000000011', '82000000-0000-0000-0000-000000000001', 'udgaaet-id', 'Id',
   'Idvej 1', '9965', 'Testby', 56.200000, 10.200000, 200, 'active', 'Id', 'published', 'active', '965',
   'datafordeler-bbr-dar', 'retired-id'),
  ('82000000-0000-0000-0000-000000000012', '82000000-0000-0000-0000-000000000001', 'udgaaet-tvilling-a', 'Tvilling A',
   'Tvillingvej 5', '9965', 'Testby', 56.200100, 10.200100, 200, 'active', 'Tvilling', 'published', 'active', '965',
   'datafordeler-bbr-dar', 'retired-twin-a'),
  ('82000000-0000-0000-0000-000000000013', '82000000-0000-0000-0000-000000000001', 'udgaaet-tvilling-b', 'Tvilling B',
   'Tvillingvej 5', '9965', 'Testby', 56.200200, 10.200200, 200, 'active', 'Tvilling', 'published', 'active', '965',
   'datafordeler-bbr-dar', 'retired-twin-b'),
  ('82000000-0000-0000-0000-000000000014', '82000000-0000-0000-0000-000000000001', 'udgaaet-rettet', 'Rettet',
   'Fejlvej 7', '9965', 'Testby', 56.200300, 10.200300, 200, 'active', 'Rettet', 'published', 'active', '965',
   'datafordeler-bbr-dar', 'retired-override');

-- Make the test rows public whatever the publication triggers did, then let
-- BBR drop them.
update app_v2.shelters
set publication_state = 'published', import_state = 'missing_from_source', source_application_code = '965'
where id::text like '82000000-0000-0000-0000-0000000000%';

create temporary table retired_fixture on commit drop as
select id, slug, encode(sha256(convert_to(slug, 'UTF8')), 'hex') as slug_hash
from app_v2.shelters
where id::text like '82000000-0000-0000-0000-0000000000%';

-- 1. Without an exclusion the removed registration is reported.
select is(
  (select count(*)::integer from app_v2.resolve_retired_shelter_v1(
    (select slug from retired_fixture where id = '82000000-0000-0000-0000-000000000011'))),
  1,
  'a removed registration without an exclusion is found'
);
select ok(
  exists (
    select 1 from app_v2.retired_shelter_path_hashes_v1()
    where path_hash = (select slug_hash from retired_fixture where id = '82000000-0000-0000-0000-000000000011')
  ),
  'a removed registration without an exclusion is in the proxy list'
);

-- 2. An exclusion that names the shelter id hides it.
insert into app_v2.shelter_exclusions (shelter_id, source, reason)
values ('82000000-0000-0000-0000-000000000011', 'manual', 'Ejeren har bedt om at få adressen fjernet');

select is(
  (select count(*)::integer from app_v2.resolve_retired_shelter_v1(
    (select slug from retired_fixture where id = '82000000-0000-0000-0000-000000000011'))),
  0,
  'a removed registration excluded by id is not found'
);
select ok(
  not exists (
    select 1 from app_v2.retired_shelter_path_hashes_v1()
    where path_hash = (select slug_hash from retired_fixture where id = '82000000-0000-0000-0000-000000000011')
  ),
  'a removed registration excluded by id is not in the proxy list'
);

-- 3. An exclusion that only matches the normalized address hides it. Two
--    registrations share the address, so the exclusion is not pinned to an id.
select is(
  (select count(*)::integer from app_v2.resolve_retired_shelter_v1(
    (select slug from retired_fixture where id = '82000000-0000-0000-0000-000000000012'))),
  1,
  'the twin registration is found before the address exclusion'
);

insert into app_v2.shelter_exclusions (address_line1, postal_code, city, source, reason)
values (' tvillingvej,  5 ', '9965', 'TESTBY', 'manual', 'Ejeren har bedt om at få adressen fjernet');

select is(
  (select shelter_id from app_v2.shelter_exclusions where address_line1 = ' tvillingvej,  5 '),
  null::uuid,
  'the address exclusion matches by address only'
);
select is(
  (select count(*)::integer from app_v2.resolve_retired_shelter_v1(
    (select slug from retired_fixture where id = '82000000-0000-0000-0000-000000000012'))),
  0,
  'a removed registration excluded by normalized address is not found'
);
select is(
  (select count(*)::integer from app_v2.resolve_retired_shelter_v1(
    (select slug from retired_fixture where id = '82000000-0000-0000-0000-000000000013'))),
  0,
  'the other registration at the excluded address is not found either'
);
select ok(
  not exists (
    select 1 from app_v2.retired_shelter_path_hashes_v1()
    where path_hash in (
      select slug_hash from retired_fixture
      where id in ('82000000-0000-0000-0000-000000000012', '82000000-0000-0000-0000-000000000013')
    )
  ),
  'registrations excluded by normalized address are not in the proxy list'
);

-- 4. An active override corrects the address shown on the 410 page, as in
--    app_v2.shelter_public_v2. Active overrides are capacity-only for now
--    (20260821203117_release_1_data_integrity.sql), so the guard is suspended
--    inside this rolled-back transaction to reach the address path.
alter table app_v2.shelter_overrides disable trigger app_v2_enforce_capacity_only_shelter_override;
alter table app_v2.shelter_overrides drop constraint app_v2_shelter_overrides_active_location_check;
insert into app_v2.shelter_overrides (shelter_id, address_line1, postal_code, city, reason)
values ('82000000-0000-0000-0000-000000000014', 'Rettetvej 9', '9964', 'Rettetby', 'Ejeren har rettet adressen');
alter table app_v2.shelter_overrides enable trigger app_v2_enforce_capacity_only_shelter_override;

select results_eq(
  $sql$
    select address_line1, postal_code, city
    from app_v2.resolve_retired_shelter_v1(
      (select slug from retired_fixture where id = '82000000-0000-0000-0000-000000000014'))
  $sql$,
  $sql$ values ('Rettetvej 9'::text, '9964'::text, 'Rettetby'::text) $sql$,
  'a removed registration shows the corrected address'
);
select ok(
  exists (
    select 1 from app_v2.retired_shelter_path_hashes_v1()
    where path_hash = (select slug_hash from retired_fixture where id = '82000000-0000-0000-0000-000000000014')
  ),
  'a corrected removed registration stays in the proxy list'
);

-- 5. A capacity override below the public minimum hides it, as in the view.
insert into app_v2.shelter_overrides (shelter_id, capacity, reason)
values ('82000000-0000-0000-0000-000000000011', 20, 'Ejeren har rettet antallet af pladser');
update app_v2.shelter_exclusions set is_active = false
where shelter_id = '82000000-0000-0000-0000-000000000011';

select is(
  (select count(*)::integer from app_v2.resolve_retired_shelter_v1(
    (select slug from retired_fixture where id = '82000000-0000-0000-0000-000000000011'))),
  0,
  'a removed registration corrected below 40 places is not found'
);
select ok(
  not exists (
    select 1 from app_v2.retired_shelter_path_hashes_v1()
    where path_hash = (select slug_hash from retired_fixture where id = '82000000-0000-0000-0000-000000000011')
  ),
  'a removed registration corrected below 40 places is not in the proxy list'
);

-- 6. The helper is private.
select ok(
  not has_function_privilege('anon', 'app_v2.is_shelter_excluded_v1(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'app_v2.is_shelter_excluded_v1(uuid)', 'EXECUTE'),
  'only the server can call the exclusion check directly'
);

select * from finish();
rollback;
