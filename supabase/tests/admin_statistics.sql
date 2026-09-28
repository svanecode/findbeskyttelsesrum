begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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
select ok((select result::text !~ 'message|subject|note|email' from statistics_result),
  'the result carries counts only, no report or contact text fields');

select * from finish();
rollback;
