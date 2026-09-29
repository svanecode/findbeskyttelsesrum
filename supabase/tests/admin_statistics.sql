begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select ok(not has_function_privilege('anon', 'app_v2.get_admin_statistics_v1(integer)', 'EXECUTE'),
  'anonymous callers cannot read admin statistics');
select ok(not has_function_privilege('authenticated', 'app_v2.get_admin_statistics_v1(integer)', 'EXECUTE'),
  'signed-in callers go through the server, not PostgREST');

delete from app_v2.product_metrics_hourly;
insert into app_v2.product_metrics_hourly (metric_hour, event_name, event_count, duration_total_ms, duration_sample_count) values
  (date_trunc('hour', now()), 'address_search_started', 5, 0, 0),
  (date_trunc('hour', now()), 'geolocation_requested', 2, 0, 0),
  (date_trunc('hour', now()), 'nearby_results_loaded', 4, 6000, 4),
  (date_trunc('hour', now()), 'client_error', 1, 0, 0),
  (date_trunc('hour', now()) - interval '40 days', 'address_search_started', 99, 0, 0);

truncate app_v2.shelter_reports, app_v2.privacy_contact_cases cascade;
insert into auth.users (id, aud, role, email)
values ('95000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'statistics-fixture@example.invalid');
insert into app_v2.moderator_accounts (id, auth_user_id, provider, provider_subject, provider_login)
values ('95000000-0000-4000-8000-000000000004', '95000000-0000-4000-8000-000000000001', 'github', 'statistics-fixture', 'statistics-fixture');
insert into app_v2.municipalities (id, code, slug, name)
values ('95000000-0000-4000-8000-000000000002', '9997', 'statistics-fixture', 'Statistics fixture');
insert into app_v2.shelters (id, municipality_id, slug, name, address_line1, postal_code, city, capacity, status, summary)
values ('95000000-0000-4000-8000-000000000003', '95000000-0000-4000-8000-000000000002', 'statistics-fixture', 'statistics-fixture', 'Testvej 1', '9997', 'Testby', 40, 'active', 'Statistics fixture');

-- One report received and closed long before the twelve weeks, one inside them, one still open from long ago.
insert into app_v2.shelter_reports (shelter_id, report_type, message, status, created_at)
values
  ('95000000-0000-4000-8000-000000000003', 'incorrect_address', 'Old closed report', 'open', now() - interval '200 days'),
  ('95000000-0000-4000-8000-000000000003', 'other', 'Recent closed report', 'open', now() - interval '3 days'),
  ('95000000-0000-4000-8000-000000000003', 'other', 'Old open report', 'open', now() - interval '200 days');
update app_v2.shelter_reports
set status = 'rejected', resolution_outcome = 'rejected', reviewed_at = created_at + interval '100 hours',
  reviewed_by = '95000000-0000-4000-8000-000000000001'
where message = 'Old closed report';
update app_v2.shelter_reports
set status = 'rejected', resolution_outcome = 'rejected', reviewed_at = created_at + interval '10 hours',
  reviewed_by = '95000000-0000-4000-8000-000000000001'
where message = 'Recent closed report';

insert into app_v2.privacy_contact_cases (id, reference, access_token_hash, category, subject, status, created_at)
values
  ('95000000-0000-4000-8000-000000000005', 'FBR-2026-STATAAAA', repeat('a', 64), 'other', 'Old case', 'open', now() - interval '200 days'),
  ('95000000-0000-4000-8000-000000000006', 'FBR-2026-STATBBBB', repeat('b', 64), 'other', 'Recent case', 'open', now() - interval '3 days');
insert into app_v2.privacy_contact_messages (case_id, author_type, message, moderator_account_id, created_at)
values
  ('95000000-0000-4000-8000-000000000005', 'moderator', 'Old reply', '95000000-0000-4000-8000-000000000004', now() - interval '200 days' + interval '100 hours'),
  ('95000000-0000-4000-8000-000000000006', 'moderator', 'Recent reply', '95000000-0000-4000-8000-000000000004', now() - interval '3 days' + interval '6 hours');

set local role service_role;
create temp table statistics_result as select app_v2.get_admin_statistics_v1(30) as result;
reset role;

select is((select jsonb_array_length(result->'daily') from statistics_result), 30,
  'every day in the window is present, including days without events');
select is((select (result->'daily'->-1->>'searches')::int from statistics_result), 7,
  'address and location searches are combined for today');
select is((select (result->'daily'->-1->>'loadMsTotal')::int / (result->'daily'->-1->>'loadSamples')::int from statistics_result), 1500,
  'load time totals and samples allow an exact daily average');
select is((select (result->'daily'->-1->>'errors')::int from statistics_result), 1,
  'client errors count as technical errors');
select is((select sum((day->>'searches')::int)::int from statistics_result, jsonb_array_elements(result->'daily') day), 7,
  'events older than the window are excluded');
select is((select jsonb_array_length(result->'reports'->'weekly') from statistics_result), 12,
  'reports are summarised over twelve weeks');
select is((select result->'reports'->'byType' from statistics_result), '{"other": 1}'::jsonb,
  'report types count only reports received in the twelve weeks');
select is((select result->'reports'->'byOutcome' from statistics_result), '{"rejected": 1}'::jsonb,
  'outcomes count only reports closed in the twelve weeks');
select is((select (result->'reports'->>'medianHoursToClose')::numeric from statistics_result), 10::numeric,
  'median handling time uses only reports closed in the twelve weeks');
select is((select (result->'reports'->>'active')::int from statistics_result), 1,
  'active reports stay a current count, however old');
select is((select (result->'contacts'->>'medianHoursToFirstReply')::numeric from statistics_result), 6::numeric,
  'median time to first reply uses only cases received in the twelve weeks');
select ok((select result::text !~ 'message|subject|note|email' from statistics_result),
  'the result carries counts only, no report or contact text fields');

select * from finish();
rollback;
