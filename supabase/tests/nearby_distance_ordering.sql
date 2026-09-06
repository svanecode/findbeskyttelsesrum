begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into app_v2.municipalities (id, code, slug, name)
values ('45000000-0000-0000-0000-000000000001', '9984', 'nearest-test', 'Nearest Test');
insert into app_v2.application_code_eligibility (
  source_name, application_code, label, is_nearby_eligible, rule_source
) values ('datafordeler-bbr-dar', '996', 'Nearest test', true, 'nearest-test');

insert into app_v2.shelters (
  id, municipality_id, slug, name, address_line1, postal_code, city,
  latitude, longitude, capacity, status, summary, source_application_code, publication_state
) values
  ('46000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001',
   'north', 'North', 'North 1', '9984', 'Test', 55.6861, 12.5683, 80, 'active', 'Test', '996', 'published'),
  ('46000000-0000-0000-0000-000000000002', '45000000-0000-0000-0000-000000000001',
   'east', 'East', 'East 1', '9984', 'Test', 55.6761, 12.5833, 80, 'active', 'Test', '996', 'published');

set local role anon;

select is((select results->0->>'id'
  from app_v2.get_nearby_shelters_public_v2(55.6761, 12.5683, 5000, 1, 1)),
  '46000000-0000-0000-0000-000000000002',
  'a one-candidate budget retains the physically nearest registration at Danish latitude');
select ok((select (results->0->>'distance_meters')::numeric between 940 and 941
  from app_v2.get_nearby_shelters_public_v2(55.6761, 12.5683, 5000, 1, 1)),
  'the retained eastern registration is approximately 940m away');
select is((select diagnostics->>'candidateRowsRead'
  from app_v2.get_nearby_shelters_public_v2(55.6761, 12.5683, 5000, 1, 1)), '1',
  'candidate diagnostics respect the requested budget');
select is((select results->1->>'id'
  from app_v2.get_nearby_shelters_public_v2(55.6761, 12.5683, 5000, 2, 2)),
  '46000000-0000-0000-0000-000000000001',
  'a larger budget returns the more distant northern registration second');

reset role;
select * from finish();
rollback;
