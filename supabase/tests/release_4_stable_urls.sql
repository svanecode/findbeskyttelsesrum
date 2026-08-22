begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_table(
  'app_v2',
  'shelter_slug_aliases',
  'the private shelter URL redirect history exists'
);

select is(
  (select relrowsecurity from pg_class where oid = 'app_v2.shelter_slug_aliases'::regclass),
  true,
  'redirect history has RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'app_v2.shelter_slug_aliases', 'SELECT'),
  'anonymous clients cannot enumerate old shelter URLs'
);

select ok(
  has_table_privilege('service_role', 'app_v2.shelter_slug_aliases', 'SELECT'),
  'the server can resolve old shelter URLs'
);

select has_index(
  'app_v2',
  'shelter_slug_aliases',
  'app_v2_shelter_slug_aliases_shelter_id_idx',
  'redirect targets have a covering foreign-key index'
);

select is(
  app_v2.stable_shelter_slug_v1('70000000-0000-0000-0000-000000000001'),
  'registrering-70000000000000000000000000000001',
  'canonical slugs depend only on the immutable shelter UUID'
);

select ok(
  not has_function_privilege('anon', 'app_v2.stable_shelter_slug_v1(uuid)', 'EXECUTE'),
  'anonymous clients cannot call the private slug helper'
);

insert into app_v2.municipalities (id, code, slug, name)
values (
  '71000000-0000-0000-0000-000000000001',
  '9977',
  'release-4-test-kommune',
  'Release 4 Test Kommune'
);

insert into app_v2.shelters (
  id,
  municipality_id,
  slug,
  name,
  address_line1,
  postal_code,
  city,
  capacity,
  status,
  summary,
  publication_state,
  canonical_source_name,
  canonical_source_reference
) values (
  '70000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  'address-based-import-slug',
  'Release 4 URL test',
  'Historikvej 1',
  '9977',
  'Testby',
  60,
  'active',
  'Release 4 URL test',
  'withheld',
  'release-4-test',
  'stable-url-record'
);

select is(
  (select slug from app_v2.shelters where id = '70000000-0000-0000-0000-000000000001'),
  'registrering-70000000000000000000000000000001',
  'new shelters receive a stable canonical slug before insertion'
);

update app_v2.shelters
set slug = 'changed-address-import-slug',
    address_line1 = 'Ny Historikvej 2'
where id = '70000000-0000-0000-0000-000000000001';

select is(
  (select slug from app_v2.shelters where id = '70000000-0000-0000-0000-000000000001'),
  'registrering-70000000000000000000000000000001',
  'address updates cannot change the canonical public URL'
);

insert into app_v2.shelter_slug_aliases (alias_slug, shelter_id)
values (
  'old-address-public-slug',
  '70000000-0000-0000-0000-000000000001'
);

select is(
  (
    select shelter.slug
    from app_v2.shelter_slug_aliases alias
    join app_v2.shelters shelter on shelter.id = alias.shelter_id
    where alias.alias_slug = 'old-address-public-slug'
  ),
  'registrering-70000000000000000000000000000001',
  'an old public URL resolves to the stable canonical URL'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'app_v2.shelters'::regclass
      and tgname = 'app_v2_enforce_stable_shelter_slug'
      and not tgisinternal
  ),
  'the stable-slug invariant is protected by a database trigger'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'app_v2'
      and tablename = 'shelter_slug_aliases'
      and policyname = 'private_by_default'
  ),
  'redirect history has an explicit anonymous deny policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'app_v2'
      and tablename = 'shelter_slug_aliases'
      and policyname = 'app_v2_shelter_slug_aliases_service_only'
  ),
  'redirect history has an explicit service-role policy'
);

select * from finish();

rollback;
