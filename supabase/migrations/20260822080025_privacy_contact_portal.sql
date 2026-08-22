-- Mail-free privacy contact portal. Public visitors interact only through
-- server-side routes and receive a high-entropy case key. The underlying
-- cases, access-token digests and conversation remain private.

create table app_v2.privacy_contact_cases (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    check (reference ~ '^FBR-[0-9]{4}-[A-Z2-9]{8}$'),
  access_token_hash text not null
    check (access_token_hash ~ '^[0-9a-f]{64}$'),
  category text not null
    check (category in ('privacy_rights', 'service_question', 'technical_issue', 'other')),
  subject text not null
    check (char_length(subject) between 3 and 120),
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'answered', 'closed')),
  response_due_at timestamptz not null default (timezone('utc', now()) + interval '1 month'),
  retention_until timestamptz not null default (timezone('utc', now()) + interval '24 months'),
  last_activity_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (retention_until > created_at),
  check (closed_at is null or status = 'closed')
);

create table app_v2.privacy_contact_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references app_v2.privacy_contact_cases(id) on delete cascade,
  author_type text not null check (author_type in ('visitor', 'moderator')),
  message text not null check (char_length(message) between 2 and 4000),
  moderator_account_id uuid references app_v2.moderator_accounts(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (author_type = 'visitor' and moderator_account_id is null)
    or (author_type = 'moderator' and moderator_account_id is not null)
  )
);

comment on table app_v2.privacy_contact_cases is
'Private mail-free contact cases. Only a SHA-256 digest of the visitor access key is stored.';
comment on table app_v2.privacy_contact_messages is
'Private two-way case conversation. Public access is mediated by service-only RPCs and a case-key digest.';

create trigger app_v2_set_privacy_contact_cases_updated_at
before update on app_v2.privacy_contact_cases
for each row
execute function app_v2.set_updated_at();

create index app_v2_privacy_contact_cases_queue_idx
on app_v2.privacy_contact_cases (status, response_due_at, last_activity_at desc);

create index app_v2_privacy_contact_cases_retention_idx
on app_v2.privacy_contact_cases (retention_until);

create index app_v2_privacy_contact_messages_case_created_idx
on app_v2.privacy_contact_messages (case_id, created_at, id);

create index app_v2_privacy_contact_messages_moderator_idx
on app_v2.privacy_contact_messages (moderator_account_id)
where moderator_account_id is not null;

alter table app_v2.privacy_contact_cases enable row level security;
alter table app_v2.privacy_contact_cases force row level security;
alter table app_v2.privacy_contact_messages enable row level security;
alter table app_v2.privacy_contact_messages force row level security;

revoke all on table app_v2.privacy_contact_cases from public, anon, authenticated;
revoke all on table app_v2.privacy_contact_messages from public, anon, authenticated;
grant select, insert, update, delete on table app_v2.privacy_contact_cases to service_role;
grant select, insert, update, delete on table app_v2.privacy_contact_messages to service_role;

create policy app_v2_privacy_contact_cases_service_only
on app_v2.privacy_contact_cases
for all
to service_role
using (true)
with check (true);

create policy app_v2_privacy_contact_messages_service_only
on app_v2.privacy_contact_messages
for all
to service_role
using (true)
with check (true);

