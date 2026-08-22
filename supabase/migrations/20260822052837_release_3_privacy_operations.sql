-- Release 3 separates untrusted browser metrics from trusted operational
-- heartbeats and gives every free-text or identifying moderation field a
-- bounded retention rule. All new operational objects remain service-only.

delete from app_v2.product_metrics_hourly
where event_name = 'monitor_heartbeat';

alter table app_v2.product_metrics_hourly
drop constraint if exists product_metrics_hourly_event_name_check;

alter table app_v2.product_metrics_hourly
add constraint product_metrics_hourly_event_name_check check (
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
    'data_explanation_opened'
  )
);

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
    'data_explanation_opened'
  ) then
    raise exception 'unsupported product metric';
  end if;

  if p_duration_ms is not null then
    if p_duration_ms < 0 or p_duration_ms > 120000 then
      raise exception 'duration must be between 0 and 120000 milliseconds';
    end if;
    v_duration_ms := round(p_duration_ms / 250.0)::integer * 250;
  end if;

  insert into app_v2.product_metrics_hourly (
    metric_hour,
    event_name,
    event_count,
    duration_total_ms,
    duration_sample_count,
    updated_at
  ) values (
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
    'latestHour', max(metrics.metric_hour)
  )
  from app_v2.product_metrics_hourly metrics
  where metrics.metric_hour >= now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 2), 24)));
$$;

create table app_v2.operational_heartbeats (
  id bigint generated always as identity primary key,
  source text not null check (source in ('github-production-smoke', 'manual-release')),
  run_identifier text not null check (length(run_identifier) between 1 and 128),
  git_sha text check (git_sha is null or git_sha ~ '^[0-9a-f]{40}$'),
  status text not null check (status in ('ok', 'degraded', 'error')),
  checked_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (source, run_identifier)
);

create index app_v2_operational_heartbeats_checked_at_idx
on app_v2.operational_heartbeats (checked_at desc);

alter table app_v2.operational_heartbeats enable row level security;
revoke all on table app_v2.operational_heartbeats from public, anon, authenticated;
grant select, insert, update, delete on table app_v2.operational_heartbeats to service_role;
grant usage, select on sequence app_v2.operational_heartbeats_id_seq to service_role;

create policy app_v2_operational_heartbeats_service_only
on app_v2.operational_heartbeats
for all
to service_role
using (true)
with check (true);

create or replace function app_v2.record_operational_heartbeat_v1(
  p_source text,
  p_run_identifier text,
  p_git_sha text,
  p_status text default 'ok',
  p_checked_at timestamptz default timezone('utc', now())
)
returns bigint
language plpgsql
volatile
security invoker
set search_path = app_v2, pg_temp
as $$
declare
  heartbeat_id bigint;
begin
  if p_source not in ('github-production-smoke', 'manual-release') then
    raise exception 'unsupported operational heartbeat source';
  end if;
  if length(trim(coalesce(p_run_identifier, ''))) not between 1 and 128 then
    raise exception 'invalid operational run identifier';
  end if;
  if p_git_sha is not null and p_git_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'invalid operational git sha';
  end if;
  if p_status not in ('ok', 'degraded', 'error') then
    raise exception 'unsupported operational heartbeat status';
  end if;
  if p_checked_at > timezone('utc', now()) + interval '5 minutes'
    or p_checked_at < timezone('utc', now()) - interval '24 hours' then
    raise exception 'operational heartbeat timestamp is outside the accepted window';
  end if;

  insert into app_v2.operational_heartbeats (
    source,
    run_identifier,
    git_sha,
    status,
    checked_at
  ) values (
    p_source,
    trim(p_run_identifier),
    p_git_sha,
    p_status,
    p_checked_at
  )
  on conflict (source, run_identifier) do update
  set
    git_sha = excluded.git_sha,
    status = excluded.status,
    checked_at = excluded.checked_at
  returning id into heartbeat_id;

  delete from app_v2.operational_heartbeats
  where checked_at < date_trunc('day', timezone('utc', now())) - interval '90 days';

  return heartbeat_id;
end;
$$;

