alter table public.sheltersv2
  add column if not exists last_seen_at timestamp with time zone,
  add column if not exists last_address_checked timestamp with time zone;;
