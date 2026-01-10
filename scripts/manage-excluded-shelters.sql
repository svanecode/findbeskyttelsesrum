-- Helper script for managing excluded shelters
-- Use this to add/remove excluded addresses

-- Example: Add an excluded shelter by address
SELECT add_excluded_shelter(
  p_address := 'Testvej 123, 2000 Frederiksberg',
  p_vejnavn := 'Testvej',
  p_husnummer := '123',
  p_postnummer := '2000',
  p_reason := 'Owner requested exclusion',
  p_created_by := 'admin'
);

-- Example: Add an excluded shelter by bygning_id (if you have it)
SELECT add_excluded_shelter(
  p_address := 'Another Address 456, 2100 København Ø',
  p_bygning_id := 'BYG123456',
  p_reason := 'Private property - owner request',
  p_created_by := 'admin'
);

-- Example: List all excluded shelters
SELECT * FROM list_excluded_shelters();

-- Example: Remove an excluded shelter
SELECT remove_excluded_shelter(
  p_address := 'Testvej 123, 2000 Frederiksberg',
  p_vejnavn := 'Testvej',
  p_husnummer := '123',
  p_postnummer := '2000'
);

-- Example: Verify exclusion is working
-- Add an exclusion first, then test the nearby function
-- The excluded address should NOT appear in results
SELECT 
  vejnavn,
  husnummer,
  postnummer,
  distance / 1000 as distance_km
FROM get_nearby_shelters_v3(55.6761, 12.5683, 50000)
WHERE address NOT IN (SELECT address FROM excluded_shelters);

-- Query to check if a specific address is excluded
SELECT 
  es.*
FROM excluded_shelters es
WHERE 
  es.address LIKE '%Testvej%'
  OR es.vejnavn = 'Testvej';
