-- Public feedback is accepted only through the server-side service role. The
-- function keeps report creation and its audit event in one transaction while
-- leaving the moderation tables unavailable to anonymous Data API clients.
alter table app_v2.shelter_reports
drop constraint if exists shelter_reports_report_type_check;

alter table app_v2.shelter_reports
add constraint shelter_reports_report_type_check
check (
  report_type in (
    'incorrect_address',
    'building_missing',
    'not_a_shelter',
    'unavailable',
    'incorrect_capacity',
    'duplicate_record',
    'other'
  )
);

create or replace function app_v2.submit_public_shelter_report(
  p_shelter_id uuid,
  p_report_type text,
  p_message text,
  p_contact_email text default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = app_v2, pg_temp
as $$
declare
  report_id uuid;
begin
  if p_shelter_id is null then
    raise exception 'shelter id is required';
  end if;

  if p_report_type not in (
    'incorrect_address',
    'building_missing',
    'not_a_shelter',
    'unavailable',
    'incorrect_capacity',
    'duplicate_record',
    'other'
  ) then
    raise exception 'unsupported report type';
  end if;

  if length(trim(coalesce(p_message, ''))) < 10
    or length(trim(coalesce(p_message, ''))) > 1500 then
    raise exception 'message must be between 10 and 1500 characters';
  end if;

  if p_contact_email is not null
    and length(trim(p_contact_email)) > 254 then
    raise exception 'contact email is too long';
  end if;

  if not exists (
    select 1
    from app_v2.shelter_public_v2 published
    where published.id = p_shelter_id
  ) then
    raise exception 'published shelter registration was not found';
  end if;

  insert into app_v2.shelter_reports (
    shelter_id,
    report_type,
    message,
    contact_email
  )
  values (
    p_shelter_id,
    p_report_type,
    trim(p_message),
    nullif(lower(trim(p_contact_email)), '')
  )
  returning id into report_id;

  insert into app_v2.audit_events (
    actor_type,
    entity_type,
    entity_id,
    event_type,
    payload
  )
  values (
    'public_reporter',
    'shelter_report',
    report_id,
    'public_report_submitted',
    jsonb_build_object(
      'shelter_id', p_shelter_id,
      'report_type', p_report_type
    )
  );

  return report_id;
end;
$$;

revoke all on table app_v2.shelter_reports from public, anon, authenticated;
revoke all on table app_v2.audit_events from public, anon, authenticated;

revoke all on function app_v2.submit_public_shelter_report(uuid, text, text, text)
from public, anon, authenticated;
grant execute on function app_v2.submit_public_shelter_report(uuid, text, text, text)
to service_role;

comment on function app_v2.submit_public_shelter_report(uuid, text, text, text) is
'Creates a moderated public shelter report and matching audit event. Callable only by the server-side service role.';
