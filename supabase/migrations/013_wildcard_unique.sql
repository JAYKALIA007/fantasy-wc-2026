-- Enforce one wildcard pick per nation per league (first come first serve)
-- NULLs are not considered duplicates in PostgreSQL UNIQUE constraints
ALTER TABLE league_members
  ADD CONSTRAINT league_members_league_secondary_nation_unique
  UNIQUE (league_id, secondary_nation_id);
