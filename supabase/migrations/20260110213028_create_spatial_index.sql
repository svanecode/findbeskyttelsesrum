-- Verify PostGIS extension is enabled (if not already)
CREATE EXTENSION IF NOT EXISTS postgis;

-- The legacy table may not exist in a fresh app_v2-only environment.
DO $$
BEGIN
  IF to_regclass('public.sheltersv2') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sheltersv2_location_gist
    ON public.sheltersv2 USING GIST (location);
  END IF;
END;
$$;
