-- Add nation picks to league_members
ALTER TABLE league_members ADD COLUMN IF NOT EXISTS primary_nation_id int REFERENCES nations(id);
ALTER TABLE league_members ADD COLUMN IF NOT EXISTS secondary_nation_id int REFERENCES nations(id);
