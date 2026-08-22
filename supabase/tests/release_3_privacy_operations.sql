begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

select has_table(
  'app_v2',
  'operational_heartbeats',
  'trusted operational heartbeats have a private table'
);

select is(
  (select relrowsecurity from pg_class where oid = 'app_v2.operational_heartbeats'::regclass),
  true,
  'operational heartbeats have RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'app_v2.operational_heartbeats', 'SELECT'),
  'anonymous clients cannot read trusted heartbeats'
);

select ok(
  not has_table_privilege('authenticated', 'app_v2.operational_heartbeats', 'SELECT'),
  'authenticated clients cannot read trusted heartbeats'
);

select ok(
  has_table_privilege('service_role', 'app_v2.operational_heartbeats', 'SELECT'),
  'the service role can read trusted heartbeats'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'app_v2'
      and tablename = 'operational_heartbeats'
      and policyname = 'app_v2_operational_heartbeats_service_only'
  ),
  'trusted heartbeats have an explicit service-only RLS policy'
);

select has_index(
  'app_v2',
  'operational_heartbeats',
  'app_v2_operational_heartbeats_checked_at_idx',
  'trusted heartbeat freshness has a covering index'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_v2.record_operational_heartbeat_v1(text,text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'anonymous clients cannot write trusted heartbeats'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_v2.record_operational_heartbeat_v1(text,text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'signed-in clients cannot write trusted heartbeats'
);

select ok(
  has_function_privilege(
    'service_role',
    'app_v2.record_operational_heartbeat_v1(text,text,text,text,timestamptz)',
    'EXECUTE'
  ),
  'the service role can write trusted heartbeats'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_v2.get_operational_health_v1(integer)',
    'EXECUTE'
  ),
  'anonymous clients cannot call the private operational summary'
);

select ok(
  has_function_privilege(
    'service_role',
    'app_v2.get_operational_health_v1(integer)',
    'EXECUTE'
  ),
  'the service role can call the private operational summary'
);

select throws_ok(
  $$select app_v2.record_product_metric_v1('monitor_heartbeat', null);$$,
  'P0001',
  'unsupported product metric',
  'browser product metrics reject operational heartbeats'
);

select ok(
  app_v2.record_operational_heartbeat_v1(
    'manual-release',
    'release-3-test-fresh',
    repeat('a', 40),
    'ok',
    timezone('utc', now())
  ) > 0,
  'a trusted server operation can record a valid heartbeat'
);

select is(
  (app_v2.get_operational_health_v1(90)->>'heartbeatFound')::boolean,
  true,
  'operational health finds the latest trusted heartbeat'
);

select is(
  (app_v2.get_operational_health_v1(90)->>'isFresh')::boolean,
  true,
  'a recent ok heartbeat is fresh'
);

select is(
  app_v2.get_operational_health_v1(90)->>'status',
  'ok',
  'operational health preserves the trusted status'
);

select has_column(
  'app_v2',
  'shelter_reports',
  'text_retention_until',
  'report free text has an explicit retention deadline'
);

select has_column(
  'app_v2',
  'shelter_reports',
  'text_redacted_at',
  'report free text records when it was redacted'
);

select has_index(
  'app_v2',
  'shelter_reports',
  'app_v2_shelter_reports_text_retention_idx',
  'due report text can be selected without scanning all reports'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_v2.redact_expired_personal_data_v1()',
    'EXECUTE'
  ),
  'anonymous clients cannot trigger retention cleanup'
);

select ok(
  has_function_privilege(
    'service_role',
    'app_v2.redact_expired_personal_data_v1()',
    'EXECUTE'
  ),
  'the service role can trigger retention cleanup'
);

select ok(
  exists (
    select 1 from cron.job
    where jobname = 'app-v2-redact-expired-personal-data'
  ),
  'the complete retention cleanup is scheduled daily'
);

select ok(
  not exists (
    select 1 from cron.job
    where jobname = 'app-v2-redact-expired-report-contacts'
  ),
  'the obsolete contact-only cleanup schedule is removed'
);

insert into app_v2.municipalities (id, code, slug, name)
values (
  '70000000-0000-0000-0000-000000000001',
  '9977',
  'release-3-test-kommune',
  'Release 3 Test Kommune'
);

insert into app_v2.shelters (
  id,
  municipality_id,
  slug,
  name,
  address_line1,
  postal_code,
  city,
  capacity,
  status,
  summary,
  publication_state
) values (
  '71000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  'release-3-test-shelter',
  'Release 3 test',
  'Retentionvej 1',
  '9977',
  'Testby',
  10,
  'active',
  'Release 3 test',
  'withheld'
);

insert into app_v2.shelter_reports (
  id,
  shelter_id,
  report_type,
  message,
  contact_email,
  status,
  resolution_note,
  contact_retention_until,
  text_retention_until,
  created_at
) values (
  '72000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001',
  'other',
  'Personal report text',
  'person@example.com',
  'resolved',
  'Personal moderator note',
  timezone('utc', now()) - interval '1 day',
  timezone('utc', now()) - interval '1 day',
  timezone('utc', now()) - interval '30 months'
);

