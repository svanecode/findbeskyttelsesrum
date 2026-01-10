-- Test script for get_nearby_shelters_v3 function
-- Run this in your Supabase SQL editor to test the new function

-- Test 1: Basic functionality with Copenhagen coordinates
-- Expected: Should return nearby shelters within 50km
SELECT 
  vejnavn,
  husnummer,
  postnummer,
  distance / 1000 as distance_km,
  shelter_count,
  total_capacity
FROM get_nearby_shelters_v3(55.6761, 12.5683, 50000)
ORDER BY distance ASC;

-- Test 2: Closer radius (10km) - should return fewer results
SELECT 
  vejnavn,
  husnummer,
  postnummer,
  distance / 1000 as distance_km,
  shelter_count,
  total_capacity
FROM get_nearby_shelters_v3(55.6761, 12.5683, 10000)
ORDER BY distance ASC;

-- Test 3: Aarhus coordinates
SELECT 
  vejnavn,
  husnummer,
  postnummer,
  distance / 1000 as distance_km,
  shelter_count,
  total_capacity
FROM get_nearby_shelters_v3(56.1629, 10.2039, 50000)
ORDER BY distance ASC;

-- Test 4: Verify spatial index is being used
-- Run EXPLAIN ANALYZE to see query plan
EXPLAIN ANALYZE
SELECT *
FROM get_nearby_shelters_v3(55.6761, 12.5683, 50000);

-- Test 5: Compare with old function (if still exists)
-- This helps verify the results are similar
-- SELECT 
--   vejnavn,
--   husnummer,
--   postnummer,
--   distance / 1000 as distance_km
-- FROM get_nearby_shelters_v2(55.6761, 12.5683)
-- ORDER BY distance ASC;
