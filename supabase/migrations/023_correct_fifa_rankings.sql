-- Correct FIFA rankings based on official June 11 2026 update (inside.fifa.com/fifa-world-ranking/men).
-- Migration 019 had Germany at #8; actual ranking is #12. Other shifts: Portugal #9→#8,
-- Mexico #11→#9, Colombia #12→#11, Croatia #15→#13.
UPDATE nations SET fifa_ranking = CASE name
  WHEN 'Portugal'  THEN 8
  WHEN 'Mexico'    THEN 9
  WHEN 'Colombia'  THEN 11
  WHEN 'Germany'   THEN 12
  WHEN 'Croatia'   THEN 13
  ELSE fifa_ranking
END
WHERE name IN ('Portugal', 'Mexico', 'Colombia', 'Germany', 'Croatia');
