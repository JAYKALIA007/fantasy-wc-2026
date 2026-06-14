-- Add FIFA rankings to nations
ALTER TABLE nations ADD COLUMN IF NOT EXISTS fifa_ranking int;

UPDATE nations SET fifa_ranking = CASE name
  WHEN 'Argentina'          THEN 1
  WHEN 'France'             THEN 2
  WHEN 'Spain'              THEN 3
  WHEN 'England'            THEN 4
  WHEN 'Brazil'             THEN 5
  WHEN 'Portugal'           THEN 6
  WHEN 'Netherlands'        THEN 7
  WHEN 'Belgium'            THEN 8
  WHEN 'Colombia'           THEN 9
  WHEN 'Uruguay'            THEN 10
  WHEN 'Croatia'            THEN 11
  WHEN 'Germany'            THEN 12
  WHEN 'Morocco'            THEN 13
  WHEN 'United States'      THEN 14
  WHEN 'Japan'              THEN 15
  WHEN 'Mexico'             THEN 16
  WHEN 'Switzerland'        THEN 17
  WHEN 'Senegal'            THEN 18
  WHEN 'Iran'               THEN 21
  WHEN 'South Korea'        THEN 23
  WHEN 'Egypt'              THEN 31
  WHEN 'Australia'          THEN 24
  WHEN 'Austria'            THEN 25
  WHEN 'Ecuador'            THEN 26
  WHEN 'Türkiye'            THEN 27
  WHEN 'Norway'             THEN 28
  WHEN 'Sweden'             THEN 29
  WHEN 'Tunisia'            THEN 30
  WHEN 'Algeria'            THEN 33
  WHEN 'Scotland'           THEN 35
  WHEN 'Ivory Coast'        THEN 38
  WHEN 'Paraguay'           THEN 39
  WHEN 'Saudi Arabia'       THEN 56
  WHEN 'Czechia'            THEN 37
  WHEN 'Ghana'              THEN 57
  WHEN 'South Africa'       THEN 59
  WHEN 'Qatar'              THEN 37
  WHEN 'Congo DR'           THEN 53
  WHEN 'Panama'             THEN 71
  WHEN 'Bosnia-Herzegovina' THEN 62
  WHEN 'Canada'             THEN 47
  WHEN 'Uzbekistan'         THEN 74
  WHEN 'Cape Verde'         THEN 77
  WHEN 'Iraq'               THEN 65
  WHEN 'Jordan'             THEN 87
  WHEN 'New Zealand'        THEN 96
  WHEN 'Haiti'              THEN 115
  WHEN 'Curaçao'            THEN 82
  ELSE 99
END;

-- Add group labels to matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS group_label text;

UPDATE matches SET group_label = 'A' WHERE id = 1;
UPDATE matches SET group_label = 'A' WHERE id = 2;
UPDATE matches SET group_label = 'B' WHERE id = 3;
UPDATE matches SET group_label = 'D' WHERE id = 4;
UPDATE matches SET group_label = 'B' WHERE id = 5;
UPDATE matches SET group_label = 'C' WHERE id = 6;
UPDATE matches SET group_label = 'C' WHERE id = 7;
UPDATE matches SET group_label = 'D' WHERE id = 8;
UPDATE matches SET group_label = 'E' WHERE id = 9;
UPDATE matches SET group_label = 'F' WHERE id = 10;
UPDATE matches SET group_label = 'E' WHERE id = 11;
UPDATE matches SET group_label = 'F' WHERE id = 12;
UPDATE matches SET group_label = 'H' WHERE id = 13;
UPDATE matches SET group_label = 'G' WHERE id = 14;
UPDATE matches SET group_label = 'H' WHERE id = 15;
UPDATE matches SET group_label = 'G' WHERE id = 16;
UPDATE matches SET group_label = 'I' WHERE id = 17;
UPDATE matches SET group_label = 'I' WHERE id = 18;
UPDATE matches SET group_label = 'J' WHERE id = 19;
UPDATE matches SET group_label = 'J' WHERE id = 20;
UPDATE matches SET group_label = 'K' WHERE id = 21;
UPDATE matches SET group_label = 'L' WHERE id = 22;
UPDATE matches SET group_label = 'L' WHERE id = 23;
UPDATE matches SET group_label = 'K' WHERE id = 24;
UPDATE matches SET group_label = 'A' WHERE id = 25;
UPDATE matches SET group_label = 'B' WHERE id = 26;
UPDATE matches SET group_label = 'B' WHERE id = 27;
UPDATE matches SET group_label = 'A' WHERE id = 28;
UPDATE matches SET group_label = 'D' WHERE id = 29;
UPDATE matches SET group_label = 'C' WHERE id = 30;
UPDATE matches SET group_label = 'C' WHERE id = 31;
UPDATE matches SET group_label = 'D' WHERE id = 32;
UPDATE matches SET group_label = 'F' WHERE id = 33;
UPDATE matches SET group_label = 'E' WHERE id = 34;
UPDATE matches SET group_label = 'E' WHERE id = 35;
UPDATE matches SET group_label = 'F' WHERE id = 36;
UPDATE matches SET group_label = 'H' WHERE id = 37;
UPDATE matches SET group_label = 'G' WHERE id = 38;
UPDATE matches SET group_label = 'H' WHERE id = 39;
UPDATE matches SET group_label = 'G' WHERE id = 40;
UPDATE matches SET group_label = 'J' WHERE id = 41;
UPDATE matches SET group_label = 'I' WHERE id = 42;
UPDATE matches SET group_label = 'I' WHERE id = 43;
UPDATE matches SET group_label = 'J' WHERE id = 44;
UPDATE matches SET group_label = 'K' WHERE id = 45;
UPDATE matches SET group_label = 'L' WHERE id = 46;
UPDATE matches SET group_label = 'L' WHERE id = 47;
UPDATE matches SET group_label = 'K' WHERE id = 48;
UPDATE matches SET group_label = 'B' WHERE id = 49;
UPDATE matches SET group_label = 'B' WHERE id = 50;
UPDATE matches SET group_label = 'C' WHERE id = 51;
UPDATE matches SET group_label = 'C' WHERE id = 52;
UPDATE matches SET group_label = 'A' WHERE id = 53;
UPDATE matches SET group_label = 'A' WHERE id = 54;
UPDATE matches SET group_label = 'E' WHERE id = 55;
UPDATE matches SET group_label = 'E' WHERE id = 56;
UPDATE matches SET group_label = 'F' WHERE id = 57;
UPDATE matches SET group_label = 'F' WHERE id = 58;
UPDATE matches SET group_label = 'D' WHERE id = 59;
UPDATE matches SET group_label = 'D' WHERE id = 60;
UPDATE matches SET group_label = 'I' WHERE id = 61;
UPDATE matches SET group_label = 'I' WHERE id = 62;
UPDATE matches SET group_label = 'H' WHERE id = 63;
UPDATE matches SET group_label = 'H' WHERE id = 64;
UPDATE matches SET group_label = 'G' WHERE id = 65;
UPDATE matches SET group_label = 'G' WHERE id = 66;
UPDATE matches SET group_label = 'L' WHERE id = 67;
UPDATE matches SET group_label = 'L' WHERE id = 68;
UPDATE matches SET group_label = 'K' WHERE id = 69;
UPDATE matches SET group_label = 'K' WHERE id = 70;
UPDATE matches SET group_label = 'J' WHERE id = 71;
UPDATE matches SET group_label = 'J' WHERE id = 72;
