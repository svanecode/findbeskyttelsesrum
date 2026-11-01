begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

-- Privileges: the history tables are private; only the narrow lookups are public.
select ok(
  not has_table_privilege('anon', 'app_v2.shelter_path_aliases', 'SELECT'),
  'anonymous clients cannot enumerate readable path history'
);
select ok(
  not has_table_privilege('anon', 'app_v2.postal_areas', 'SELECT'),
  'the postcode table itself is private'
);
select ok(
  has_table_privilege('anon', 'app_v2.postal_area_public_v1', 'SELECT'),
  'postcodes with a position are public'
);
select ok(
  not has_table_privilege('anon', 'app_v2.registration_duplicate_review_v1', 'SELECT'),
  'the duplicate review list is internal'
);
select ok(
  has_function_privilege('anon', 'app_v2.resolve_shelter_path_alias_v1(text)', 'EXECUTE')
  and has_function_privilege('anon', 'app_v2.resolve_retired_shelter_v1(text)', 'EXECUTE'),
  'the page can resolve old paths and removed registrations'
);
select ok(
  not has_function_privilege('anon', 'app_v2.refresh_shelter_path_aliases_v1()', 'EXECUTE')
  and not has_function_privilege('anon', 'app_v2.upsert_dar_postal_areas_v1(jsonb)', 'EXECUTE'),
  'only the server can write path history and postcodes'
);

-- Same rules as slugifyDanish in src/lib/shelter-public-url.ts.
select is(
  app_v2.readable_shelter_base_slug_v1('Ryesgade 18', '8000', 'Aarhus C'),
  'ryesgade-18-8000-aarhus-c',
  'readable paths use address, postcode and town'
);
select is(
  app_v2.readable_shelter_base_slug_v1('Åbyhøj Ærøvej 3', '8230', 'Åbyhøj'),
  'aabyhoej-aeroevej-3-8230-aabyhoej',
  'æ, ø and å become ae, oe and aa'
);

insert into app_v2.municipalities (id, code, slug, name)
values ('81000000-0000-0000-0000-000000000001', '9966', 'sti-test-kommune', 'Sti Test Kommune');

insert into app_v2.shelters (
  id, municipality_id, slug, name, address_line1, postal_code, city, latitude, longitude,
  capacity, status, summary, publication_state, import_state, source_application_code,
  canonical_source_name, canonical_source_reference
) values
  ('80000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'x', 'A',
   'Stivej 1', '9966', 'Testby', 56.100000, 10.100000, 200, 'active', 'A', 'published', 'active', '321',
   'datafordeler-bbr-dar', 'building-a'),
  ('80000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000001', 'y', 'B',
   'Stivej 1', '9966', 'Testby', 56.100010, 10.100010, 60, 'active', 'B', 'published', 'active', '321',
   'datafordeler-bbr-dar', 'building-b'),
  ('80000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000001', 'z', 'C',
   'Stivej 3', '9966', 'Testby', 56.100100, 10.100100, 200, 'active', 'C', 'published', 'active', '322',
   'datafordeler-bbr-dar', 'building-c');

-- Make the test rows public whatever the publication triggers did.
update app_v2.shelters
set publication_state = 'published', import_state = 'active'
where id::text like '80000000-%';

select app_v2.refresh_shelter_path_aliases_v1();

select is(
  (select path_slug from app_v2.shelter_path_aliases where shelter_id = '80000000-0000-0000-0000-000000000001' and valid_to is null),
  'stivej-1-9966-testby',
  'the registration with most places keeps the plain path'
);
select is(
  (select path_slug from app_v2.shelter_path_aliases where shelter_id = '80000000-0000-0000-0000-000000000002' and valid_to is null),
  'stivej-1-9966-testby-800000',
  'another registration at the address adds a short id'
);

-- The address changes in BBR: the old path stays as an alias.
update app_v2.shelters set address_line1 = 'Nyvej 3' where id = '80000000-0000-0000-0000-000000000003';
select app_v2.refresh_shelter_path_aliases_v1();

