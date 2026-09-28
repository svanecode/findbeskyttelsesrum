begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, aud, role, email)
values ('96000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'exclusion-fixture@example.invalid');
insert into app_v2.moderator_accounts (auth_user_id, provider, provider_subject, provider_login)
values ('96000000-0000-4000-8000-000000000001', 'github', 'exclusion-fixture', 'exclusion-fixture');
insert into app_v2.municipalities (id, code, slug, name)
values ('96000000-0000-4000-8000-000000000002', '9997', 'exclusion-fixture', 'Exclusion fixture');
insert into app_v2.shelters (
  id, municipality_id, slug, name, address_line1, postal_code, city, capacity, status, summary,
  canonical_source_name, canonical_source_reference
) values
  ('96000000-0000-4000-8000-000000000003', '96000000-0000-4000-8000-000000000002', 'exclusion-reported',
   'Reported', 'Rapportvej 1', '9997', 'Testby', 40, 'active', 'Fixture', 'datafordeler-bbr-dar', 'excl-ref-1'),
  ('96000000-0000-4000-8000-000000000005', '96000000-0000-4000-8000-000000000002', 'exclusion-address',
   'Address', 'Adressevej 2', '9997', 'Testby', 40, 'active', 'Fixture', 'datafordeler-bbr-dar', 'excl-ref-2');
insert into app_v2.application_code_eligibility (source_name, application_code, label, is_nearby_eligible)
values ('datafordeler-bbr-dar', '997', 'Exclusion fixture', true)
on conflict (source_name, application_code) do update set is_nearby_eligible = true;
update app_v2.shelters set source_application_code = '997', import_state = 'active', publication_state = 'published'
where id = '96000000-0000-4000-8000-000000000005';
select ok(exists (select 1 from app_v2.shelter_public_v2 where id = '96000000-0000-4000-8000-000000000005'),
  'the address fixture is public before it is excluded');

insert into app_v2.shelter_reports (id, shelter_id, report_type, message, status)
values ('96000000-0000-4000-8000-000000000004', '96000000-0000-4000-8000-000000000003', 'other', 'Findes ikke længere', 'open');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"96000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
select is((select resolution_outcome from app_v2.moderate_shelter_report_v1(
  '96000000-0000-4000-8000-000000000004', 'exclude', 'Bygningen er revet ned')), 'excluded',
  'a moderator can exclude a registration from a report');
reset role;
select is((select source from app_v2.shelter_exclusions
  where shelter_id = '96000000-0000-4000-8000-000000000003'), 'moderator_report',
  'the exclusion records that it came from a moderated report');

insert into app_v2.shelter_exclusions (address_line1, postal_code, city, source)
values (' adressevej  2 ', '9997', 'TESTBY', 'manual');
select is((select shelter_id from app_v2.shelter_exclusions where source = 'manual'),
  '96000000-0000-4000-8000-000000000005'::uuid,
  'an address-only exclusion is pinned to the single shelter it matches');
select is((select canonical_source_reference from app_v2.shelter_exclusions where source = 'manual'),
  'excl-ref-2', 'the pinned exclusion also carries the source identity');

update app_v2.shelters set address_line1 = 'Omdøbtvej 2'
where id = '96000000-0000-4000-8000-000000000005';
select ok(not exists (select 1 from app_v2.shelter_public_v2 where id = '96000000-0000-4000-8000-000000000005'),
  'the exclusion still applies after the importer rewrites the address');

insert into app_v2.shelters (
  id, municipality_id, slug, name, address_line1, postal_code, city, capacity, status, summary
) values
  ('96000000-0000-4000-8000-000000000006', '96000000-0000-4000-8000-000000000002', 'exclusion-twin-a',
   'Twin', 'Tvillingvej 3', '9997', 'Testby', 40, 'active', 'Fixture'),
  ('96000000-0000-4000-8000-000000000007', '96000000-0000-4000-8000-000000000002', 'exclusion-twin-b',
   'Twin', 'Tvillingvej 3', '9997', 'Testby', 40, 'active', 'Fixture');
insert into app_v2.shelter_exclusions (address_line1, postal_code, source)
values ('Tvillingvej 3', '9997', 'other');
select is((select shelter_id from app_v2.shelter_exclusions where source = 'other'), null::uuid,
  'an ambiguous address is not pinned to an arbitrary shelter');

select throws_ok($sql$
  insert into app_v2.shelter_exclusions (legacy_bygning_id, source) values ('legacy-only', 'legacy_excluded_shelters')
$sql$, '23514', null, 'an active exclusion the public view would ignore is rejected');
select lives_ok($sql$
  insert into app_v2.shelter_exclusions (legacy_bygning_id, source, is_active)
  values ('legacy-only', 'legacy_excluded_shelters', false)
$sql$, 'inactive legacy records can still be kept for history');

select * from finish();
rollback;
