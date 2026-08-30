-- The active application uses app_v2.get_nearby_shelters_public_v2. This
-- legacy RPC still referenced public.shelters, which no longer exists, so it
-- could only fail at runtime and kept the remote schema linter red.
drop function if exists public.find_nearest_shelters(
  double precision,
  double precision,
  integer
);
