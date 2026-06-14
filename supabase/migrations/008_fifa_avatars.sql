ALTER TABLE avatars ADD COLUMN IF NOT EXISTS card_type text NOT NULL DEFAULT 'gold';
ALTER TABLE avatars ADD COLUMN IF NOT EXISTS rating int NOT NULL DEFAULT 85;

-- Clear avatar references from league_members before resetting avatars
UPDATE league_members SET avatar_id = NULL WHERE avatar_id IS NOT NULL;

DELETE FROM avatars;

INSERT INTO avatars (id, footballer_name, initials, nation, position, card_type, rating) VALUES
  (gen_random_uuid(), 'Ronaldo',      'CR', 'POR', 'fwd', 'icon',  99),
  (gen_random_uuid(), 'Messi',        'ME', 'ARG', 'fwd', 'icon',  98),
  (gen_random_uuid(), 'Modric',       'LM', 'CRO', 'mid', 'icon',  93),
  (gen_random_uuid(), 'Mbappé',       'KM', 'FRA', 'fwd', 'toty',  97),
  (gen_random_uuid(), 'Haaland',      'EH', 'NOR', 'fwd', 'toty',  96),
  (gen_random_uuid(), 'Vinicius Jr',  'VJ', 'BRA', 'fwd', 'toty',  95),
  (gen_random_uuid(), 'Rodri',        'RD', 'ESP', 'mid', 'toty',  95),
  (gen_random_uuid(), 'Bellingham',   'JB', 'ENG', 'mid', 'tots',  93),
  (gen_random_uuid(), 'Yamal',        'LY', 'ESP', 'fwd', 'tots',  91),
  (gen_random_uuid(), 'Salah',        'MS', 'EGY', 'fwd', 'tots',  92),
  (gen_random_uuid(), 'Saka',         'BS', 'ENG', 'mid', 'tots',  89),
  (gen_random_uuid(), 'Wirtz',        'FW', 'GER', 'mid', 'otw',   88),
  (gen_random_uuid(), 'Davies',       'AD', 'CAN', 'def', 'otw',   86),
  (gen_random_uuid(), 'Son',          'SH', 'KOR', 'fwd', 'hero',  88),
  (gen_random_uuid(), 'Hakimi',       'AH', 'MAR', 'def', 'hero',  87),
  (gen_random_uuid(), 'Osimhen',      'VO', 'NGA', 'fwd', 'hero',  87),
  (gen_random_uuid(), 'Kane',         'HK', 'ENG', 'fwd', 'gold',  91),
  (gen_random_uuid(), 'De Bruyne',    'KB', 'BEL', 'mid', 'gold',  91),
  (gen_random_uuid(), 'Pedri',        'PE', 'ESP', 'mid', 'gold',  88),
  (gen_random_uuid(), 'Courtois',     'TC', 'BEL', 'gk',  'gold',  90),
  (gen_random_uuid(), 'Alisson',      'AB', 'BRA', 'gk',  'gold',  89),
  (gen_random_uuid(), 'Saliba',       'WS', 'FRA', 'def', 'gold',  87),
  (gen_random_uuid(), 'Gvardiol',     'JG', 'CRO', 'def', 'gold',  86),
  (gen_random_uuid(), 'Lautaro',      'LT', 'ARG', 'fwd', 'gold',  88),
  (gen_random_uuid(), 'Maignan',      'MM', 'FRA', 'gk',  'gold',  87);
