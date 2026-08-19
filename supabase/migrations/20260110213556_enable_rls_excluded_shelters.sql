-- Enable Row Level Security on excluded_shelters table
ALTER TABLE excluded_shelters ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role and authenticated admins to read all exclusions
-- In most cases, exclusions should be readable by the service role for the function to work
CREATE POLICY "Service role can read all excluded shelters"
ON excluded_shelters
FOR SELECT
TO service_role
USING (true);

-- Policy: Allow authenticated users to read exclusions (needed for the function)
-- The function needs to read from excluded_shelters, so authenticated role needs access
CREATE POLICY "Authenticated users can read excluded shelters"
ON excluded_shelters
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow anon users to read exclusions (needed for public RPC calls)
-- Since get_nearby_shelters_v3 is granted to anon, it needs to read exclusions
CREATE POLICY "Anon users can read excluded shelters"
ON excluded_shelters
FOR SELECT
TO anon
USING (true);

-- Policy: Only service role can insert exclusions (security - prevents public writes)
CREATE POLICY "Only service role can insert excluded shelters"
ON excluded_shelters
FOR INSERT
TO service_role
WITH CHECK (true);

-- Policy: Only service role can update exclusions
CREATE POLICY "Only service role can update excluded shelters"
ON excluded_shelters
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Only service role can delete exclusions
CREATE POLICY "Only service role can delete excluded shelters"
ON excluded_shelters
FOR DELETE
TO service_role
USING (true);

-- Note: The helper functions (add_excluded_shelter, remove_excluded_shelter) use SECURITY DEFINER
-- which means they run with the privileges of the function owner (usually postgres/superuser),
-- so they can bypass RLS. This is intentional so the functions can manage exclusions.;
