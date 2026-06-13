create table avatars (
  id uuid primary key default gen_random_uuid(),
  footballer_name text not null,
  initials text not null,
  nation text not null,
  position text not null
);

create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Jay''s League',
  invite_code text unique not null,
  invite_closed boolean not null default false,
  creator_id uuid references profiles(id),
  max_players int not null default 15,
  created_at timestamptz default now()
);

create table league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  profile_name text not null,
  avatar_id uuid references avatars(id),
  joined_at timestamptz default now(),
  unique (league_id, user_id),
  unique (league_id, avatar_id)
);

alter table avatars enable row level security;
alter table leagues enable row level security;
alter table league_members enable row level security;

create policy "Anyone can read avatars" on avatars for select using (true);
create policy "Anyone can read leagues" on leagues for select using (true);
create policy "Members can read league_members" on league_members for select using (true);
create policy "Users can insert own membership" on league_members for insert with check (auth.uid() = user_id);

insert into avatars (footballer_name, initials, nation, position) values
  ('Mbappé', 'MB', 'FRA', 'fwd'),
  ('Messi', 'ME', 'ARG', 'fwd'),
  ('Haaland', 'HA', 'NOR', 'fwd'),
  ('Bellingham', 'BE', 'ENG', 'mid'),
  ('Vinícius Jr', 'VI', 'BRA', 'fwd'),
  ('Kane', 'KA', 'ENG', 'fwd'),
  ('Rodri', 'RO', 'ESP', 'mid'),
  ('Pedri', 'PE', 'ESP', 'mid'),
  ('Saka', 'SA', 'ENG', 'mid'),
  ('Salah', 'SL', 'EGY', 'fwd'),
  ('de Bruyne', 'DB', 'BEL', 'mid'),
  ('Alisson', 'AL', 'BRA', 'gk'),
  ('Courtois', 'CO', 'BEL', 'gk'),
  ('Hakimi', 'HK', 'MAR', 'def'),
  ('Rúben Dias', 'RD', 'POR', 'def'),
  ('Saliba', 'SB', 'FRA', 'def'),
  ('Gvardiol', 'GV', 'CRO', 'def'),
  ('Wirtz', 'WI', 'GER', 'mid'),
  ('Davies', 'DA', 'CAN', 'def'),
  ('Osimhen', 'OS', 'NGA', 'fwd'),
  ('Lautaro', 'LM', 'ARG', 'fwd'),
  ('Maignan', 'MG', 'FRA', 'gk'),
  ('Yamal', 'YA', 'ESP', 'fwd'),
  ('Modrić', 'MO', 'CRO', 'mid'),
  ('Son', 'SO', 'KOR', 'fwd');

insert into leagues (name, invite_code, creator_id) values ('Jay''s League', 'wc2026', null);
