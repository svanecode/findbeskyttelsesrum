-- Combined migration file - Run this in Supabase SQL Editor
-- Or execute individual files in order: 001, 002, 003, 004

-- ============================================================================
-- Migration 001: Create excluded_shelters table
-- ============================================================================

CREATE TABLE IF NOT EXISTS excluded_shelters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  vejnavn TEXT,
  husnummer TEXT,
  postnummer TEXT,
  bygning_id TEXT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  UNIQUE(address, vejnavn, husnummer, postnummer)
);

CREATE INDEX IF NOT EXISTS idx_excluded_shelters_address 
ON excluded_shelters(address);

CREATE INDEX IF NOT EXISTS idx_excluded_shelters_bygning_id 
ON excluded_shelters(bygning_id) 
WHERE bygning_id IS NOT NULL;

COMMENT ON TABLE excluded_shelters IS 'Stores addresses that owners have requested to exclude from search results';

-- ============================================================================
-- Migration 002: Create spatial index
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE INDEX IF NOT EXISTS idx_sheltersv2_location_gist 
ON sheltersv2 USING GIST (location);

-- ============================================================================
-- Migration 003: Create get_nearby_shelters_v3 function
-- ============================================================================

CREATE OR REPLACE FUNCTION get_nearby_shelters_v3(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_meters INTEGER DEFAULT 50000
)
RETURNS TABLE (
  id TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  bygning_id TEXT,
  kommunekode TEXT,
  total_capacity INTEGER,
  address TEXT,
  postnummer TEXT,
  vejnavn TEXT,
  husnummer TEXT,
  location JSONB,
  anvendelse TEXT,
  distance DOUBLE PRECISION,
  shelter_count INTEGER
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH shelter_groups AS (
    SELECT
      s.vejnavn,
      s.husnummer,
      s.postnummer,
      s.kommunekode,
      s.location,
      COUNT(*) as shelter_count,
      SUM(s.shelter_capacity) as total_capacity,
      (ARRAY_AGG(s.id))[1] as id,
      MIN(s.created_at) as created_at,
      MIN(s.bygning_id) as bygning_id,
      MIN(s.anvendelse) as anvendelse,
      MIN(s.address) as address,
      ST_Distance(
        s.location::geography,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      ) as distance
    FROM
      sheltersv2 s
    JOIN
      anvendelseskoder a ON s.anvendelse = a.kode
    WHERE
      s.location IS NOT NULL
    AND
      s.shelter_capacity >= 40
    AND
      a.skal_med = TRUE
    AND
      ST_DWithin(
        s.location::geography,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_radius_meters
      )
    AND
      NOT EXISTS (
        SELECT 1 
        FROM excluded_shelters es
        WHERE 
          (es.address = s.address)
          OR
          (
            es.vejnavn = s.vejnavn 
            AND es.husnummer = s.husnummer 
            AND es.postnummer = s.postnummer
          )
          OR
          (es.bygning_id IS NOT NULL AND es.bygning_id = s.bygning_id)
      )
    GROUP BY
      s.vejnavn,
      s.husnummer,
      s.postnummer,
      s.kommunekode,
      s.location
    ORDER BY
      distance ASC
    LIMIT 10
  )
  SELECT
    sg.id,
    sg.created_at,
    sg.bygning_id,
    sg.kommunekode,
    sg.total_capacity,
    sg.address,
    sg.postnummer,
    sg.vejnavn,
    sg.husnummer,
    sg.location,
    sg.anvendelse,
    sg.distance,
    sg.shelter_count
  FROM
    shelter_groups sg;
END;
$$;

GRANT EXECUTE ON FUNCTION get_nearby_shelters_v3 TO authenticated;
GRANT EXECUTE ON FUNCTION get_nearby_shelters_v3 TO anon;

COMMENT ON FUNCTION get_nearby_shelters_v3 IS 
'Optimized function to find nearest 10 shelters using spatial index (ST_DWithin) and excluding owner-requested addresses. Returns shelters within specified radius (default 50km), ordered by distance.';

-- ============================================================================
-- Migration 004: Create helper functions for exclusions
-- ============================================================================

CREATE OR REPLACE FUNCTION add_excluded_shelter(
  p_address TEXT,
  p_vejnavn TEXT DEFAULT NULL,
  p_husnummer TEXT DEFAULT NULL,
  p_postnummer TEXT DEFAULT NULL,
  p_bygning_id TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO excluded_shelters (
    address,
    vejnavn,
    husnummer,
    postnummer,
    bygning_id,
    reason,
    created_by
  )
  VALUES (
    p_address,
    p_vejnavn,
    p_husnummer,
    p_postnummer,
    p_bygning_id,
    p_reason,
    p_created_by
  )
  ON CONFLICT (address, vejnavn, husnummer, postnummer) 
  DO UPDATE SET
    reason = COALESCE(EXCLUDED.reason, excluded_shelters.reason),
    bygning_id = COALESCE(EXCLUDED.bygning_id, excluded_shelters.bygning_id),
    created_at = NOW()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION remove_excluded_shelter(
  p_address TEXT,
  p_vejnavn TEXT DEFAULT NULL,
  p_husnummer TEXT DEFAULT NULL,
  p_postnummer TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM excluded_shelters
  WHERE 
    address = p_address
    AND (p_vejnavn IS NULL OR vejnavn = p_vejnavn)
    AND (p_husnummer IS NULL OR husnummer = p_husnummer)
    AND (p_postnummer IS NULL OR postnummer = p_postnummer);
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

CREATE OR REPLACE FUNCTION list_excluded_shelters()
RETURNS TABLE (
  id UUID,
  address TEXT,
  vejnavn TEXT,
  husnummer TEXT,
  postnummer TEXT,
  bygning_id TEXT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  created_by TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    es.id,
    es.address,
    es.vejnavn,
    es.husnummer,
    es.postnummer,
    es.bygning_id,
    es.reason,
    es.created_at,
    es.created_by
  FROM excluded_shelters es
  ORDER BY es.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION add_excluded_shelter TO authenticated;
GRANT EXECUTE ON FUNCTION remove_excluded_shelter TO authenticated;
GRANT EXECUTE ON FUNCTION list_excluded_shelters TO authenticated;

COMMENT ON FUNCTION add_excluded_shelter IS 'Adds a shelter address to the exclusion list. Returns the ID of the created/updated exclusion.';
COMMENT ON FUNCTION remove_excluded_shelter IS 'Removes a shelter address from the exclusion list. Returns true if deleted, false if not found.';
COMMENT ON FUNCTION list_excluded_shelters IS 'Lists all excluded shelters with their details.';

-- ============================================================================
-- Migration Complete!
-- ============================================================================
-- All migrations have been applied.
-- Test the new function with:
-- SELECT * FROM get_nearby_shelters_v3(55.6761, 12.5683, 50000);
