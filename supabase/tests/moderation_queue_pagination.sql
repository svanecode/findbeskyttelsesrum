begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

select ok(not has_function_privilege('anon', 'app_v2.list_shelter_reports_for_moderation_v2(text,integer,integer)', 'EXECUTE'), 'anonymous callers cannot list report pages');
select ok(not has_function_privilege('anon', 'app_v2.list_privacy_contact_cases_for_moderation_v2(text,integer,integer)', 'EXECUTE'), 'anonymous callers cannot list contact pages');

truncate app_v2.shelter_reports, app_v2.privacy_contact_cases cascade;

insert into auth.users (id, aud, role, email)
values ('94000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'queue-fixture@example.invalid');
insert into app_v2.moderator_accounts (auth_user_id, provider, provider_subject, provider_login)
values ('94000000-0000-4000-8000-000000000001', 'github', 'queue-fixture', 'queue-fixture');
insert into app_v2.municipalities (id, code, slug, name)
values ('94000000-0000-4000-8000-000000000002', '9998', 'queue-fixture', 'Queue fixture');
insert into app_v2.shelters (id, municipality_id, slug, name, address_line1, postal_code, city, capacity, status, summary)
values ('94000000-0000-4000-8000-000000000003', '94000000-0000-4000-8000-000000000002', 'queue-fixture', 'queue-fixture', 'Testvej 1', '9998', 'Testby', 40, 'active', 'Queue fixture');

insert into app_v2.shelter_reports (shelter_id, report_type, message, status)
select '94000000-0000-4000-8000-000000000003', 'other', 'Pagination test report ' || n,
  case when n = 261 then 'reviewing' else 'open' end
from generate_series(1, 261) n;

insert into app_v2.privacy_contact_cases (reference, access_token_hash, category, subject, status)
select 'FBR-2026-' || translate(lpad(n::text, 8, '0'), '0123456789', 'ABCDEFGHJK'), repeat('a', 64), 'other', 'Pagination test case ' || n,
  case when n = 261 then 'closed' else 'open' end
from generate_series(1, 261) n;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"94000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
select throws_ok('select app_v2.list_shelter_reports_for_moderation_v2()', '42501', 'moderator MFA required', 'report pagination still requires MFA');
select throws_ok('select app_v2.list_privacy_contact_cases_for_moderation_v2()', '42501', 'moderator MFA required', 'contact pagination still requires MFA');

select set_config('request.jwt.claims', '{"sub":"94000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
create temp table report_pages as
select app_v2.list_shelter_reports_for_moderation_v2(null, 250, 1) as first_page,
  app_v2.list_shelter_reports_for_moderation_v2(null, 250, 2) as second_page,
  app_v2.list_shelter_reports_for_moderation_v2('reviewing', 50, 1) as filtered;

select is((first_page->>'totalCount')::integer, 261, 'report total includes records past the old cap') from report_pages;
select is(jsonb_array_length(first_page->'rows'), 250, 'first report page is bounded') from report_pages;
select is(jsonb_array_length(second_page->'rows'), 11, 'remaining reports can be fetched on page two') from report_pages;
select is(jsonb_array_length(filtered->'rows'), 1, 'reviewing filter reaches the report behind 260 open reports') from report_pages;
select is((filtered->'counts'->>'open')::integer, 260, 'report status counts are independent of selected filter') from report_pages;
select is((filtered->'rows'->0->>'report_status'), 'reviewing', 'the report filter is applied in the database') from report_pages;
select is((
  select count(*)::integer from report_pages,
  jsonb_array_elements(first_page->'rows') first_row,
  jsonb_array_elements(second_page->'rows') second_row
  where first_row->>'report_id' = second_row->>'report_id'
), 0, 'stable report pagination has no overlapping rows');

create temp table contact_pages as
select app_v2.list_privacy_contact_cases_for_moderation_v2(null, 250, 2) as second_page,
  app_v2.list_privacy_contact_cases_for_moderation_v2('closed', 50, 1) as filtered;
select is(jsonb_array_length(second_page->'rows'), 11, 'remaining contacts can be fetched on page two') from contact_pages;
select is((second_page->>'totalCount')::integer, 261, 'contact total covers the whole queue') from contact_pages;
select is(jsonb_array_length(filtered->'rows'), 1, 'closed-case filter reaches the case behind 260 open cases') from contact_pages;
select is(filtered->'rows'->0->>'case_status', 'closed', 'closed cases remain accessible for deletion and reopening') from contact_pages;
select is((filtered->'counts'->>'open')::integer, 260, 'contact counts are independent of selected filter') from contact_pages;
select is((app_v2.list_privacy_contact_cases_for_moderation_v2(null, 250, 999)->>'page')::integer, 2, 'an out-of-range page is clamped to the final page');
select throws_ok('select app_v2.list_shelter_reports_for_moderation_v2(null, 251, 1)', '22023', 'invalid queue pagination', 'oversized pages are rejected');

reset role;
select * from finish();
rollback;
