-- Release 2 keeps the public municipality and map read paths bounded. The
-- summary table is refreshed transactionally whenever a source that affects
-- the public read boundary changes. A separate monotonically increasing
-- revision makes application caches deterministic across imports, moderation,
-- exclusions and rollbacks.

create table app_v2.municipality_summary_public_v1 (
  municipality_id uuid primary key
    references app_v2.municipalities(id) on delete cascade,
  code text,
  slug text not null unique,
  name text not null,
  description text,
  region_name text,
  public_registration_count bigint not null default 0
    check (public_registration_count >= 0),
  public_capacity bigint not null default 0
    check (public_capacity >= 0),
  mapped_registration_count bigint not null default 0
    check (mapped_registration_count >= 0),
  mapped_capacity bigint not null default 0
    check (mapped_capacity >= 0),
  latest_public_import_at timestamptz,
  refreshed_at timestamptz not null default timezone('utc', now())
);

alter table app_v2.municipality_summary_public_v1 enable row level security;

create policy app_v2_municipality_summary_public_read
on app_v2.municipality_summary_public_v1
for select
to anon, authenticated
using (true);

revoke all on table app_v2.municipality_summary_public_v1
from public, anon, authenticated;
grant select on table app_v2.municipality_summary_public_v1
to anon, authenticated, service_role;
grant insert, update, delete on table app_v2.municipality_summary_public_v1
to service_role;

create table app_v2.public_data_revisions (
  scope text primary key check (scope = 'public'),
  revision bigint not null default 1 check (revision > 0),
  publication_id uuid references app_v2.dataset_publications(id) on delete set null,
  changed_at timestamptz not null default timezone('utc', now())
);

alter table app_v2.public_data_revisions enable row level security;
revoke all on table app_v2.public_data_revisions
from public, anon, authenticated;
grant select, insert, update, delete on table app_v2.public_data_revisions
to service_role;

create or replace function app_v2.refresh_municipality_summary_public_v1()
returns void
language plpgsql
volatile
security definer
set search_path = app_v2, pg_temp
as $$
begin
  insert into app_v2.municipality_summary_public_v1 (
    municipality_id,
    code,
    slug,
    name,
    description,
    region_name,
    public_registration_count,
    public_capacity,
    mapped_registration_count,
    mapped_capacity,
    latest_public_import_at,
    refreshed_at
  )
  select
    municipality.id,
    municipality.code,
    municipality.slug,
    municipality.name,
    municipality.description,
    municipality.region_name,
    coalesce(summary.public_registration_count, 0),
    coalesce(summary.public_capacity, 0),
    coalesce(summary.mapped_registration_count, 0),
    coalesce(summary.mapped_capacity, 0),
    summary.latest_public_import_at,
    timezone('utc', now())
  from app_v2.municipalities municipality
  left join (
    select
      shelter.municipality_id,
      count(*)::bigint as public_registration_count,
      coalesce(sum(shelter.capacity), 0)::bigint as public_capacity,
      count(*) filter (
        where shelter.latitude is not null and shelter.longitude is not null
      )::bigint as mapped_registration_count,
      coalesce(sum(shelter.capacity) filter (
        where shelter.latitude is not null and shelter.longitude is not null
      ), 0)::bigint as mapped_capacity,
      max(shelter.last_imported_at) as latest_public_import_at
    from app_v2.shelter_public_v2 shelter
    group by shelter.municipality_id
  ) summary on summary.municipality_id = municipality.id
  on conflict (municipality_id) do update
  set
    code = excluded.code,
    slug = excluded.slug,
    name = excluded.name,
    description = excluded.description,
    region_name = excluded.region_name,
    public_registration_count = excluded.public_registration_count,
    public_capacity = excluded.public_capacity,
    mapped_registration_count = excluded.mapped_registration_count,
    mapped_capacity = excluded.mapped_capacity,
    latest_public_import_at = excluded.latest_public_import_at,
    refreshed_at = excluded.refreshed_at;

  delete from app_v2.municipality_summary_public_v1 summary
  where not exists (
    select 1
    from app_v2.municipalities municipality
    where municipality.id = summary.municipality_id
  );
end;
$$;

revoke all on function app_v2.refresh_municipality_summary_public_v1()
from public, anon, authenticated;
grant execute on function app_v2.refresh_municipality_summary_public_v1()
to service_role;