create or replace function app_v2.submit_privacy_contact_case_v1(
  p_reference text,
  p_access_token_hash text,
  p_category text,
  p_subject text,
  p_message text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = app_v2, pg_temp
as $$
declare
  contact_case_id uuid;
  normalized_subject text := trim(coalesce(p_subject, ''));
  normalized_message text := trim(coalesce(p_message, ''));
begin
  if p_reference is null or p_reference !~ '^FBR-[0-9]{4}-[A-Z2-9]{8}$' then
    raise exception 'invalid contact case reference';
  end if;
  if p_access_token_hash is null or p_access_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid contact case access digest';
  end if;
  if p_category is null or p_category not in ('privacy_rights', 'service_question', 'technical_issue', 'other') then
    raise exception 'unsupported contact category';
  end if;
  if char_length(normalized_subject) < 3 or char_length(normalized_subject) > 120 then
    raise exception 'contact subject must be between 3 and 120 characters';
  end if;
  if char_length(normalized_message) < 10 or char_length(normalized_message) > 4000 then
    raise exception 'contact message must be between 10 and 4000 characters';
  end if;

  insert into app_v2.privacy_contact_cases (
    reference,
    access_token_hash,
    category,
    subject
  ) values (
    p_reference,
    p_access_token_hash,
    p_category,
    normalized_subject
  )
  returning id into contact_case_id;

  insert into app_v2.privacy_contact_messages (
    case_id,
    author_type,
    message
  ) values (
    contact_case_id,
    'visitor',
    normalized_message
  );

  insert into app_v2.audit_events (
    actor_type,
    entity_type,
    entity_id,
    event_type,
    payload
  ) values (
    'public_contact',
    'privacy_contact_case',
    contact_case_id,
    'privacy_contact_case_submitted',
    jsonb_build_object('category', p_category)
  );

  return contact_case_id;
end;
$$;

revoke all on function app_v2.submit_privacy_contact_case_v1(text, text, text, text, text)
from public, anon, authenticated;
grant execute on function app_v2.submit_privacy_contact_case_v1(text, text, text, text, text)
to service_role;

create or replace function app_v2.get_privacy_contact_case_v1(
  p_reference text,
  p_access_token_hash text
)
returns table (
  case_reference text,
  case_category text,
  case_subject text,
  case_status text,
  case_created_at timestamptz,
  case_updated_at timestamptz,
  response_due_at timestamptz,
  retention_until timestamptz,
  messages jsonb
)
language sql
stable
security invoker
set search_path = app_v2, pg_temp
as $$
  select
    contact_case.reference,
    contact_case.category,
    contact_case.subject,
    contact_case.status,
    contact_case.created_at,
    contact_case.updated_at,
    contact_case.response_due_at,
    contact_case.retention_until,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', contact_message.id,
            'authorType', contact_message.author_type,
            'message', contact_message.message,
            'createdAt', contact_message.created_at
          )
          order by contact_message.created_at, contact_message.id
        )
        from app_v2.privacy_contact_messages contact_message
        where contact_message.case_id = contact_case.id
      ),
      '[]'::jsonb
    )
  from app_v2.privacy_contact_cases contact_case
  where contact_case.reference = upper(trim(coalesce(p_reference, '')))
    and contact_case.access_token_hash = lower(trim(coalesce(p_access_token_hash, '')))
    and contact_case.retention_until > timezone('utc', now())
  limit 1;
$$;

revoke all on function app_v2.get_privacy_contact_case_v1(text, text)
from public, anon, authenticated;
grant execute on function app_v2.get_privacy_contact_case_v1(text, text)
to service_role;

create or replace function app_v2.append_privacy_contact_message_v1(
  p_reference text,
  p_access_token_hash text,
  p_message text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = app_v2, pg_temp
as $$
declare
  contact_case app_v2.privacy_contact_cases%rowtype;
  contact_message_id uuid;
  normalized_message text := trim(coalesce(p_message, ''));
begin
  if char_length(normalized_message) < 2 or char_length(normalized_message) > 4000 then
    raise exception 'contact follow-up must be between 2 and 4000 characters';
  end if;

  select existing_case.* into contact_case
  from app_v2.privacy_contact_cases existing_case
  where existing_case.reference = upper(trim(coalesce(p_reference, '')))
    and existing_case.access_token_hash = lower(trim(coalesce(p_access_token_hash, '')))
    and existing_case.retention_until > timezone('utc', now())
  for update;

  if not found then
    raise exception 'contact case not found' using errcode = 'P0002';
  end if;
  if contact_case.status = 'closed' then
    raise exception 'contact case is closed';
  end if;

  insert into app_v2.privacy_contact_messages (
    case_id,
    author_type,
    message
  ) values (
    contact_case.id,
    'visitor',
    normalized_message
  )
  returning id into contact_message_id;

  update app_v2.privacy_contact_cases
  set
    status = 'open',
    last_activity_at = timezone('utc', now()),
    retention_until = timezone('utc', now()) + interval '24 months',
    closed_at = null
  where id = contact_case.id;

  insert into app_v2.audit_events (
    actor_type,
    entity_type,
    entity_id,
    event_type,
    payload
  ) values (
    'public_contact',
    'privacy_contact_case',
    contact_case.id,
    'privacy_contact_visitor_replied',
    '{}'::jsonb
  );

  return contact_message_id;
end;
$$;

revoke all on function app_v2.append_privacy_contact_message_v1(text, text, text)
from public, anon, authenticated;
grant execute on function app_v2.append_privacy_contact_message_v1(text, text, text)
to service_role;

create or replace function app_v2.list_privacy_contact_cases_for_moderation_v1(
  p_status text default null,
  p_limit integer default 100
)
returns table (
  case_id uuid,
  case_reference text,
  case_category text,
  case_subject text,
  case_status text,
  case_created_at timestamptz,
  case_updated_at timestamptz,
  last_activity_at timestamptz,
  response_due_at timestamptz,
  retention_until timestamptz,
  messages jsonb
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
  if p_status is not null and p_status not in ('open', 'reviewing', 'answered', 'closed') then
    raise exception 'unsupported contact case status';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception 'limit must be between 1 and 250';
  end if;

  return query
  select
    contact_case.id,
    contact_case.reference,
    contact_case.category,
    contact_case.subject,
    contact_case.status,
    contact_case.created_at,
    contact_case.updated_at,
    contact_case.last_activity_at,
    contact_case.response_due_at,
    contact_case.retention_until,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', contact_message.id,
            'authorType', contact_message.author_type,
            'message', contact_message.message,
            'createdAt', contact_message.created_at
          )
          order by contact_message.created_at, contact_message.id
        )
        from app_v2.privacy_contact_messages contact_message
        where contact_message.case_id = contact_case.id
      ),
      '[]'::jsonb
    )
  from app_v2.privacy_contact_cases contact_case
  where p_status is null or contact_case.status = p_status
  order by
    case contact_case.status
      when 'open' then 1
      when 'reviewing' then 2
      when 'answered' then 3
      else 4
    end,
    contact_case.response_due_at,
    contact_case.last_activity_at desc
  limit p_limit;
