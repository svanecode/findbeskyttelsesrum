alter table app_v2.shelters
add column if not exists source_application_code text;

comment on column app_v2.shelters.source_application_code is
'Source-backed building/application usage code from the official source, currently Datafordeler BBR byg021BygningensAnvendelse when imported.';

create index if not exists app_v2_shelters_source_application_code_idx
on app_v2.shelters (source_application_code)
where source_application_code is not null;

create table if not exists app_v2.application_code_eligibility (
  source_name text not null,
  application_code text not null,
  label text,
  is_nearby_eligible boolean not null,
  rule_source text not null default 'legacy_public_anvendelseskoder',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (source_name, application_code)
);

comment on table app_v2.application_code_eligibility is
'Narrow app_v2 nearby eligibility reference for source-backed application/building usage codes. This mirrors the reviewed legacy skal_med rule by code, without inferring eligibility from address or capacity.';

comment on column app_v2.application_code_eligibility.source_name is
'Source namespace for application_code. The first supported source is datafordeler-bbr-dar / BBR byg021BygningensAnvendelse.';

comment on column app_v2.application_code_eligibility.is_nearby_eligible is
'Whether app_v2 nearby should include rows with this source application code when source_application_code_v1 eligibility is active.';

drop trigger if exists app_v2_set_application_code_eligibility_updated_at
on app_v2.application_code_eligibility;

create trigger app_v2_set_application_code_eligibility_updated_at
before update on app_v2.application_code_eligibility
for each row
execute function app_v2.set_updated_at();

alter table app_v2.application_code_eligibility enable row level security;

grant select on app_v2.application_code_eligibility to service_role;
grant all privileges on app_v2.application_code_eligibility to service_role;

do $$
begin
  if to_regclass('public.anvendelseskoder') is not null then
    insert into app_v2.application_code_eligibility (
      source_name,
      application_code,
      label,
      is_nearby_eligible,
      rule_source,
      notes
    )
    select
      'datafordeler-bbr-dar',
      kode::text,
      beskrivelse::text,
      coalesce(skal_med, false),
      'legacy_public_anvendelseskoder',
      'Seeded from public.anvendelseskoder for app_v2 nearby parity. The code itself is expected to come from source-backed BBR byg021BygningensAnvendelse.'
    from public.anvendelseskoder
    where kode is not null
    on conflict (source_name, application_code) do update
      set label = excluded.label,
          is_nearby_eligible = excluded.is_nearby_eligible,
          rule_source = excluded.rule_source,
          notes = excluded.notes;
  end if;
end;
$$;
