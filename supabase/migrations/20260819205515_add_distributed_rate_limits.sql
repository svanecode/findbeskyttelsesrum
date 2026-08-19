-- Shared fixed-window buckets for expensive and write-oriented public API
-- routes. Only an HMAC digest of the namespace and client address is stored;
-- raw IP addresses never enter the database.
create table if not exists app_v2.rate_limit_buckets (
  key_hash text not null
    check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  request_count integer not null default 1
    check (request_count >= 0),
  expires_at timestamptz not null,
  primary key (key_hash, window_start)
);

create index if not exists app_v2_rate_limit_buckets_expires_at_idx
on app_v2.rate_limit_buckets (expires_at);

alter table app_v2.rate_limit_buckets enable row level security;

revoke all on table app_v2.rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table app_v2.rate_limit_buckets to service_role;

create or replace function app_v2.consume_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = app_v2, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_reset_at timestamptz;
  v_count integer;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'key hash must be a lowercase sha-256 digest';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'limit must be between 1 and 10000';
  end if;

  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'window seconds must be between 1 and 86400';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);

  -- Keep cleanup bounded and off the hot path for most requests.
  if random() < 0.01 then
    delete from app_v2.rate_limit_buckets
    where expires_at < v_now;
  end if;

  insert into app_v2.rate_limit_buckets (
    key_hash,
    window_start,
    request_count,
    expires_at
  )
  values (
    p_key_hash,
    v_window_start,
    1,
    v_reset_at
  )
  on conflict (key_hash, window_start)
  do update set
    request_count = least(app_v2.rate_limit_buckets.request_count + 1, 2147483647),
    expires_at = excluded.expires_at
  returning app_v2.rate_limit_buckets.request_count into v_count;

  return query
  select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_reset_at;
end;
$$;

revoke all on function app_v2.consume_rate_limit(text, integer, integer)
from public, anon, authenticated;
grant execute on function app_v2.consume_rate_limit(text, integer, integer)
to service_role;

comment on table app_v2.rate_limit_buckets is
'Short-lived distributed API rate-limit buckets keyed by a server-side HMAC digest; contains no raw client address.';

comment on function app_v2.consume_rate_limit(text, integer, integer) is
'Atomically consumes one distributed fixed-window rate-limit token. Callable only by the server-side service role.';
