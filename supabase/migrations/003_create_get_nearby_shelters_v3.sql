-- Optimized version of get_nearby_shelters with ST_DWithin for better performance
-- and exclusion logic to filter out owner-requested exclusions

CREATE OR REPLACE FUNCTION get_nearby_shelters_v3(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_meters INTEGER DEFAULT 50000 -- 50km default radius
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
      -- Use ST_DWithin for efficient spatial filtering (uses GIST index)
      ST_DWithin(
        s.location::geography,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_radius_meters
      )
    AND
      -- Exclude shelters that are in the exclusion list
      NOT EXISTS (
        SELECT 1 
        FROM excluded_shelters es
        WHERE 
          -- Match by exact address
          (es.address = s.address)
          OR
          -- Match by address components (more flexible)
          (
            es.vejnavn = s.vejnavn 
            AND es.husnummer = s.husnummer 
            AND es.postnummer = s.postnummer
          )
          OR
          -- Match by bygning_id if available
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_nearby_shelters_v3 TO authenticated;
GRANT EXECUTE ON FUNCTION get_nearby_shelters_v3 TO anon;

-- Add comment
COMMENT ON FUNCTION get_nearby_shelters_v3 IS 
'Optimized function to find nearest 10 shelters using spatial index (ST_DWithin) and excluding owner-requested addresses. Returns shelters within specified radius (default 50km), ordered by distance.';
