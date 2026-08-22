begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

select has_table('app_v2', 'privacy_contact_cases', 'contact cases have a private table');
select has_table('app_v2', 'privacy_contact_messages', 'contact messages have a private table');

select is(
  (select relrowsecurity from pg_class where oid = 'app_v2.privacy_contact_cases'::regclass),
  true,
  'contact cases have RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'app_v2.privacy_contact_messages'::regclass),
  true,
  'contact messages have RLS enabled'
);

select ok(not has_table_privilege('anon', 'app_v2.privacy_contact_cases', 'SELECT'), 'anonymous clients cannot read contact cases');
select ok(not has_table_privilege('authenticated', 'app_v2.privacy_contact_cases', 'SELECT'), 'signed-in clients cannot read contact cases directly');
select ok(not has_table_privilege('anon', 'app_v2.privacy_contact_messages', 'SELECT'), 'anonymous clients cannot read contact messages');
select ok(not has_table_privilege('authenticated', 'app_v2.privacy_contact_messages', 'SELECT'), 'signed-in clients cannot read contact messages directly');
select ok(has_table_privilege('service_role', 'app_v2.privacy_contact_cases', 'SELECT'), 'service role can mediate contact cases');
select ok(has_table_privilege('service_role', 'app_v2.privacy_contact_messages', 'SELECT'), 'service role can mediate contact messages');

select has_index(
  'app_v2',
  'privacy_contact_cases',
  'app_v2_privacy_contact_cases_queue_idx',
  'the moderator queue has a bounded ordering index'
);
select has_index(
  'app_v2',
  'privacy_contact_messages',
  'app_v2_privacy_contact_messages_case_created_idx',
  'conversation lookup has a case and timestamp index'
);

select ok(
  not has_function_privilege('anon', 'app_v2.submit_privacy_contact_case_v1(text,text,text,text,text)', 'EXECUTE'),
  'anonymous clients cannot call the contact writer directly'
);
select ok(
  not has_function_privilege('authenticated', 'app_v2.submit_privacy_contact_case_v1(text,text,text,text,text)', 'EXECUTE'),
  'signed-in clients cannot call the contact writer directly'
);
select ok(
  has_function_privilege('service_role', 'app_v2.submit_privacy_contact_case_v1(text,text,text,text,text)', 'EXECUTE'),
  'server-side code can create contact cases'
);
select ok(
  not has_function_privilege('anon', 'app_v2.get_privacy_contact_case_v1(text,text)', 'EXECUTE'),
  'anonymous clients cannot bypass the case-key route for reads'
);
select ok(
  has_function_privilege('service_role', 'app_v2.get_privacy_contact_case_v1(text,text)', 'EXECUTE'),
  'server-side code can mediate case-key reads'
);
select ok(
  not has_function_privilege('anon', 'app_v2.append_privacy_contact_message_v1(text,text,text)', 'EXECUTE'),
  'anonymous clients cannot append contact messages directly'
);
select ok(
  has_function_privilege('service_role', 'app_v2.append_privacy_contact_message_v1(text,text,text)', 'EXECUTE'),
  'server-side code can mediate case-key follow-ups'
);
select ok(
  not has_function_privilege('anon', 'app_v2.list_privacy_contact_cases_for_moderation_v1(text,integer)', 'EXECUTE'),
  'anonymous clients cannot list the private contact queue'
);
select ok(
  has_function_privilege('authenticated', 'app_v2.list_privacy_contact_cases_for_moderation_v1(text,integer)', 'EXECUTE'),
  'authenticated sessions can reach the internally MFA-guarded queue RPC'
);
select ok(
  not has_function_privilege('anon', 'app_v2.moderate_privacy_contact_case_v1(uuid,text,text)', 'EXECUTE'),
  'anonymous clients cannot moderate contact cases'
);
select ok(
  has_function_privilege('authenticated', 'app_v2.moderate_privacy_contact_case_v1(uuid,text,text)', 'EXECUTE'),
  'authenticated sessions can reach the internally MFA-guarded moderation RPC'
);
select ok(
  not has_function_privilege('anon', 'app_v2.delete_privacy_contact_case_v1(uuid,text)', 'EXECUTE'),
  'anonymous clients cannot delete contact cases'
);
select ok(
  has_function_privilege('authenticated', 'app_v2.delete_privacy_contact_case_v1(uuid,text)', 'EXECUTE'),
  'authenticated sessions can reach the internally MFA-guarded deletion RPC'
);

set local role service_role;

create temp table contact_case_created as
select app_v2.submit_privacy_contact_case_v1(
  'FBR-2026-ABCDEFGH',
  repeat('a', 64),
  'privacy_rights',
  'Anmodning om indsigt',
  'Jeg ønsker at få oplyst, hvilke personoplysninger tjenesten har registreret om mig.'
) as case_id;

select ok((select case_id is not null from contact_case_created), 'a valid server request creates a contact case');

select is(
  (select case_status from app_v2.get_privacy_contact_case_v1('FBR-2026-ABCDEFGH', repeat('a', 64))),
  'open',
  'a new contact case starts open'
);

select is(
  (select jsonb_array_length(messages) from app_v2.get_privacy_contact_case_v1('FBR-2026-ABCDEFGH', repeat('a', 64))),
  1,
  'the initial conversation contains one visitor message'
);

select ok(
  app_v2.append_privacy_contact_message_v1(
    'FBR-2026-ABCDEFGH',
    repeat('a', 64),
    'Her er en præcisering af min anmodning.'
  ) is not null,
  'the matching case key can append a follow-up'
);

select is(
  (select jsonb_array_length(messages) from app_v2.get_privacy_contact_case_v1('FBR-2026-ABCDEFGH', repeat('a', 64))),
  2,
  'the visitor sees the complete two-message conversation'
);

select is(
  (select count(*)::integer from app_v2.get_privacy_contact_case_v1('FBR-2026-ABCDEFGH', repeat('b', 64))),
  0,
  'a wrong case key reveals no case data'
);

reset role;

select ok(
  not exists (
    select 1
    from app_v2.audit_events event
    where event.entity_id = (select case_id from contact_case_created)
      and (
        event.payload::text like '%Anmodning om indsigt%'
        or event.payload::text like '%præcisering%'
        or event.payload::text like '%aaaaaaaaaaaaaaaa%'
      )
  ),
  'contact audit events contain neither message text nor access-token digest'
);

update app_v2.privacy_contact_cases
set
  created_at = timezone('utc', now()) - interval '30 months',
  retention_until = timezone('utc', now()) - interval '1 day'
where id = (select case_id from contact_case_created);

set local role service_role;

create temp table contact_cleanup_result as
select app_v2.redact_expired_personal_data_v1() as result;

select ok(
  (select (result->>'privacyContactCasesDeleted')::integer from contact_cleanup_result) >= 1,
  'retention cleanup deletes expired contact cases'
);

reset role;

select is(
  (select count(*)::integer from app_v2.privacy_contact_cases where id = (select case_id from contact_case_created)),
  0,
  'the expired contact case is gone'
);

select is(
  (select count(*)::integer from app_v2.privacy_contact_messages where case_id = (select case_id from contact_case_created)),
  0,
  'contact messages are deleted with their expired case'
);

select * from finish();

rollback;
