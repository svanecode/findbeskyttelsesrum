-- Privacy-safe operational product metrics. Only fixed event names and hourly
-- counters are stored; there are no user identifiers, IP addresses, URLs,
-- search terms, addresses or coordinates in this model.
create table if not exists app_v2.product_metrics_hourly (
  metric_hour timestamptz not null,
  event_name text not null,
  event_count bigint not null default 0 check (event_count >= 0),
  duration_total_ms bigint not null default 0 check (duration_total_ms >= 0),
  duration_sample_count bigint not null default 0 check (duration_sample_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (metric_hour, event_name),
  constraint product_metrics_hourly_event_name_check check (
    event_name in (
      'address_search_started',
      'address_search_error',
      'address_selected',
      'geolocation_requested',
      'geolocation_succeeded',
      'geolocation_denied',
      'geolocation_error',
      'nearby_results_loaded',
      'nearby_no_results',
      'nearby_error',
      'map_opened',
      'detail_opened',
      'report_started',
      'report_submitted',
      'report_error',
      'client_error',
      'data_explanation_opened',
      'monitor_heartbeat'
    )
  )
);

alter table app_v2.product_metrics_hourly enable row level security;

revoke all on table app_v2.product_metrics_hourly from public, anon, authenticated;
grant select, insert, update, delete on table app_v2.product_metrics_hourly to service_role;

drop policy if exists product_metrics_hourly_private on app_v2.product_metrics_hourly;
create policy product_metrics_hourly_private
on app_v2.product_metrics_hourly
for all
to anon, authenticated
using (false)
with check (false);

create or replace function app_v2.record_product_metric_v1(
  p_event_name text,
  p_duration_ms integer default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = app_v2, pg_temp
as $$
declare
  v_metric_hour timestamptz := date_trunc('hour', now());
  v_duration_ms integer;
begin
  if p_event_name is null or p_event_name not in (
    'address_search_started',
    'address_search_error',
    'address_selected',
    'geolocation_requested',
    'geolocation_succeeded',
    'geolocation_denied',
    'geolocation_error',
    'nearby_results_loaded',
    'nearby_no_results',
    'nearby_error',
    'map_opened',
    'detail_opened',
    'report_started',
    'report_submitted',
    'report_error',
    'client_error',
    'data_explanation_opened',
    'monitor_heartbeat'
  ) then
    raise exception 'unsupported product metric';
  end if;

  if p_duration_ms is not null then
    if p_duration_ms < 0 or p_duration_ms > 120000 then
      raise exception 'duration must be between 0 and 120000 milliseconds';
    end if;
    -- Reduce precision before storage so timings cannot become fingerprints.
    v_duration_ms := round(p_duration_ms / 250.0)::integer * 250;
  end if;

  insert into app_v2.product_metrics_hourly (
    metric_hour,
    event_name,
    event_count,
    duration_total_ms,
    duration_sample_count,
    updated_at
  )
  values (
    v_metric_hour,
    p_event_name,
    1,
    coalesce(v_duration_ms, 0),
    case when v_duration_ms is null then 0 else 1 end,
    now()
  )
  on conflict (metric_hour, event_name) do update
  set
    event_count = app_v2.product_metrics_hourly.event_count + 1,
    duration_total_ms = app_v2.product_metrics_hourly.duration_total_ms + excluded.duration_total_ms,
    duration_sample_count = app_v2.product_metrics_hourly.duration_sample_count + excluded.duration_sample_count,
    updated_at = now();

  delete from app_v2.product_metrics_hourly
  where metric_hour < date_trunc('day', now()) - interval '90 days';
end;
$$;

revoke all on function app_v2.record_product_metric_v1(text, integer) from public, anon, authenticated;
grant execute on function app_v2.record_product_metric_v1(text, integer) to service_role;

create or replace function app_v2.get_product_metrics_summary_v1(p_days integer default 30)
returns table (
  event_name text,
  event_count bigint,
  duration_total_ms bigint,
  duration_sample_count bigint
)
language sql
stable
security invoker
set search_path = app_v2, pg_temp
as $$
  select
    metrics.event_name,
    sum(metrics.event_count)::bigint,
    sum(metrics.duration_total_ms)::bigint,
    sum(metrics.duration_sample_count)::bigint
  from app_v2.product_metrics_hourly metrics
  where metrics.metric_hour >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)))
  group by metrics.event_name
  order by metrics.event_name;
