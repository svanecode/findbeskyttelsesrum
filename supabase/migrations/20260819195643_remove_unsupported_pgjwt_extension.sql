-- pgjwt is no longer supported by the current Supabase Postgres upgrade path.
-- The extension has no external database dependencies and is not referenced by
-- the application. RESTRICT keeps this migration fail-closed if that changes.
drop extension if exists pgjwt restrict;