end;
$$;

revoke all on function app_v2.list_privacy_contact_cases_for_moderation_v1(text, integer)
from public, anon;
grant execute on function app_v2.list_privacy_contact_cases_for_moderation_v1(text, integer)
to authenticated;

create or replace function app_v2.moderate_privacy_contact_case_v1(
  p_case_id uuid,
  p_action text,
  p_message text default null
)
returns table (
  case_id uuid,
  case_status text
)
language plpgsql
volatile
security definer
set search_path = app_v2, pg_temp
as $$
declare
  current_account_id uuid;
  current_user_id uuid;
  contact_case app_v2.privacy_contact_cases%rowtype;
  normalized_message text := nullif(trim(coalesce(p_message, '')), '');
  next_status text;
  event_name text;
begin
  current_account_id := app_v2.current_moderator_account_id_v1(true);
  current_user_id := auth.uid();
  if current_account_id is null or current_user_id is null then
    raise exception 'moderator MFA required' using errcode = '42501';
  end if;
  if p_action not in ('start_review', 'reply', 'close', 'reopen') then
    raise exception 'unsupported contact case action';
  end if;
  if p_action = 'reply'
    and (normalized_message is null or char_length(normalized_message) < 2 or char_length(normalized_message) > 4000) then
    raise exception 'a reply between 2 and 4000 characters is required';
  end if;
  if p_action = 'close'
    and normalized_message is not null
    and (char_length(normalized_message) < 2 or char_length(normalized_message) > 4000) then
    raise exception 'a closing reply must be between 2 and 4000 characters';
  end if;

  select existing_case.* into contact_case
  from app_v2.privacy_contact_cases existing_case
  where existing_case.id = p_case_id
  for update;

  if not found then
    raise exception 'contact case not found';
  end if;
  if p_action = 'start_review' and contact_case.status not in ('open', 'answered') then
    raise exception 'only open or answered contact cases can enter review';
  end if;
  if p_action = 'reply' and contact_case.status = 'closed' then
    raise exception 'closed contact cases cannot receive replies';
  end if;
  if p_action = 'close' and contact_case.status = 'closed' then
    raise exception 'contact case is already closed';
  end if;
  if p_action = 'reopen' and contact_case.status <> 'closed' then
    raise exception 'only closed contact cases can be reopened';
  end if;

  if normalized_message is not null and p_action in ('reply', 'close') then
    insert into app_v2.privacy_contact_messages (
      case_id,
      author_type,
      message,
      moderator_account_id
    ) values (
      contact_case.id,
      'moderator',
      normalized_message,
      current_account_id
    );
  end if;

  next_status := case p_action
    when 'start_review' then 'reviewing'
    when 'reply' then 'answered'
    when 'close' then 'closed'
    when 'reopen' then 'reviewing'
  end;
  event_name := case p_action
    when 'start_review' then 'privacy_contact_review_started'
    when 'reply' then 'privacy_contact_moderator_replied'
    when 'close' then 'privacy_contact_case_closed'
    when 'reopen' then 'privacy_contact_case_reopened'
  end;

  update app_v2.privacy_contact_cases
  set
    status = next_status,
    reviewed_by = current_user_id,
    last_activity_at = case
      when normalized_message is not null then timezone('utc', now())
      else contact_case.last_activity_at
    end,
    retention_until = case
      when p_action = 'close'
      then least(contact_case.retention_until, timezone('utc', now()) + interval '12 months')
      when p_action = 'reopen'
      then timezone('utc', now()) + interval '24 months'
      else contact_case.retention_until
    end,
    closed_at = case when p_action = 'close' then timezone('utc', now()) else null end
  where id = contact_case.id;

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
    'privacy_contact_case',
    contact_case.id,
    event_name,
    jsonb_build_object(
      'previous_status', contact_case.status,
      'next_status', next_status,
      'moderator_account_id', current_account_id,
      'message_added', normalized_message is not null
    )
  );

  return query select contact_case.id, next_status;
