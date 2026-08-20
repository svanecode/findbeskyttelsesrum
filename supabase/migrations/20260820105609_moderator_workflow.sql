-- Private moderation workflow for public shelter reports.
-- Moderator access is bound to a stable GitHub provider subject, linked to a
-- Supabase Auth user after OAuth, and every read/write RPC enforces MFA (aal2).

create extension if not exists pg_cron;

create table if not exists app_v2.moderator_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  provider text not null check (provider = 'github'),
  provider_subject text not null,
  provider_login text not null,
  role text not null default 'moderator' check (role in ('moderator', 'owner')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_subject)
);

comment on table app_v2.moderator_accounts is
'Private allowlist of moderator identities. Authorization uses the stable OAuth provider subject, never user-editable metadata.';

drop trigger if exists app_v2_set_moderator_accounts_updated_at
on app_v2.moderator_accounts;
create trigger app_v2_set_moderator_accounts_updated_at
before update on app_v2.moderator_accounts
for each row
execute function app_v2.set_updated_at();

alter table app_v2.moderator_accounts enable row level security;
revoke all on table app_v2.moderator_accounts from public, anon, authenticated;
grant all on table app_v2.moderator_accounts to service_role;

-- Initial owner. GitHub's numeric provider subject is stable even if the login
-- is renamed later. The Auth user is linked only after a verified OAuth login.
insert into app_v2.moderator_accounts (
  provider,
  provider_subject,
  provider_login,
  role
)
values ('github', '142318580', 'svanecode', 'owner')
on conflict (provider, provider_subject) do update
set provider_login = excluded.provider_login;

alter table app_v2.shelter_reports
add column if not exists resolution_note text,
add column if not exists resolution_outcome text
  check (resolution_outcome in ('no_change', 'excluded', 'corrected', 'rejected')),
add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
add column if not exists reviewed_at timestamptz,
add column if not exists contact_retention_until timestamptz,
add column if not exists contact_redacted_at timestamptz;

update app_v2.shelter_reports
set contact_retention_until = created_at + interval '90 days'
where contact_retention_until is null;

alter table app_v2.shelter_reports
alter column contact_retention_until
set default (timezone('utc', now()) + interval '90 days');

alter table app_v2.shelter_reports
alter column contact_retention_until set not null;

create index if not exists app_v2_shelter_reports_queue_idx
on app_v2.shelter_reports (status, created_at desc);

create index if not exists app_v2_shelter_reports_contact_retention_idx
on app_v2.shelter_reports (contact_retention_until)
where contact_email is not null;

