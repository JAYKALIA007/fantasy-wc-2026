-- FIFA Live Rankings update: 21 June 2026 (from inside.fifa.com/fifa-world-ranking/men)
UPDATE nations SET fifa_ranking = CASE name
  WHEN 'Argentina'          THEN 1
  WHEN 'France'             THEN 2
  WHEN 'Spain'              THEN 3
  WHEN 'England'            THEN 4
  WHEN 'Brazil'             THEN 5
  WHEN 'Morocco'            THEN 6
  WHEN 'Netherlands'        THEN 7
  WHEN 'Germany'            THEN 8
  WHEN 'Portugal'           THEN 9
  WHEN 'Belgium'            THEN 10
  WHEN 'Mexico'             THEN 11
  WHEN 'Colombia'           THEN 12
  WHEN 'United States'      THEN 13
  WHEN 'Croatia'            THEN 15
  WHEN 'Japan'              THEN 16
  WHEN 'Senegal'            THEN 17
  WHEN 'Uruguay'            THEN 18
  WHEN 'Switzerland'        THEN 19
  WHEN 'Austria'            THEN 21
  WHEN 'Iran'               THEN 22
  WHEN 'South Korea'        THEN 23
  WHEN 'Australia'          THEN 25
  WHEN 'Norway'             THEN 26
  WHEN 'Canada'             THEN 27
  WHEN 'Egypt'              THEN 28
  WHEN 'Algeria'            THEN 29
  WHEN 'Ecuador'            THEN 30
  WHEN 'Ivory Coast'        THEN 31
  WHEN 'Türkiye'            THEN 32
  WHEN 'Sweden'             THEN 36
  WHEN 'Paraguay'           THEN 37
  WHEN 'Panama'             THEN 40
  WHEN 'Scotland'           THEN 41
  WHEN 'Congo DR'           THEN 43
  WHEN 'Czechia'            THEN 44
  WHEN 'Uzbekistan'         THEN 54
  WHEN 'Qatar'              THEN 57
  WHEN 'Tunisia'            THEN 58
  WHEN 'Saudi Arabia'       THEN 59
  WHEN 'Iraq'               THEN 60
  WHEN 'South Africa'       THEN 61
  WHEN 'Cape Verde'         THEN 63
  WHEN 'Bosnia-Herzegovina' THEN 64
  WHEN 'Ghana'              THEN 65
  WHEN 'Jordan'             THEN 68
  WHEN 'Curaçao'            THEN 81
  WHEN 'New Zealand'        THEN 83
  WHEN 'Haiti'              THEN 87
  ELSE fifa_ranking
END
WHERE name IN (
  'Argentina','France','Spain','England','Brazil','Morocco','Netherlands','Germany',
  'Portugal','Belgium','Mexico','Colombia','United States','Croatia','Japan','Senegal',
  'Uruguay','Switzerland','Austria','Iran','South Korea','Australia','Norway','Canada',
  'Egypt','Algeria','Ecuador','Ivory Coast','Türkiye','Sweden','Paraguay','Panama',
  'Scotland','Congo DR','Czechia','Uzbekistan','Qatar','Tunisia','Saudi Arabia','Iraq',
  'South Africa','Cape Verde','Bosnia-Herzegovina','Ghana','Jordan','Curaçao','New Zealand','Haiti'
);
