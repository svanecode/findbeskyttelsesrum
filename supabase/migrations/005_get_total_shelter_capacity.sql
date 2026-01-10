-- Function to get total shelter capacity (sikringspladser)
-- This function sums up all shelter_capacity from active (non-deleted) shelters
CREATE OR REPLACE FUNCTION get_total_shelter_capacity()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_total_capacity BIGINT;
BEGIN
  SELECT COALESCE(SUM(shelter_capacity), 0)
  INTO v_total_capacity
  FROM sheltersv2
  WHERE deleted IS NULL
    AND shelter_capacity IS NOT NULL;
  
  RETURN v_total_capacity;
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION get_total_shelter_capacity TO authenticated;
GRANT EXECUTE ON FUNCTION get_total_shelter_capacity TO anon;

-- Add comment
COMMENT ON FUNCTION get_total_shelter_capacity IS 'Returns the total number of sikringspladser (shelter capacity) from all active (non-deleted) shelters in the database.';
