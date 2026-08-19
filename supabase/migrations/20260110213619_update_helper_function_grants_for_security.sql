-- Update helper function grants for better security
-- Only service role should be able to add/remove exclusions
-- But keep read access for authenticated and anon (for get_nearby_shelters_v3)

-- Revoke execute from authenticated and anon for add/remove functions
REVOKE EXECUTE ON FUNCTION add_excluded_shelter FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION remove_excluded_shelter FROM authenticated, anon;

-- Grant only to service_role (functions will be called via service role key)
GRANT EXECUTE ON FUNCTION add_excluded_shelter TO service_role;
GRANT EXECUTE ON FUNCTION remove_excluded_shelter TO service_role;

-- Keep list_excluded_shelters readable by authenticated and anon
-- (It's read-only, so safe to allow)
GRANT EXECUTE ON FUNCTION list_excluded_shelters TO authenticated, anon, service_role;

-- Note: These functions use SECURITY DEFINER, which means they run with the privileges
-- of the function owner (postgres/superuser), allowing them to bypass RLS.
-- This is intentional - the functions themselves control access, not direct table access.
-- By restricting who can execute the functions, we control who can manage exclusions.;