revoke all on function app_v2.record_operational_heartbeat_v1(
  text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function app_v2.record_operational_heartbeat_v1(
  text, text, text, text, timestamptz
) to service_role;

create or replace function app_v2.get_operational_health_v1(
  p_max_age_minutes integer default 90
)
returns jsonb
language sql
stable
security invoker
set search_path = app_v2, pg_temp
as $$
  with bounds as (
    select greatest(15, least(coalesce(p_max_age_minutes, 90), 1440)) as max_age_minutes
  ), latest as (
    select heartbeat.*
    from app_v2.operational_heartbeats heartbeat
    order by heartbeat.checked_at desc, heartbeat.id desc
    limit 1
  )
  select jsonb_build_object(
    'heartbeatFound', latest.id is not null,
    'source', latest.source,
    'runIdentifier', latest.run_identifier,
    'gitSha', latest.git_sha,
    'status', latest.status,
    'checkedAt', latest.checked_at,
    'ageMinutes', case
      when latest.checked_at is null then null
      else round((extract(epoch from (timezone('utc', now()) - latest.checked_at)) / 60.0)::numeric, 1)
    end,
    'maximumAgeMinutes', bounds.max_age_minutes,
    'isFresh', coalesce(
      latest.status = 'ok'
      and latest.checked_at >= timezone('utc', now()) - make_interval(mins => bounds.max_age_minutes),
      false
    )
  )
  from bounds
  left join latest on true;
$$;

revoke all on function app_v2.get_operational_health_v1(integer)
from public, anon, authenticated;
grant execute on function app_v2.get_operational_health_v1(integer)
to service_role;

alter table app_v2.shelter_reports
add column if not exists text_retention_until timestamptz,
add column if not exists text_redacted_at timestamptz;

update app_v2.shelter_reports
set text_retention_until = created_at + interval '24 months'
where text_retention_until is null;

alter table app_v2.shelter_reports
alter column text_retention_until
set default (timezone('utc', now()) + interval '24 months');

alter table app_v2.shelter_reports
alter column text_retention_until set not null;

create index app_v2_shelter_reports_text_retention_idx
on app_v2.shelter_reports (text_retention_until)
where text_redacted_at is null;

create or replace function app_v2.redact_expired_personal_data_v1()
returns jsonb
language plpgsql
volatile
security definer
set search_path = app_v2, pg_temp
as $$
declare
  contact_count integer := 0;
  report_text_count integer := 0;
  audit_redaction_count integer := 0;
  audit_deletion_count integer := 0;
  product_metric_deletion_count integer := 0;
  heartbeat_deletion_count integer := 0;
begin
  update app_v2.shelter_reports report
  set
    contact_email = null,
    contact_redacted_at = coalesce(report.contact_redacted_at, timezone('utc', now()))
  where report.contact_email is not null
    and (
      report.status in ('resolved', 'rejected')
      or report.contact_retention_until <= timezone('utc', now())
    );
  get diagnostics contact_count = row_count;

  update app_v2.shelter_reports report
  set
    message = '[redacted after retention]',
    resolution_note = null,
    text_redacted_at = timezone('utc', now())
  where report.text_redacted_at is null
    and report.text_retention_until <= timezone('utc', now());
  get diagnostics report_text_count = row_count;

  update app_v2.audit_events event
  set
    actor_identifier = null,
    payload = event.payload - array[
      'note',
      'provider_subject',
      'email',
      'contact_email',
      'address',
      'latitude',
      'longitude',
      'coordinates',
      'userId'
    ]
  where event.created_at <= timezone('utc', now()) - interval '24 months'
    and (
      event.actor_identifier is not null
      or event.payload ?| array[
        'note',
        'provider_subject',
        'email',
        'contact_email',
        'address',
        'latitude',
        'longitude',
        'coordinates',
        'userId'
      ]
    );
  get diagnostics audit_redaction_count = row_count;

  delete from app_v2.audit_events event
  where event.created_at <= timezone('utc', now()) - interval '5 years';
  get diagnostics audit_deletion_count = row_count;

  delete from app_v2.product_metrics_hourly metrics
  where metrics.metric_hour < date_trunc('day', timezone('utc', now())) - interval '90 days';
  get diagnostics product_metric_deletion_count = row_count;

  delete from app_v2.operational_heartbeats heartbeat
  where heartbeat.checked_at < date_trunc('day', timezone('utc', now())) - interval '90 days';
  get diagnostics heartbeat_deletion_count = row_count;

  return jsonb_build_object(
    'contactsRedacted', contact_count,
    'reportTextsRedacted', report_text_count,
    'auditEventsRedacted', audit_redaction_count,
    'auditEventsDeleted', audit_deletion_count,
    'productMetricsDeleted', product_metric_deletion_count,
    'operationalHeartbeatsDeleted', heartbeat_deletion_count
  );
end;
$$;

revoke all on function app_v2.redact_expired_personal_data_v1()
from public, anon, authenticated;
grant execute on function app_v2.redact_expired_personal_data_v1()
to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'app-v2-redact-expired-report-contacts';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  select jobid into existing_job_id
  from cron.job
  where jobname = 'app-v2-redact-expired-personal-data';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'app-v2-redact-expired-personal-data',
    '17 3 * * *',
    'select app_v2.redact_expired_personal_data_v1();'
  );
end;
$$;

comment on table app_v2.operational_heartbeats is
'Private, trusted heartbeats written only by authenticated server-side operations. Retained for at most 90 days.';
comment on function app_v2.record_operational_heartbeat_v1(
  text, text, text, text, timestamptz
) is
'Service-only heartbeat writer. Browser and anonymous API roles cannot forge operational health.';
comment on function app_v2.get_operational_health_v1(integer) is
'Service-only semantic health summary used by the public health endpoint and external monitor.';
comment on function app_v2.redact_expired_personal_data_v1() is
'Daily bounded-retention cleanup for report contact/text, audit identifiers, metrics and trusted heartbeats.';
