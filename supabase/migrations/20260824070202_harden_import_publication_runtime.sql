-- The daily import publishes roughly 24,000 candidates in one atomic
-- transaction. PostgREST otherwise inherits the authenticator role's
-- eight-second timeout, which is too close to the normal publication runtime.
-- Keep the exemption scoped to the trusted v3 publisher and within the
-- Database REST API's documented 60-second maximum.
alter function app_v2.publish_datafordeler_import_v3(
  uuid, text, integer, integer, integer, text, timestamptz,
  integer, integer, integer, integer, integer, integer
) set statement_timeout = '60s';

-- During a validated import, shelters and municipalities are changed by
-- several statements inside the same transaction. Recomputing the public
-- municipality aggregate after every one of those statements is redundant.
-- The v3 publisher already exposes a transaction-local flag while its private
-- publisher is running, so defer the aggregate until the final publication
-- metadata update after that flag has been cleared.
create or replace function app_v2.refresh_public_read_caches_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = app_v2, pg_temp
as $$
begin
  if current_setting('app_v2.quality_gate_passed', true) = 'true' then
    return null;
  end if;

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
  if current_setting('app_v2.quality_gate_passed', true) = 'true' then
    return null;
  end if;

  perform app_v2.refresh_municipality_summary_public_v1();
  perform app_v2.bump_public_data_revision_v1();
  return null;
end;
$$;

revoke all on function app_v2.refresh_public_read_caches_v1()
from public, anon, authenticated;
revoke all on function app_v2.bump_public_data_revision_trigger_v1()
from public, anon, authenticated;

comment on function app_v2.publish_datafordeler_import_v3(
  uuid, text, integer, integer, integer, text, timestamptz,
  integer, integer, integer, integer, integer, integer
) is
'Validates BBR/DAR mapping quality and atomically publishes a full import. The trusted recurring operation has a function-scoped 60-second statement timeout.';

comment on function app_v2.refresh_public_read_caches_v1() is
'Refreshes public aggregates and revision state, except while the atomic v3 importer explicitly defers redundant intermediate refreshes.';

comment on function app_v2.bump_public_data_revision_trigger_v1() is
'Finalizes public aggregate and revision state after publication metadata changes outside the importer deferral window.';