select isnt(
  (select valid_to from app_v2.shelter_path_aliases where path_slug = 'stivej-3-9966-testby'),
  null,
  'the old path is closed with a valid_to date'
);
select is(
  (select path_slug from app_v2.shelter_path_aliases where shelter_id = '80000000-0000-0000-0000-000000000003' and valid_to is null),
  'nyvej-3-9966-testby',
  'the new path is current'
);
select is(
  (select stable_slug from app_v2.resolve_shelter_path_alias_v1('stivej-3-9966-testby')),
  (select slug from app_v2.shelters where id = '80000000-0000-0000-0000-000000000003'),
  'the old path still finds the registration'
);

-- The registration disappears from BBR.
update app_v2.shelters set import_state = 'missing_from_source' where id = '80000000-0000-0000-0000-000000000003';
select app_v2.refresh_shelter_path_aliases_v1();

select is(
  (select count(*)::integer from app_v2.resolve_shelter_path_alias_v1('nyvej-3-9966-testby')),
  0,
  'a removed registration is no longer redirected'
);
select is(
  (select address_line1 from app_v2.resolve_retired_shelter_v1('nyvej-3-9966-testby')),
  'Nyvej 3',
  'its last readable path finds the last address'
);
select is(
  (select address_line1 from app_v2.resolve_retired_shelter_v1('stivej-3-9966-testby')),
  'Nyvej 3',
  'an older readable path finds it too'
);
select is(
  (select address_line1 from app_v2.resolve_retired_shelter_v1(
    (select slug from app_v2.shelters where id = '80000000-0000-0000-0000-000000000003'))),
  'Nyvej 3',
  'the stable hash URL finds it too'
);
select ok(
  exists (
    select 1 from app_v2.retired_shelter_path_hashes_v1()
    where path_hash = encode(sha256(convert_to('nyvej-3-9966-testby', 'UTF8')), 'hex')
  ),
  'the proxy list holds a hash of the removed registration''s path'
);
select is(
  (select count(*)::integer from app_v2.resolve_retired_shelter_v1('stivej-1-9966-testby')),
  0,
  'a registration that still exists is not reported as removed'
);

-- Postcodes: DAR supplies every postcode, registrations supply positions.
select app_v2.upsert_dar_postal_areas_v1('[
  {"postnr": "9966", "name": "Testby", "latitude": 56.5, "longitude": 10.5},
  {"postnr": "9967", "name": "Tomby", "latitude": 56.6, "longitude": 10.6},
  {"postnr": "99", "name": "Ugyldig"}
]'::jsonb);
select app_v2.refresh_postal_areas_from_registrations_v1();

select is(
  (select round(latitude::numeric, 4) from app_v2.postal_area_public_v1 where postnr = '9966'),
  56.1000::numeric,
  'a postcode with registrations uses their position'
);
select is(
  (select has_registrations from app_v2.postal_area_public_v1 where postnr = '9967'),
  false,
  'a postcode without registrations is still public with its DAR position'
);
select is(
  (select count(*)::integer from app_v2.postal_areas where postnr = '99'),
  0,
  'invalid postcodes are ignored'
);

-- Municipality codes from DAR/BBR are added to every postcode, also one with registrations.
select app_v2.upsert_dar_postal_areas_v1('[
  {"postnr": "9966", "name": "Testby", "municipality_codes": ["0999"]},
  {"postnr": "9967", "name": "Tomby", "municipality_codes": ["0825", "x", "0825"]}
]'::jsonb);
select is(
  (select municipality_codes from app_v2.postal_area_public_v1 where postnr = '9967'),
  array['0825']::text[],
  'a postcode without registrations gets its municipality code from DAR, invalid codes dropped'
);
select is(
  (select municipality_codes from app_v2.postal_area_public_v1 where postnr = '9966'),
  array['0999', '9966']::text[],
  'a postcode with registrations keeps the codes its registrations give and gets the DAR code added'
);
select app_v2.upsert_dar_postal_areas_v1('[{"postnr": "9967", "name": "Tomby"}]'::jsonb);
select is(
  (select municipality_codes from app_v2.postal_area_public_v1 where postnr = '9967'),
  array['0825']::text[],
  'a later run without codes keeps the known ones'
);
select app_v2.upsert_dar_postal_areas_v1('[{"postnr": "9967", "name": "Tomby", "municipality_codes": ["0813"]}]'::jsonb);
select is(
  (select municipality_codes from app_v2.postal_area_public_v1 where postnr = '9967'),
  array['0813', '0825']::text[],
  'codes found in a later run are added, so a postcode across a border gets both municipalities'
);

