-- Aggregates for the private /admin/statistik page. The page authorizes an
-- allowlisted aal2 moderator first and then calls this with the service role,
-- like the existing 30-day product metric summary. Only counts and durations
-- leave the database: no report text, contact messages or identities.
create or replace function app_v2.get_admin_statistics_v1(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select
      greatest(7, least(coalesce(p_days, 30), 90)) as days,
      (timezone('Europe/Copenhagen', now()))::date as today
  ),
  calendar as (
    select generate_series(bounds.today - (bounds.days - 1), bounds.today, interval '1 day')::date as day
    from bounds
  ),
  daily_metrics as (
    select
      (timezone('Europe/Copenhagen', metrics.metric_hour))::date as day,
      sum(metrics.event_count) filter (where metrics.event_name in ('address_search_started', 'geolocation_requested')) as searches,
      sum(metrics.event_count) filter (where metrics.event_name in ('address_selected', 'geolocation_succeeded')) as areas_chosen,
      sum(metrics.event_count) filter (where metrics.event_name = 'nearby_results_loaded') as results_loaded,
      sum(metrics.event_count) filter (where metrics.event_name = 'nearby_no_results') as no_results,
      sum(metrics.event_count) filter (where metrics.event_name in (
        'address_search_error', 'geolocation_error', 'nearby_error', 'report_error', 'client_error'
      )) as errors,
      sum(metrics.event_count) filter (where metrics.event_name = 'map_opened') as maps_opened,
      sum(metrics.event_count) filter (where metrics.event_name = 'detail_opened') as details_opened,
      sum(metrics.duration_total_ms) filter (where metrics.event_name = 'nearby_results_loaded') as load_ms_total,
      sum(metrics.duration_sample_count) filter (where metrics.event_name = 'nearby_results_loaded') as load_samples
    from app_v2.product_metrics_hourly metrics, bounds
    where metrics.metric_hour >= timezone('Europe/Copenhagen', (bounds.today - (bounds.days - 1))::timestamp)
    group by 1
  ),
  weeks as (
    select generate_series(
      date_trunc('week', timezone('Europe/Copenhagen', now()))::date - 77,
      date_trunc('week', timezone('Europe/Copenhagen', now()))::date,
      interval '7 days'
    )::date as week
  ),
  reports as (
    select
      report.report_type,
      report.resolution_outcome,
      report.status,
      date_trunc('week', timezone('Europe/Copenhagen', report.created_at))::date as received_week,
      case when report.status in ('resolved', 'rejected') and report.reviewed_at is not null
        then date_trunc('week', timezone('Europe/Copenhagen', report.reviewed_at))::date end as closed_week,
      case when report.status in ('resolved', 'rejected') and report.reviewed_at is not null
        then extract(epoch from report.reviewed_at - report.created_at) / 3600 end as hours_to_close
    from app_v2.shelter_reports report
  ),
  contacts as (
    select
      contact_case.status,
      contact_case.response_due_at,
      date_trunc('week', timezone('Europe/Copenhagen', contact_case.created_at))::date as received_week,
      (
        select extract(epoch from min(message.created_at) - contact_case.created_at) / 3600
        from app_v2.privacy_contact_messages message
        where message.case_id = contact_case.id and message.author_type = 'moderator'
      ) as hours_to_first_reply
    from app_v2.privacy_contact_cases contact_case
  )
  select jsonb_build_object(
    'days', (select days from bounds),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', calendar.day,
        'searches', coalesce(daily_metrics.searches, 0),
        'areasChosen', coalesce(daily_metrics.areas_chosen, 0),
        'resultsLoaded', coalesce(daily_metrics.results_loaded, 0),
        'noResults', coalesce(daily_metrics.no_results, 0),
        'errors', coalesce(daily_metrics.errors, 0),
        'mapsOpened', coalesce(daily_metrics.maps_opened, 0),
        'detailsOpened', coalesce(daily_metrics.details_opened, 0),
        'loadMsTotal', coalesce(daily_metrics.load_ms_total, 0),
        'loadSamples', coalesce(daily_metrics.load_samples, 0)
      ) order by calendar.day), '[]'::jsonb)
      from calendar
      left join daily_metrics on daily_metrics.day = calendar.day
    ),
    'reports', jsonb_build_object(
      'weekly', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'week', weeks.week,
          'received', (select count(*) from reports where reports.received_week = weeks.week),
          'closed', (select count(*) from reports where reports.closed_week = weeks.week)
        ) order by weeks.week), '[]'::jsonb)
        from weeks
      ),
      'byType', (
        select coalesce(jsonb_object_agg(grouped.report_type, grouped.total), '{}'::jsonb)
        from (select report_type, count(*) as total from reports group by report_type) grouped
      ),
      'byOutcome', (
        select coalesce(jsonb_object_agg(grouped.outcome, grouped.total), '{}'::jsonb)
        from (
          select coalesce(resolution_outcome, status) as outcome, count(*) as total
          from reports where status in ('resolved', 'rejected') group by 1
        ) grouped
      ),
      'active', (select count(*) from reports where status in ('open', 'reviewing')),
      'medianHoursToClose', (
        select percentile_cont(0.5) within group (order by hours_to_close)
        from reports where hours_to_close is not null
      )
    ),
    'contacts', jsonb_build_object(
      'weekly', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'week', weeks.week,
          'received', (select count(*) from contacts where contacts.received_week = weeks.week)
        ) order by weeks.week), '[]'::jsonb)
        from weeks
      ),
      'active', (select count(*) from contacts where status in ('open', 'reviewing')),
      'overdue', (select count(*) from contacts where status in ('open', 'reviewing') and response_due_at < now()),
      'medianHoursToFirstReply', (
        select percentile_cont(0.5) within group (order by hours_to_first_reply)
        from contacts where hours_to_first_reply is not null
      )
    )
  );
$$;

revoke all on function app_v2.get_admin_statistics_v1(integer) from public, anon, authenticated;
grant execute on function app_v2.get_admin_statistics_v1(integer) to service_role;

comment on function app_v2.get_admin_statistics_v1(integer) is
'Service-role-only counts for the MFA-protected statistics page: daily product metrics (Europe/Copenhagen), weekly reports and contact cases, and median handling times. Contains no text or identities.';
