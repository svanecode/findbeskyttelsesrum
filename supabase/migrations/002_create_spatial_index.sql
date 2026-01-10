-- Create spatial index for location column to optimize ST_DWithin queries
-- This is critical for performance with spatial queries

CREATE INDEX IF NOT EXISTS idx_sheltersv2_location_gist 
ON sheltersv2 USING GIST (location);

-- Verify PostGIS extension is enabled (if not already)
CREATE EXTENSION IF NOT EXISTS postgis;