-- A postcode across a municipal border: DAR found both sides, the
-- registrations are on one side only. Refreshing from registrations adds
-- their codes to the known ones instead of replacing them.
insert into app_v2.municipalities (id, code, slug, name)
values
  ('81000000-0000-0000-0000-000000000101', '0101', 'graense-test-0101', 'Grænse Test 0101'),
  ('81000000-0000-0000-0000-000000000147', '0147', 'graense-test-0147', 'Grænse Test 0147')
on conflict do nothing;
select app_v2.upsert_dar_postal_areas_v1('[
  {"postnr": "9968", "name": "Grænseby", "latitude": 55.7, "longitude": 12.5, "municipality_codes": ["0101", "0147"]}
]'::jsonb);
insert into app_v2.shelters (
  id, municipality_id, slug, name, address_line1, postal_code, city, latitude, longitude,
  capacity, status, summary, publication_state, import_state, source_application_code,
  canonical_source_name, canonical_source_reference
) values
  ('80000000-0000-0000-0000-000000000004', (select id from app_v2.municipalities where code = '0101'),
   'graense', 'D', 'Grænsevej 1', '9968', 'Grænseby', 55.700000, 12.500000, 100, 'active', 'D',
   'published', 'active', '321', 'datafordeler-bbr-dar', 'building-d');
update app_v2.shelters
set publication_state = 'published', import_state = 'active'
where id = '80000000-0000-0000-0000-000000000004';
select app_v2.refresh_postal_areas_from_registrations_v1();
select is(
  (select municipality_codes from app_v2.postal_areas where postnr = '9968'),
  array['0101', '0147']::text[],
  'a postcode across a municipal border keeps both codes after a refresh from registrations'
);
select is(
  (select has_registrations from app_v2.postal_areas where postnr = '9968'),
  true,
  'the postcode now has registrations'
);

-- A registered postcode gets a DAR code from the other municipality but
-- keeps the position of its registrations.
select app_v2.upsert_dar_postal_areas_v1('[
  {"postnr": "9968", "name": "Grænseby", "latitude": 57.5, "longitude": 9.0, "municipality_codes": ["0153"]}
]'::jsonb);
select is(
  (select municipality_codes from app_v2.postal_areas where postnr = '9968'),
  array['0101', '0147', '0153']::text[],
  'a registered postcode gets the DAR code from the other side of the border'
);
select is(
  (select array[round(latitude::numeric, 4), round(longitude::numeric, 4)]::text || position_source
   from app_v2.postal_areas where postnr = '9968'),
  '{55.7000,12.5000}registrations',
  'a registered postcode keeps the position of its registrations'
);

-- A broken batch from the importer.
select throws_ok(
  $$select app_v2.upsert_dar_postal_areas_v1(null)$$,
  '22023',
  null,
  'a missing list of postcodes is refused'
);
select app_v2.upsert_dar_postal_areas_v1('[
  {"postnr": "9969", "name": "Udland", "latitude": 48.85, "longitude": 2.35},
  {"postnr": "9970", "name": "Indland", "latitude": 56.2, "longitude": 9.5}
]'::jsonb);
select is(
  (select array_agg(postnr order by postnr) from app_v2.postal_areas where postnr in ('9969', '9970')),
  array['9970']::text[],
  'a postcode with a position outside Denmark is skipped, the rest of the batch is saved'
);

-- Different buildings, same places, a few metres apart, different addresses.
update app_v2.shelters
set address_line1 = 'Stivej 5', postal_code = '9966', latitude = 56.100050, longitude = 10.100050,
    capacity = 200, import_state = 'active'
where id = '80000000-0000-0000-0000-000000000003';

select is(
  (select count(*)::integer from app_v2.registration_duplicate_review_v1
   where first_shelter_id = '80000000-0000-0000-0000-000000000001'
     and second_shelter_id = '80000000-0000-0000-0000-000000000003'),
  1,
  'possible duplicates on two addresses are listed with a reason for review'
);
select is(
  (select same_address from app_v2.registration_duplicate_review_v1
   where first_shelter_id = '80000000-0000-0000-0000-000000000001'
     and second_shelter_id = '80000000-0000-0000-0000-000000000003'),
  false,
  'the review list says whether the pair shares an address'
);

select * from finish();

rollback;
