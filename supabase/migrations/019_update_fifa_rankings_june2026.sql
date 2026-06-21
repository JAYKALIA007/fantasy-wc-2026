-- FIFA Rankings update: 11 June 2026 (last update before WC 2026)
UPDATE nations SET fifa_ranking = CASE name
  WHEN 'Argentina'          THEN 1
  WHEN 'Spain'              THEN 2
  WHEN 'France'             THEN 3
  WHEN 'England'            THEN 4
  WHEN 'Portugal'           THEN 5
  WHEN 'Brazil'             THEN 6
  WHEN 'Morocco'            THEN 7
  WHEN 'Netherlands'        THEN 8
  WHEN 'Belgium'            THEN 9
  WHEN 'Germany'            THEN 10
  WHEN 'Croatia'            THEN 11
  WHEN 'Colombia'           THEN 13
  WHEN 'Mexico'             THEN 14
  WHEN 'Senegal'            THEN 15
  WHEN 'Uruguay'            THEN 16
  WHEN 'United States'      THEN 17
  WHEN 'Japan'              THEN 18
  WHEN 'Switzerland'        THEN 19
  WHEN 'Iran'               THEN 20
  WHEN 'Türkiye'            THEN 22
  WHEN 'Ecuador'            THEN 23
  WHEN 'Austria'            THEN 24
  WHEN 'South Korea'        THEN 25
  WHEN 'Australia'          THEN 27
  WHEN 'Algeria'            THEN 28
  WHEN 'Egypt'              THEN 29
  WHEN 'Canada'             THEN 30
  WHEN 'Norway'             THEN 31
  WHEN 'Ivory Coast'        THEN 33
  WHEN 'Panama'             THEN 34
  WHEN 'Sweden'             THEN 38
  WHEN 'Czechia'            THEN 40
  WHEN 'Paraguay'           THEN 41
  WHEN 'Scotland'           THEN 42
  WHEN 'Tunisia'            THEN 45
  WHEN 'Congo DR'           THEN 46
  WHEN 'Uzbekistan'         THEN 50
  WHEN 'Qatar'              THEN 56
  WHEN 'Iraq'               THEN 57
  WHEN 'South Africa'       THEN 60
  WHEN 'Saudi Arabia'       THEN 61
  WHEN 'Jordan'             THEN 63
  WHEN 'Bosnia-Herzegovina' THEN 64
  WHEN 'Cape Verde'         THEN 67
  WHEN 'Ghana'              THEN 73
  WHEN 'Curaçao'            THEN 82
  WHEN 'Haiti'              THEN 83
  WHEN 'New Zealand'        THEN 85
  ELSE fifa_ranking
END
WHERE name IN (
  'Argentina','Spain','France','England','Portugal','Brazil','Morocco','Netherlands',
  'Belgium','Germany','Croatia','Colombia','Mexico','Senegal','Uruguay','United States',
  'Japan','Switzerland','Iran','Türkiye','Ecuador','Austria','South Korea','Australia',
  'Algeria','Egypt','Canada','Norway','Ivory Coast','Panama','Sweden','Czechia','Paraguay',
  'Scotland','Tunisia','Congo DR','Uzbekistan','Qatar','Iraq','South Africa','Saudi Arabia',
  'Jordan','Bosnia-Herzegovina','Cape Verde','Ghana','Curaçao','Haiti','New Zealand'
);