create or replace function app_v2.link_moderator_identity_v1(
  p_auth_user_id uuid,
  p_provider text,
  p_provider_subject text,
  p_provider_login text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = app_v2, pg_temp
as $$
declare
  linked_account_id uuid;
begin
  if p_auth_user_id is null
    or p_provider <> 'github'
    or nullif(trim(p_provider_subject), '') is null then
    return false;
  end if;

  -- The provider subject is verified against Supabase Auth's private identity
  -- record. Profile/user metadata is deliberately not used for authorization.
  if not exists (
    select 1
    from auth.identities identity_row
    where identity_row.user_id = p_auth_user_id
      and identity_row.provider = p_provider
      and identity_row.provider_id = p_provider_subject
  ) then
    return false;
  end if;

  update app_v2.moderator_accounts account
  set
    auth_user_id = p_auth_user_id,
    provider_login = coalesce(nullif(trim(p_provider_login), ''), account.provider_login)
  where account.provider = p_provider
    and account.provider_subject = p_provider_subject
    and account.is_active = true
    and (account.auth_user_id is null or account.auth_user_id = p_auth_user_id)
  returning account.id into linked_account_id;

  if linked_account_id is null then
    return false;
  end if;

  insert into app_v2.audit_events (
    actor_type,
    actor_identifier,
    entity_type,
    entity_id,
    event_type,
    payload
  ) values (
    'moderator_bootstrap',
    p_auth_user_id::text,
    'moderator_account',
    linked_account_id,
    'moderator_identity_linked',
    jsonb_build_object('provider', p_provider, 'provider_subject', p_provider_subject)
  );

  return true;
end;
$$;

revoke all on function app_v2.link_moderator_identity_v1(uuid, text, text, text)
from public, anon, authenticated;
grant execute on function app_v2.link_moderator_identity_v1(uuid, text, text, text)
to service_role;

create or replace function app_v2.current_moderator_account_id_v1(
  p_require_aal2 boolean default true
)
returns uuid
language sql
stable
security definer
set search_path = app_v2, pg_temp
as $$
  select account.id
  from app_v2.moderator_accounts account
  where account.auth_user_id = (select auth.uid())
    and account.is_active = true
    and (
      not p_require_aal2
      or coalesce((select auth.jwt()->>'aal'), 'aal1') = 'aal2'
    )
  limit 1;
$$;

revoke all on function app_v2.current_moderator_account_id_v1(boolean)
from public, anon, authenticated;

create or replace function app_v2.get_current_moderator_profile_v1()
returns table (
  moderator_id uuid,
  provider_login text,
  moderator_role text,
  assurance_level text
)
language plpgsql
stable
security definer
set search_path = app_v2, pg_temp
as $$
declare
  current_account_id uuid;
begin
  current_account_id := app_v2.current_moderator_account_id_v1(false);
  if current_account_id is null then
    raise exception 'moderator access denied' using errcode = '42501';
  end if;

  return query
  select
    account.id,
    account.provider_login,
    account.role,
    coalesce((select auth.jwt()->>'aal'), 'aal1')
  from app_v2.moderator_accounts account
  where account.id = current_account_id;
end;
$$;

revoke all on function app_v2.get_current_moderator_profile_v1()
from public, anon;
grant execute on function app_v2.get_current_moderator_profile_v1()
to authenticated;

create or replace function app_v2.redact_expired_report_contacts_v1()
returns integer
language plpgsql
volatile
security definer
set search_path = app_v2, pg_temp
as $$
declare
  redacted_count integer;
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

  get diagnostics redacted_count = row_count;
  return redacted_count;
end;
$$;

revoke all on function app_v2.redact_expired_report_contacts_v1()
from public, anon, authenticated;
grant execute on function app_v2.redact_expired_report_contacts_v1()
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

  perform cron.schedule(
    'app-v2-redact-expired-report-contacts',
    '17 3 * * *',
    'select app_v2.redact_expired_report_contacts_v1();'
  );
end;
$$;

create or replace function app_v2.list_shelter_reports_for_moderation_v1(
  p_status text default null,
  p_limit integer default 100
)
returns table (
  report_id uuid,
  report_status text,
  report_type text,
  report_message text,
  contact_email text,
  report_created_at timestamptz,
  report_updated_at timestamptz,
  resolution_note text,
  resolution_outcome text,
  reviewed_at timestamptz,
  shelter_id uuid,
  shelter_slug text,
  address_line1 text,
  postal_code text,
  city text,
  capacity integer,
  publication_state text,
  municipality_name text
)
language plpgsql
stable
security definer
set search_path = app_v2, pg_temp
as $$
begin
  if app_v2.current_moderator_account_id_v1(true) is null then
    raise exception 'moderator MFA required' using errcode = '42501';
  end if;

  if p_status is not null and p_status not in ('open', 'reviewing', 'resolved', 'rejected') then
    raise exception 'unsupported report status';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception 'limit must be between 1 and 250';
  end if;

  return query
  select
    report.id,
    report.status,
    report.report_type,
    report.message,
    case
      when report.status in ('open', 'reviewing')
        and report.contact_retention_until > timezone('utc', now())
      then report.contact_email
      else null
    end,
    report.created_at,
    report.updated_at,
    report.resolution_note,
    report.resolution_outcome,
    report.reviewed_at,
    shelter.id,
    shelter.slug,
    coalesce(override_row.address_line1, shelter.address_line1),
    coalesce(override_row.postal_code, shelter.postal_code),
    coalesce(override_row.city, shelter.city),
    coalesce(override_row.capacity, shelter.capacity),
    shelter.publication_state,
    municipality.name
  from app_v2.shelter_reports report
  join app_v2.shelters shelter on shelter.id = report.shelter_id
  join app_v2.municipalities municipality on municipality.id = shelter.municipality_id
  left join lateral (
    select active_override.*
    from app_v2.shelter_overrides active_override
    where active_override.shelter_id = shelter.id
      and active_override.is_active = true
      and active_override.effective_from <= timezone('utc', now())
      and (
        active_override.effective_until is null
        or active_override.effective_until > timezone('utc', now())
      )
    order by active_override.effective_from desc, active_override.created_at desc
    limit 1
  ) override_row on true
  where p_status is null or report.status = p_status
  order by
    case report.status
      when 'open' then 1
      when 'reviewing' then 2
      when 'resolved' then 3
      else 4
    end,
    report.created_at desc
  limit p_limit;
end;
$$;

revoke all on function app_v2.list_shelter_reports_for_moderation_v1(text, integer)
from public, anon;
grant execute on function app_v2.list_shelter_reports_for_moderation_v1(text, integer)
to authenticated;

create or replace function app_v2.moderate_shelter_report_v1(
  p_report_id uuid,
  p_action text,
  p_note text default null,
  p_address_line1 text default null,
  p_postal_code text default null,
  p_city text default null,
  p_capacity integer default null
)
returns table (
  report_id uuid,
  report_status text,
  resolution_outcome text
)
language plpgsql
volatile
security definer
set search_path = app_v2, pg_temp
as $$
declare
  current_account_id uuid;
  current_user_id uuid;
  current_report app_v2.shelter_reports%rowtype;
  current_shelter app_v2.shelters%rowtype;
  next_status text;
  next_outcome text;
  event_name text;
  normalized_note text;
  data_action_id uuid;
begin
  current_account_id := app_v2.current_moderator_account_id_v1(true);
  current_user_id := auth.uid();
  if current_account_id is null or current_user_id is null then
    raise exception 'moderator MFA required' using errcode = '42501';
  end if;

  if p_action not in ('start_review', 'reopen', 'resolve_no_change', 'reject', 'exclude', 'correct') then
    raise exception 'unsupported moderation action';
  end if;

  normalized_note := nullif(trim(coalesce(p_note, '')), '');
  if p_action in ('resolve_no_change', 'reject', 'exclude', 'correct')
    and (normalized_note is null or length(normalized_note) < 5 or length(normalized_note) > 1000) then
    raise exception 'a moderation note between 5 and 1000 characters is required';
  end if;

  select report.* into current_report
  from app_v2.shelter_reports report
  where report.id = p_report_id
  for update;

  if not found then
    raise exception 'report not found';
  end if;

  if p_action = 'start_review' and current_report.status <> 'open' then
    raise exception 'only open reports can be moved into review';
  end if;

  if p_action = 'reopen' and current_report.status not in ('resolved', 'rejected') then
    raise exception 'only closed reports can be reopened';
  end if;

  if p_action in ('resolve_no_change', 'reject', 'exclude', 'correct')
    and current_report.status not in ('open', 'reviewing') then
    raise exception 'only active reports can be closed';
  end if;

  select shelter.* into current_shelter
  from app_v2.shelters shelter
  where shelter.id = current_report.shelter_id;

  if p_action in ('start_review', 'reopen') then
    next_status := 'reviewing';
    next_outcome := null;
    event_name := case when p_action = 'reopen' then 'shelter_report_reopened' else 'shelter_report_review_started' end;
  elsif p_action = 'reject' then
    next_status := 'rejected';
    next_outcome := 'rejected';
    event_name := 'shelter_report_rejected';
  else
    next_status := 'resolved';
    next_outcome := case p_action
      when 'exclude' then 'excluded'
      when 'correct' then 'corrected'
      else 'no_change'
    end;
    event_name := 'shelter_report_resolved';
  end if;

  if p_action = 'exclude' then
    select exclusion.id into data_action_id
    from app_v2.shelter_exclusions exclusion
    where exclusion.shelter_id = current_report.shelter_id
      and exclusion.is_active = true
    order by exclusion.created_at desc
    limit 1;

    if data_action_id is null then
      insert into app_v2.shelter_exclusions (
        shelter_id,
        canonical_source_name,
        canonical_source_reference,
        address_line1,
        postal_code,
        city,
        reason,
        notes,
        source,
        is_active,
        created_by,
        updated_by
      ) values (
        current_shelter.id,
        current_shelter.canonical_source_name,
        current_shelter.canonical_source_reference,
        current_shelter.address_line1,
        current_shelter.postal_code,
        current_shelter.city,
        normalized_note,
        'Oprettet fra modereret rapport ' || current_report.id::text,
        'moderator_report',
        true,
        current_user_id::text,
        current_user_id::text
      ) returning id into data_action_id;
    end if;
  elsif p_action = 'correct' then
    if nullif(trim(coalesce(p_address_line1, '')), '') is null
      or length(trim(p_address_line1)) > 200
      or p_postal_code is null
      or p_postal_code !~ '^[0-9]{4}$'
      or nullif(trim(coalesce(p_city, '')), '') is null
      or length(trim(p_city)) > 100
      or p_capacity is null
      or p_capacity < 0
      or p_capacity > 2000000 then
      raise exception 'complete and valid corrected address and capacity are required';
    end if;

    update app_v2.shelter_overrides active_override
    set
      is_active = false,
      effective_until = coalesce(active_override.effective_until, timezone('utc', now())),
      updated_by = current_user_id::text
    where active_override.shelter_id = current_report.shelter_id
      and active_override.is_active = true;

    insert into app_v2.shelter_overrides (
      shelter_id,
      address_line1,
      postal_code,
      city,
      capacity,
      reason,
      is_active,
      created_by,
      updated_by
    ) values (
      current_report.shelter_id,
      trim(p_address_line1),
      p_postal_code,
      trim(p_city),
      p_capacity,
      normalized_note,
      true,
      current_user_id::text,
      current_user_id::text
    ) returning id into data_action_id;
  end if;

  update app_v2.shelter_reports report
  set
    status = next_status,
    resolution_note = case when next_status in ('resolved', 'rejected') then normalized_note else null end,
    resolution_outcome = next_outcome,
    reviewed_by = current_user_id,
    reviewed_at = timezone('utc', now()),
    contact_email = case when next_status in ('resolved', 'rejected') then null else report.contact_email end,
    contact_redacted_at = case
      when next_status in ('resolved', 'rejected') and report.contact_email is not null
      then timezone('utc', now())
      else report.contact_redacted_at
    end
  where report.id = current_report.id;

  insert into app_v2.audit_events (
    actor_type,
    actor_identifier,
    entity_type,
    entity_id,
    event_type,
    payload
  ) values (
    'moderator',
    current_user_id::text,
    'shelter_report',
    current_report.id,
    event_name,
    jsonb_strip_nulls(jsonb_build_object(
      'action', p_action,
      'previous_status', current_report.status,
      'next_status', next_status,
      'outcome', next_outcome,
      'note', normalized_note,
      'data_action_id', data_action_id,
      'moderator_account_id', current_account_id
    ))
  );

  return query select current_report.id, next_status, next_outcome;
end;
$$;

revoke all on function app_v2.moderate_shelter_report_v1(
  uuid, text, text, text, text, text, integer
) from public, anon;
grant execute on function app_v2.moderate_shelter_report_v1(
  uuid, text, text, text, text, text, integer
) to authenticated;

-- Active manual corrections are applied at the public read boundary. Source
-- rows remain untouched, so subsequent imports cannot erase reviewed changes.
create or replace view app_v2.shelter_public_v2
with (security_barrier = true)
as
select
  shelter.id,
  shelter.municipality_id,
  shelter.slug,
  coalesce(override_row.name, shelter.name) as name,
  coalesce(override_row.address_line1, shelter.address_line1) as address_line1,
  coalesce(override_row.postal_code, shelter.postal_code) as postal_code,
  coalesce(override_row.city, shelter.city) as city,
  shelter.latitude,
  shelter.longitude,
  coalesce(override_row.capacity, shelter.capacity) as capacity,
  coalesce(override_row.accessibility_notes, shelter.accessibility_notes) as accessibility_notes,
  coalesce(override_row.summary, shelter.summary) as summary,
  shelter.source_summary,
  shelter.last_seen_at,
  shelter.last_imported_at,
  shelter.source_application_code
from app_v2.shelters shelter
join app_v2.application_code_eligibility eligibility
  on eligibility.source_name = 'datafordeler-bbr-dar'
 and eligibility.application_code = shelter.source_application_code
 and eligibility.is_nearby_eligible = true
left join lateral (
  select active_override.*
  from app_v2.shelter_overrides active_override
  where active_override.shelter_id = shelter.id
    and active_override.is_active = true
    and active_override.effective_from <= timezone('utc', now())
    and (
      active_override.effective_until is null
      or active_override.effective_until > timezone('utc', now())
    )
  order by active_override.effective_from desc, active_override.created_at desc
  limit 1
) override_row on true
where shelter.import_state = 'active'
  and shelter.publication_state = 'published'
  and coalesce(override_row.capacity, shelter.capacity) >= 40
  and shelter.source_application_code is not null
  and not exists (
    select 1
    from app_v2.shelter_exclusions exclusion
    where exclusion.is_active = true
      and (
        exclusion.shelter_id = shelter.id
        or (
          exclusion.canonical_source_name is not null
          and exclusion.canonical_source_reference is not null
          and exclusion.canonical_source_name = shelter.canonical_source_name
          and exclusion.canonical_source_reference = shelter.canonical_source_reference
        )
        or (
          exclusion.address_line1 is not null
          and exclusion.postal_code is not null
          and regexp_replace(lower(trim(both from replace(exclusion.address_line1, ',', ' '))), '[[:space:]]+', ' ', 'g')
            = regexp_replace(lower(trim(both from replace(shelter.address_line1, ',', ' '))), '[[:space:]]+', ' ', 'g')
          and trim(both from exclusion.postal_code) = trim(both from shelter.postal_code)
          and (
            exclusion.city is null
            or regexp_replace(lower(trim(both from replace(exclusion.city, ',', ' '))), '[[:space:]]+', ' ', 'g')
             = regexp_replace(lower(trim(both from replace(shelter.city, ',', ' '))), '[[:space:]]+', ' ', 'g')
          )
        )
      )
  );

revoke all on table app_v2.shelter_public_v2 from public;
grant select on table app_v2.shelter_public_v2 to anon, authenticated, service_role;

comment on function app_v2.get_current_moderator_profile_v1() is
'Returns the linked moderator identity for the authenticated session. Does not grant moderation access without aal2.';
comment on function app_v2.list_shelter_reports_for_moderation_v1(text, integer) is
'Returns a minimized private moderation queue only to an allowlisted aal2 moderator session.';
comment on function app_v2.moderate_shelter_report_v1(uuid, text, text, text, text, text, integer) is
'Applies an audited moderation transition, optional exclusion, or durable data override. Requires allowlisted aal2.';