$$;

revoke all on function app_v2.get_product_metrics_summary_v1(integer) from public, anon, authenticated;
grant execute on function app_v2.get_product_metrics_summary_v1(integer) to service_role;

create or replace function app_v2.get_product_metrics_health_v1(p_hours integer default 2)
returns jsonb
language sql
stable
security invoker
set search_path = app_v2, pg_temp
as $$
  select jsonb_build_object(
    'windowHours', greatest(1, least(coalesce(p_hours, 2), 24)),
    'eventCount', coalesce(sum(metrics.event_count), 0),
    'errorCount', coalesce(sum(metrics.event_count) filter (
      where metrics.event_name in ('address_search_error', 'geolocation_error', 'nearby_error', 'report_error', 'client_error')
    ), 0),
    'heartbeatCount', coalesce(sum(metrics.event_count) filter (
      where metrics.event_name = 'monitor_heartbeat'
    ), 0),
    'latestHour', max(metrics.metric_hour)
  )
  from app_v2.product_metrics_hourly metrics
  where metrics.metric_hour >= now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 2), 24)));
$$;

revoke all on function app_v2.get_product_metrics_health_v1(integer) from public, anon, authenticated;
grant execute on function app_v2.get_product_metrics_health_v1(integer) to service_role;

comment on table app_v2.product_metrics_hourly is
'Private hourly counters for a fixed event allowlist, retained for at most 90 days. Deliberately contains no per-user or location data.';
comment on function app_v2.record_product_metric_v1(text, integer) is
'Service-only atomic increment for privacy-safe hourly product counters.';
comment on function app_v2.get_product_metrics_summary_v1(integer) is
'Service-only aggregate used by the MFA-protected operational dashboard.';
comment on function app_v2.get_product_metrics_health_v1(integer) is
'Service-only aggregate used by the free scheduled production alarm.';

-- The derived marker and sitemap views only read already-public, allowlisted
-- views. Run these layers with the caller's privileges instead of the owner's.
alter view app_v2.country_marker_public set (security_invoker = true);
alter view app_v2.sitemap_shelter_public set (security_invoker = true);
alter view app_v2.country_marker_public_v2 set (security_invoker = true);
alter view app_v2.sitemap_shelter_public_v2 set (security_invoker = true);

-- Make the intended denial on private operational tables explicit. This does
-- not grant access; table privileges remain revoked and service_role retains
-- the server-side access it already had.
do $$
declare
  v_schema text;
  v_table text;
begin
  for v_schema, v_table in
    select * from (values
      ('app_v2', 'application_code_eligibility'),
      ('app_v2', 'audit_events'),
      ('app_v2', 'dataset_publication_shelters'),
      ('app_v2', 'dataset_publications'),
      ('app_v2', 'import_runs'),
      ('app_v2', 'import_shelter_candidates'),
      ('app_v2', 'moderator_accounts'),
      ('app_v2', 'rate_limit_buckets'),
      ('app_v2', 'shelter_exclusions'),
      ('app_v2', 'shelter_overrides'),
      ('app_v2', 'shelter_reports'),
      ('public', 'global_progress')
    ) as private_tables(schema_name, table_name)
  loop
    if to_regclass(format('%I.%I', v_schema, v_table)) is not null then
      execute format(
        'drop policy if exists private_by_default on %I.%I',
        v_schema,
        v_table
      );
      execute format(
        'create policy private_by_default on %I.%I for all to anon, authenticated using (false) with check (false)',
        v_schema,
        v_table
      );
    end if;
  end loop;
end;
$$;