end;
$$;

revoke all on function app_v2.moderate_privacy_contact_case_v1(uuid, text, text)
from public, anon;
grant execute on function app_v2.moderate_privacy_contact_case_v1(uuid, text, text)
to authenticated;

create or replace function app_v2.delete_privacy_contact_case_v1(
  p_case_id uuid,
  p_confirmation text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = app_v2, pg_temp
as $$
declare
  current_account_id uuid;
  current_user_id uuid;
  contact_case app_v2.privacy_contact_cases%rowtype;
begin
  current_account_id := app_v2.current_moderator_account_id_v1(true);
  current_user_id := auth.uid();
  if current_account_id is null or current_user_id is null then
    raise exception 'moderator MFA required' using errcode = '42501';
  end if;

  select existing_case.* into contact_case
  from app_v2.privacy_contact_cases existing_case
  where existing_case.id = p_case_id
  for update;

  if not found then
    raise exception 'contact case not found';
  end if;
  if contact_case.status <> 'closed' then
    raise exception 'only closed contact cases can be deleted';
  end if;
  if upper(trim(coalesce(p_confirmation, ''))) <> contact_case.reference then
    raise exception 'contact case deletion confirmation did not match';
  end if;

  delete from app_v2.privacy_contact_cases
  where id = contact_case.id;

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
    'privacy_contact_case',
    contact_case.id,
    'privacy_contact_case_deleted',
    jsonb_build_object(
      'previous_status', contact_case.status,
      'moderator_account_id', current_account_id
    )
  );

  return true;
end;
$$;

revoke all on function app_v2.delete_privacy_contact_case_v1(uuid, text)
from public, anon;
grant execute on function app_v2.delete_privacy_contact_case_v1(uuid, text)
to authenticated;

-- Extend the existing daily cleanup so case text and access-token digests are
-- removed together. Structured audit events keep their existing five-year
-- boundary and never contain case text or access keys.
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
  contact_case_deletion_count integer := 0;
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

  delete from app_v2.privacy_contact_cases contact_case
  where contact_case.retention_until <= timezone('utc', now());
  get diagnostics contact_case_deletion_count = row_count;

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
    'privacyContactCasesDeleted', contact_case_deletion_count,
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

comment on function app_v2.submit_privacy_contact_case_v1(text, text, text, text, text) is
'Creates a private contact case and initial message. Callable only by the server-side service role.';
comment on function app_v2.get_privacy_contact_case_v1(text, text) is
'Returns a minimized conversation only when both case reference and access-key digest match. Service role only.';
comment on function app_v2.append_privacy_contact_message_v1(text, text, text) is
'Appends an authenticated-by-case-key visitor follow-up. Service role only.';
comment on function app_v2.list_privacy_contact_cases_for_moderation_v1(text, integer) is
'Returns the private contact queue only to an allowlisted moderator with aal2.';
comment on function app_v2.moderate_privacy_contact_case_v1(uuid, text, text) is
'Applies audited contact-case review, reply and closure actions. Requires allowlisted aal2.';
comment on function app_v2.delete_privacy_contact_case_v1(uuid, text) is
'Permanently deletes a closed contact case after exact reference confirmation and writes a content-free audit event. Requires allowlisted aal2.';
comment on function app_v2.redact_expired_personal_data_v1() is
'Daily bounded-retention cleanup for reports, contact cases, audit identifiers, metrics and trusted heartbeats.';
