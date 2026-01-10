-- Create table for excluded shelters (owner requests)
-- This allows excluding specific addresses even if they match all filters

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

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_excluded_shelters_address 
ON excluded_shelters(address);

CREATE INDEX IF NOT EXISTS idx_excluded_shelters_bygning_id 
ON excluded_shelters(bygning_id) 
WHERE bygning_id IS NOT NULL;

-- Add comment
COMMENT ON TABLE excluded_shelters IS 'Stores addresses that owners have requested to exclude from search results';
