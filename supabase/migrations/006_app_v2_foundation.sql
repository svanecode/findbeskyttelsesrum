create extension if not exists pgcrypto;

create schema if not exists app_v2;

grant usage on schema app_v2 to anon, authenticated, service_role;

create or replace function app_v2.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists app_v2.municipalities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  region_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app_v2.import_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_url text,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  records_seen integer not null default 0,
  records_upserted integer not null default 0,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  error_summary text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app_v2.shelters (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references app_v2.municipalities(id) on delete restrict,
  slug text not null unique,
  name text not null,
  address_line1 text not null,
  postal_code text not null,
  city text not null,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  capacity integer not null default 0 check (capacity >= 0),
  status text not null check (status in ('active', 'temporarily_closed', 'under_review')),
  accessibility_notes text,
  summary text not null,
  source_summary text not null default '',
  is_featured boolean not null default false,
  featured_rank integer,
  import_state text not null default 'active' check (import_state in ('active', 'missing_from_source', 'suppressed')),
  last_seen_at timestamptz,
  last_imported_at timestamptz,
  canonical_source_name text,
  canonical_source_reference text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app_v2.shelter_sources (
  id uuid primary key default gen_random_uuid(),
  shelter_id uuid not null references app_v2.shelters(id) on delete cascade,
  import_run_id uuid references app_v2.import_runs(id) on delete set null,
  source_name text not null,
  source_url text,
  source_type text not null check (source_type in ('official', 'municipality', 'manual', 'other')),
  source_reference text,
  last_verified_at timestamptz,
  imported_at timestamptz not null default timezone('utc', now()),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (shelter_id, source_name, source_reference)
);

create table if not exists app_v2.shelter_overrides (
  id uuid primary key default gen_random_uuid(),
  shelter_id uuid not null references app_v2.shelters(id) on delete cascade,
  name text,
  address_line1 text,
  postal_code text,
  city text,
  capacity integer check (capacity >= 0),
  status text check (status in ('active', 'temporarily_closed', 'under_review')),
  accessibility_notes text,
  summary text,
  reason text not null,
  is_active boolean not null default true,
  effective_from timestamptz not null default timezone('utc', now()),
  effective_until timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app_v2.shelter_reports (
  id uuid primary key default gen_random_uuid(),
  shelter_id uuid not null references app_v2.shelters(id) on delete cascade,
  report_type text not null check (report_type in ('incorrect_address', 'unavailable', 'incorrect_capacity', 'duplicate_record', 'other')),
  message text not null,
  contact_email text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app_v2.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null,
  actor_identifier text,
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists app_v2_municipalities_slug_idx on app_v2.municipalities (slug);
create index if not exists app_v2_shelters_slug_idx on app_v2.shelters (slug);
create index if not exists app_v2_shelters_municipality_id_idx on app_v2.shelters (municipality_id);
create index if not exists app_v2_shelters_featured_rank_idx on app_v2.shelters (is_featured, featured_rank);
create index if not exists app_v2_shelters_import_state_idx on app_v2.shelters (import_state);
create index if not exists app_v2_shelters_last_seen_at_idx on app_v2.shelters (last_seen_at desc);
create unique index if not exists app_v2_shelters_canonical_source_identity_idx
on app_v2.shelters (canonical_source_name, canonical_source_reference)
where canonical_source_name is not null
  and canonical_source_reference is not null;
create index if not exists app_v2_shelter_sources_shelter_id_idx on app_v2.shelter_sources (shelter_id);
create index if not exists app_v2_shelter_sources_import_run_id_idx on app_v2.shelter_sources (import_run_id);
create index if not exists app_v2_shelter_sources_last_verified_at_idx on app_v2.shelter_sources (last_verified_at desc);
create index if not exists app_v2_shelter_reports_shelter_id_idx on app_v2.shelter_reports (shelter_id);
create index if not exists app_v2_shelter_reports_status_idx on app_v2.shelter_reports (status);
create index if not exists app_v2_shelter_overrides_shelter_id_idx on app_v2.shelter_overrides (shelter_id);
create index if not exists app_v2_shelter_overrides_active_idx on app_v2.shelter_overrides (shelter_id, is_active);
create unique index if not exists app_v2_shelter_overrides_one_active_idx
on app_v2.shelter_overrides (shelter_id)
where is_active = true;
create index if not exists app_v2_audit_events_entity_idx on app_v2.audit_events (entity_type, entity_id);
create index if not exists app_v2_import_runs_started_at_idx on app_v2.import_runs (started_at desc);

create trigger app_v2_set_municipalities_updated_at
before update on app_v2.municipalities
for each row
execute function app_v2.set_updated_at();

create trigger app_v2_set_import_runs_updated_at
before update on app_v2.import_runs
for each row
execute function app_v2.set_updated_at();

create trigger app_v2_set_shelters_updated_at
before update on app_v2.shelters
for each row
execute function app_v2.set_updated_at();

create trigger app_v2_set_shelter_sources_updated_at
before update on app_v2.shelter_sources
for each row
execute function app_v2.set_updated_at();

create trigger app_v2_set_shelter_overrides_updated_at
before update on app_v2.shelter_overrides
for each row
execute function app_v2.set_updated_at();

create trigger app_v2_set_shelter_reports_updated_at
before update on app_v2.shelter_reports
for each row
execute function app_v2.set_updated_at();

alter table app_v2.municipalities enable row level security;
alter table app_v2.import_runs enable row level security;
alter table app_v2.shelters enable row level security;
alter table app_v2.shelter_sources enable row level security;
alter table app_v2.shelter_overrides enable row level security;
alter table app_v2.shelter_reports enable row level security;
alter table app_v2.audit_events enable row level security;

grant select on app_v2.municipalities, app_v2.shelters, app_v2.shelter_sources to anon, authenticated;
grant all privileges on all tables in schema app_v2 to service_role;
grant all privileges on all sequences in schema app_v2 to service_role;
grant execute on function app_v2.set_updated_at() to service_role;

create policy "app_v2 public read municipalities"
on app_v2.municipalities
for select
using (true);

create policy "app_v2 public read shelters"
on app_v2.shelters
for select
using (import_state = 'active');

create policy "app_v2 public read shelter_sources"
on app_v2.shelter_sources
for select
using (
  exists (
    select 1
    from app_v2.shelters
    where app_v2.shelters.id = shelter_sources.shelter_id
      and app_v2.shelters.import_state = 'active'
  )
);