insert into app_v2.audit_events (
  id,
  actor_type,
  actor_identifier,
  entity_type,
  entity_id,
  event_type,
  payload,
  created_at
) values (
  '73000000-0000-0000-0000-000000000001',
  'moderator',
  'private-moderator-id',
  'shelter_report',
  '72000000-0000-0000-0000-000000000001',
  'release_3_retention_test',
  jsonb_build_object(
    'note', 'personal note',
    'provider_subject', 'private-provider',
    'contact_email', 'person@example.com',
    'latitude', 55.6761,
    'userId', 'private-user',
    'outcome', 'keep-structured-value'
  ),
  timezone('utc', now()) - interval '30 months'
), (
  '73000000-0000-0000-0000-000000000002',
  'system',
  null,
  'retention_test',
  null,
  'release_3_old_audit_test',
  '{}'::jsonb,
  timezone('utc', now()) - interval '6 years'
);

insert into app_v2.product_metrics_hourly (
  metric_hour,
  event_name,
  event_count,
  duration_total_ms,
  duration_sample_count,
  updated_at
) values (
  date_trunc('hour', timezone('utc', now()) - interval '100 days'),
  'detail_opened',
  1,
  0,
  0,
  timezone('utc', now()) - interval '100 days'
);

insert into app_v2.operational_heartbeats (
  source,
  run_identifier,
  git_sha,
  status,
  checked_at,
  created_at
) values (
  'manual-release',
  'release-3-test-old',
  repeat('b', 40),
  'ok',
  timezone('utc', now()) - interval '100 days',
  timezone('utc', now()) - interval '100 days'
);

create temp table release3_cleanup_result as
select app_v2.redact_expired_personal_data_v1() as result;

select ok(
  (select (result->>'contactsRedacted')::integer from release3_cleanup_result) >= 1,
  'cleanup redacts expired report contacts'
);

select ok(
  (select (result->>'reportTextsRedacted')::integer from release3_cleanup_result) >= 1,
  'cleanup redacts expired report text'
);

select ok(
  (select (result->>'auditEventsRedacted')::integer from release3_cleanup_result) >= 1,
  'cleanup redacts expired audit identifiers'
);

select ok(
  (select (result->>'auditEventsDeleted')::integer from release3_cleanup_result) >= 1,
  'cleanup deletes audit events beyond the maximum retention'
);

select ok(
  (select (result->>'productMetricsDeleted')::integer from release3_cleanup_result) >= 1,
  'cleanup deletes old product metrics'
);

select ok(
  (select (result->>'operationalHeartbeatsDeleted')::integer from release3_cleanup_result) >= 1,
  'cleanup deletes old trusted heartbeats'
);

select is(
  (select contact_email from app_v2.shelter_reports where id = '72000000-0000-0000-0000-000000000001'),
  null,
  'expired contact email is removed'
);

select is(
  (select message from app_v2.shelter_reports where id = '72000000-0000-0000-0000-000000000001'),
  '[redacted after retention]',
  'expired report text is replaced with a fixed marker'
);

select is(
  (select resolution_note from app_v2.shelter_reports where id = '72000000-0000-0000-0000-000000000001'),
  null,
  'expired moderator free text is removed'
);

select ok(
  (select text_redacted_at is not null from app_v2.shelter_reports where id = '72000000-0000-0000-0000-000000000001'),
  'report text redaction has a timestamp'
);

select is(
  (select actor_identifier from app_v2.audit_events where id = '73000000-0000-0000-0000-000000000001'),
  null,
  'expired audit actor identifiers are removed'
);

select ok(
  (
    select not (payload ?| array['note', 'provider_subject', 'contact_email', 'latitude', 'userId'])
      and payload->>'outcome' = 'keep-structured-value'
    from app_v2.audit_events
    where id = '73000000-0000-0000-0000-000000000001'
  ),
  'sensitive audit payload fields are removed while structured outcomes remain'
);

select ok(
  not exists (select 1 from app_v2.audit_events where id = '73000000-0000-0000-0000-000000000002'),
  'audit events older than five years are deleted'
);

select ok(
  not exists (
    select 1 from app_v2.product_metrics_hourly
    where metric_hour = date_trunc('hour', timezone('utc', now()) - interval '100 days')
      and event_name = 'detail_opened'
  ),
  'product metrics older than ninety days are deleted'
);

select ok(
  not exists (
    select 1 from app_v2.operational_heartbeats
    where run_identifier = 'release-3-test-old'
  ),
  'trusted heartbeats older than ninety days are deleted'
);

select ok(
  exists (
    select 1 from app_v2.operational_heartbeats
    where run_identifier = 'release-3-test-fresh'
  ),
  'fresh trusted heartbeats survive cleanup'
);

select * from finish();

rollback;
