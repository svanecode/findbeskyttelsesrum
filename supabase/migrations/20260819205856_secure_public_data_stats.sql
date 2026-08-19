-- Keep the anonymous statistics endpoint on the same explicit public read
-- models as the rest of the application. Internal funnel stages are exposed
-- only through a service-role RPC with invoker rights.
drop view if exists app_v2.public_data_stats_v1;

create view app_v2.public_data_stats_v1
with (security_barrier = true, security_invoker = true)
as
with public_stats as (
  select
    count(*)::bigint as public_registrations,
    coalesce(sum(capacity), 0)::bigint as public_capacity,
    max(last_imported_at) as latest_public_import_at
  from app_v2.shelter_public_v2
),
map_stats as (
  select
    count(*)::bigint as mapped_registrations,
    coalesce(sum(capacity), 0)::bigint as mapped_capacity
  from app_v2.country_marker_public_v2
)
select
  public_stats.public_registrations,
  public_stats.public_capacity,
  map_stats.mapped_registrations,
  map_stats.mapped_capacity,
  public_stats.latest_public_import_at
from public_stats
cross join map_stats;

revoke all on table app_v2.public_data_stats_v1 from public;
grant select on table app_v2.public_data_stats_v1 to anon, authenticated, service_role;

comment on view app_v2.public_data_stats_v1 is
'Security-invoker aggregate read model over the explicit public registration and marker views.';

create or replace function app_v2.get_public_data_funnel_v1()
returns table (
  active_source_registrations bigint,
  active_source_capacity bigint,
  capacity_threshold_registrations bigint,
  capacity_threshold_capacity bigint,
  application_eligible_registrations bigint,
  application_eligible_capacity bigint,
  published_registrations bigint,
  published_capacity bigint
)
language sql
stable
security invoker
set search_path = app_v2, pg_temp
as $$
  with
  active as (
    select s.*
    from app_v2.shelters s
    where s.import_state = 'active'
  ),
  capacity_eligible as (
    select s.*
    from active s
    where s.capacity >= 40
      and s.source_application_code is not null
  ),
  application_eligible as (
    select s.*
    from capacity_eligible s
    inner join app_v2.application_code_eligibility e
      on e.source_name = 'datafordeler-bbr-dar'
     and e.application_code = s.source_application_code
     and e.is_nearby_eligible = true
  ),
  published as (
    select s.*
    from application_eligible s
    where s.publication_state = 'published'
  )
  select
    (select count(*) from active)::bigint,
    (select coalesce(sum(capacity), 0) from active)::bigint,
    (select count(*) from capacity_eligible)::bigint,
    (select coalesce(sum(capacity), 0) from capacity_eligible)::bigint,
    (select count(*) from application_eligible)::bigint,
    (select coalesce(sum(capacity), 0) from application_eligible)::bigint,
    (select count(*) from published)::bigint,
    (select coalesce(sum(capacity), 0) from published)::bigint;
$$;

revoke all on function app_v2.get_public_data_funnel_v1()
from public, anon, authenticated;
grant execute on function app_v2.get_public_data_funnel_v1()
to service_role;

comment on function app_v2.get_public_data_funnel_v1() is
'Returns non-identifying selection-stage totals for the public data explanation. Callable only by the server-side service role.';
