-- Helper functions for managing excluded shelters

-- Function to add an excluded shelter
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

-- Function to remove an excluded shelter
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

-- Function to list all excluded shelters
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION add_excluded_shelter TO authenticated;
GRANT EXECUTE ON FUNCTION remove_excluded_shelter TO authenticated;
GRANT EXECUTE ON FUNCTION list_excluded_shelters TO authenticated;

-- Add comments
COMMENT ON FUNCTION add_excluded_shelter IS 'Adds a shelter address to the exclusion list. Returns the ID of the created/updated exclusion.';
COMMENT ON FUNCTION remove_excluded_shelter IS 'Removes a shelter address from the exclusion list. Returns true if deleted, false if not found.';
COMMENT ON FUNCTION list_excluded_shelters IS 'Lists all excluded shelters with their details.';