create or replace function app_v2.bump_public_data_revision_v1()
returns void
language plpgsql
volatile
security definer
set search_path = app_v2, pg_temp
as $$
declare
  current_publication_id uuid;
begin
  select publication.id
  into current_publication_id
  from app_v2.dataset_publications publication
  where publication.source_name = 'datafordeler-bbr-dar'
    and publication.is_current = true
  order by publication.published_at desc, publication.created_at desc
  limit 1;

  insert into app_v2.public_data_revisions (
    scope,
    revision,
    publication_id,
    changed_at
  ) values (
    'public',
    1,
    current_publication_id,
    timezone('utc', now())
  )
  on conflict (scope) do update
  set
    revision = app_v2.public_data_revisions.revision + 1,
    publication_id = excluded.publication_id,
    changed_at = excluded.changed_at;
end;
$$;

revoke all on function app_v2.bump_public_data_revision_v1()
from public, anon, authenticated;
grant execute on function app_v2.bump_public_data_revision_v1()
to service_role;

create or replace function app_v2.refresh_public_read_caches_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = app_v2, pg_temp
as $$
begin
  perform app_v2.refresh_municipality_summary_public_v1();
  perform app_v2.bump_public_data_revision_v1();
  return null;
end;
$$;

create or replace function app_v2.bump_public_data_revision_trigger_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = app_v2, pg_temp
as $$
begin
  perform app_v2.bump_public_data_revision_v1();
  return null;
end;
$$;

revoke all on function app_v2.refresh_public_read_caches_v1()
from public, anon, authenticated;
revoke all on function app_v2.bump_public_data_revision_trigger_v1()
from public, anon, authenticated;

create trigger app_v2_refresh_public_caches_from_municipalities
after insert or update or delete on app_v2.municipalities
for each statement execute function app_v2.refresh_public_read_caches_v1();

create trigger app_v2_refresh_public_caches_from_shelters
after insert or update or delete on app_v2.shelters
for each statement execute function app_v2.refresh_public_read_caches_v1();

create trigger app_v2_refresh_public_caches_from_exclusions
after insert or update or delete on app_v2.shelter_exclusions
for each statement execute function app_v2.refresh_public_read_caches_v1();

create trigger app_v2_refresh_public_caches_from_overrides
after insert or update or delete on app_v2.shelter_overrides
for each statement execute function app_v2.refresh_public_read_caches_v1();

create trigger app_v2_refresh_public_caches_from_eligibility
after insert or update or delete on app_v2.application_code_eligibility
for each statement execute function app_v2.refresh_public_read_caches_v1();

create trigger app_v2_bump_public_revision_from_publications
after insert or update or delete on app_v2.dataset_publications
for each statement execute function app_v2.bump_public_data_revision_trigger_v1();

select app_v2.refresh_municipality_summary_public_v1();
select app_v2.bump_public_data_revision_v1();

drop view app_v2.public_data_stats_v1;

create view app_v2.public_data_stats_v1
with (security_barrier = true, security_invoker = true)
as
select
  coalesce(sum(summary.public_registration_count), 0)::bigint as public_registrations,
  coalesce(sum(summary.public_capacity), 0)::bigint as public_capacity,
  coalesce(sum(summary.mapped_registration_count), 0)::bigint as mapped_registrations,
  coalesce(sum(summary.mapped_capacity), 0)::bigint as mapped_capacity,
  max(summary.latest_public_import_at) as latest_public_import_at
from app_v2.municipality_summary_public_v1 summary;

revoke all on table app_v2.public_data_stats_v1 from public;
grant select on table app_v2.public_data_stats_v1
to anon, authenticated, service_role;

comment on table app_v2.municipality_summary_public_v1 is
'Small transactionally refreshed public aggregate. Public page requests never scan the shelter read model for municipality totals.';
comment on table app_v2.public_data_revisions is
'Private monotonic revision for deterministic public-data cache identity across imports and moderation.';
comment on function app_v2.refresh_municipality_summary_public_v1() is
'Recomputes the bounded municipality aggregate inside the same transaction as a public-data mutation.';
comment on view app_v2.public_data_stats_v1 is
'Security-invoker global totals over the bounded municipality summary table.';
