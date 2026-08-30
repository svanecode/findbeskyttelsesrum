begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select ok(
  not has_table_privilege('anon', 'app_v2.public_data_revisions', 'SELECT'),
  'anonymous clients cannot read the mutable revision ledger'
);

select ok(
  not has_table_privilege('authenticated', 'app_v2.public_data_revisions', 'SELECT'),
  'signed-in clients cannot read the mutable revision ledger'
);

select ok(
  has_function_privilege('anon', 'app_v2.get_public_data_revision_v1()', 'EXECUTE'),
  'anonymous clients can read the public cache tuple'
);

select ok(
  has_function_privilege('authenticated', 'app_v2.get_public_data_revision_v1()', 'EXECUTE'),
  'signed-in clients can read the public cache tuple'
);

select ok(
  has_function_privilege('service_role', 'app_v2.get_public_data_revision_v1()', 'EXECUTE'),
  'service-role clients retain the same read contract'
);

select ok(
  not exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    where procedure.oid = 'app_v2.get_public_data_revision_v1()'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'the implicit PUBLIC role cannot execute the revision RPC'
);

set local role anon;

select is(
  (select count(*)::integer from app_v2.get_public_data_revision_v1()),
  1,
  'the public revision RPC returns exactly one cache tuple when called as anon'
);

reset role;

select is(
  (select revision from app_v2.get_public_data_revision_v1()),
  (select revision from app_v2.public_data_revisions where scope = 'public'),
  'the public revision matches the private ledger'
);

select is(
  (select publication_id from app_v2.get_public_data_revision_v1()),
  (select publication_id from app_v2.public_data_revisions where scope = 'public'),
  'the public publication identity matches the private ledger'
);

select ok(
  not has_table_privilege('anon', 'app_v2.shelter_slug_aliases', 'SELECT'),
  'anonymous clients cannot enumerate the private shelter alias ledger'
);

select ok(
  has_function_privilege('anon', 'app_v2.resolve_public_shelter_slug_alias_v1(text)', 'EXECUTE'),
  'anonymous clients can resolve one historical public URL'
);

select ok(
  has_function_privilege('authenticated', 'app_v2.resolve_public_shelter_slug_alias_v1(text)', 'EXECUTE'),
  'signed-in clients can resolve one historical public URL'
);

select ok(
  not exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    where procedure.oid = 'app_v2.resolve_public_shelter_slug_alias_v1(text)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'the implicit PUBLIC role cannot execute the alias RPC'
);

insert into app_v2.municipalities (id, code, slug, name)
values (
  '52000000-0000-0000-0000-000000000001',
  '9985',
  'public-alias-test-kommune',
  'Public Alias Test Kommune'
);

insert into app_v2.application_code_eligibility (
  source_name,
  application_code,
  label,
  is_nearby_eligible,
  rule_source
) values (
  'datafordeler-bbr-dar',
  '996',
  'Public alias regression',
  true,
  'public_alias_regression'
) on conflict (source_name, application_code) do update
set is_nearby_eligible = true;

insert into app_v2.shelters (
  id,
  municipality_id,
  slug,
  name,
  address_line1,
  postal_code,
  city,
  latitude,
  longitude,
  capacity,
  status,
  summary,
  source_application_code,
  publication_state,
  canonical_source_name,
  canonical_source_reference
) values
  (
    '53000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    'ignored-public-alias-test-slug',
    'Public alias test',
    'Aliasvej 1',
    '9985',
    'Testby',
    -44.000000,
    -121.000000,
    80,
    'active',
    'Public alias regression',
    '996',
    'published',
    'public-alias-regression',
    'published-target'
  ),
  (
    '53000000-0000-0000-0000-000000000002',
    '52000000-0000-0000-0000-000000000001',
    'ignored-withheld-alias-test-slug',
    'Withheld alias test',
    'Aliasvej 2',
    '9985',
    'Testby',
    -44.100000,
    -121.100000,
    80,
    'active',
    'Withheld alias regression',
    '996',
    'withheld',
    'public-alias-regression',
    'withheld-target'
  );

insert into app_v2.shelter_slug_aliases (alias_slug, shelter_id)
values
  ('historisk-public-alias', '53000000-0000-0000-0000-000000000001'),
  ('historisk-withheld-alias', '53000000-0000-0000-0000-000000000002');

set local role anon;

select is(
  (
    select canonical_slug
    from app_v2.resolve_public_shelter_slug_alias_v1('historisk-public-alias')
  ),
  'registrering-53000000000000000000000000000001',
  'a historical URL resolves to the stable slug of a still-public registration'
);

select is(
  (
    select count(*)::integer
    from app_v2.resolve_public_shelter_slug_alias_v1('historisk-withheld-alias')
  ),
  0,
  'a historical URL never resolves a withheld registration'
);

reset role;

select * from finish();

rollback;
