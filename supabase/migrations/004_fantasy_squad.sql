-- Nations table: issue 003 creates it first, but we use if not exists for safety
create table if not exists nations (
  id int primary key,
  name text not null,
  flag_code text not null,
  fifa_ranking int,
  eliminated boolean not null default false,
  eliminated_in_round text
);

create table football_players (
  id int primary key,
  name text not null,
  nation_id int references nations(id),
  position text not null check (position in ('gk','def','mid','fwd')),
  photo_url text,
  current_price decimal(4,1) not null,
  initial_price decimal(4,1) not null
);

create table fantasy_squads (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id),
  user_id uuid not null references profiles(id),
  round_id uuid not null,
  squad_value_cap decimal(5,1) not null default 100.0,
  created_at timestamptz default now(),
  unique (league_id, user_id, round_id)
);

create table fantasy_squad_players (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references fantasy_squads(id) on delete cascade,
  player_id int not null references football_players(id),
  is_starting boolean not null default true,
  is_captain boolean not null default false,
  is_vice_captain boolean not null default false,
  unique (squad_id, player_id)
);

alter table football_players enable row level security;
alter table fantasy_squads enable row level security;
alter table fantasy_squad_players enable row level security;

create policy "Anyone can read football_players" on football_players for select using (true);
create policy "Users can read own squads" on fantasy_squads for select using (auth.uid() = user_id);
create policy "Users can insert own squads" on fantasy_squads for insert with check (auth.uid() = user_id);
create policy "Users can update own squads" on fantasy_squads for update using (auth.uid() = user_id);
create policy "Users can read own squad players" on fantasy_squad_players for select using (
  exists (select 1 from fantasy_squads where id = squad_id and user_id = auth.uid())
);
create policy "Users can insert own squad players" on fantasy_squad_players for insert with check (
  exists (select 1 from fantasy_squads where id = squad_id and user_id = auth.uid())
);
create policy "Users can delete own squad players" on fantasy_squad_players for delete using (
  exists (select 1 from fantasy_squads where id = squad_id and user_id = auth.uid())
);

create index on football_players (nation_id, position);

-- Seed extra nations (1-16 already seeded by migration 003)
insert into nations (id, name, flag_code, fifa_ranking) values
  (17,'Italy','ITA',9),(18,'Colombia','COL',12),(19,'Ecuador','ECU',44),
  (20,'Canada','CAN',48),(21,'Belgium','BEL',3),(22,'Switzerland','SUI',21),
  (23,'Nigeria','NGA',40),(24,'Cameroon','CMR',43),(25,'South Korea','KOR',22),
  (26,'Saudi Arabia','KSA',56),(27,'Qatar','QAT',37),(28,'Iran','IRN',20),
  (29,'Tunisia','TUN',30),(30,'New Zealand','NZL',96),(31,'Norway','NOR',34),(32,'Denmark','DEN',20)
on conflict do nothing;

insert into football_players (id, name, nation_id, position, current_price, initial_price) values
  -- GKs (8)
  (1,'Maignan',1,'gk',5.0,5.0),
  (2,'Pickford',2,'gk',4.5,4.5),
  (3,'Unai Simón',3,'gk',5.0,5.0),
  (4,'Neuer',4,'gk',5.5,5.5),
  (5,'Alisson',5,'gk',6.0,6.0),
  (6,'E. Martínez',6,'gk',7.0,7.0),
  (7,'Diogo Costa',7,'gk',5.0,5.0),
  (8,'Flekken',8,'gk',4.5,4.5),
  -- DEFs (16)
  (9,'Saliba',1,'def',5.5,5.5),
  (10,'Hernandez',1,'def',6.0,6.0),
  (11,'Alexander-Arnold',2,'def',7.5,7.5),
  (12,'Guehi',2,'def',5.0,5.0),
  (13,'Carvajal',3,'def',6.5,6.5),
  (14,'Le Normand',3,'def',5.5,5.5),
  (15,'Rüdiger',4,'def',6.0,6.0),
  (16,'Kimmich',4,'def',7.0,7.0),
  (17,'Marquinhos',5,'def',6.5,6.5),
  (18,'Militão',5,'def',6.0,6.0),
  (19,'Romero',6,'def',6.5,6.5),
  (20,'Rúben Dias',7,'def',6.0,6.0),
  (21,'Hakimi',9,'def',6.5,6.5),
  (22,'Gvardiol',10,'def',7.0,7.0),
  (23,'Davies',20,'def',5.0,5.0),
  (24,'van Dijk',8,'def',6.5,6.5),
  -- MIDs (18)
  (25,'Bellingham',2,'mid',9.5,9.5),
  (26,'Saka',2,'mid',8.0,8.0),
  (27,'Pedri',3,'mid',8.0,8.0),
  (28,'Rodri',3,'mid',8.5,8.5),
  (29,'Tchouaméni',1,'mid',7.0,7.0),
  (30,'Camavinga',1,'mid',7.5,7.5),
  (31,'Kroos',4,'mid',8.0,8.0),
  (32,'Wirtz',4,'mid',7.0,7.0),
  (33,'Vinicius Jr',5,'mid',10.5,10.5),
  (34,'Rodrygo',5,'mid',8.0,8.0),
  (35,'de Paul',6,'mid',6.5,6.5),
  (36,'Mac Allister',6,'mid',7.0,7.0),
  (37,'B. Fernandes',7,'mid',7.5,7.5),
  (38,'Vitinha',7,'mid',6.5,6.5),
  (39,'Modrić',10,'mid',6.5,6.5),
  (40,'Kovačić',10,'mid',6.0,6.0),
  (41,'de Bruyne',21,'mid',9.0,9.0),
  (42,'Son',25,'mid',8.0,8.0),
  -- FWDs (16)
  (43,'Mbappé',1,'fwd',12.5,12.5),
  (44,'Dembélé',1,'fwd',9.0,9.0),
  (45,'Kane',2,'fwd',11.5,11.5),
  (46,'Watkins',2,'fwd',7.5,7.5),
  (47,'Yamal',3,'fwd',10.0,10.0),
  (48,'Morata',3,'fwd',7.0,7.0),
  (49,'Havertz',4,'fwd',8.5,8.5),
  (50,'Gnabry',4,'fwd',7.0,7.0),
  (51,'Savinho',5,'fwd',8.5,8.5),
  (52,'Messi',6,'fwd',12.0,12.0),
  (53,'Lautaro',6,'fwd',9.5,9.5),
  (54,'Ronaldo',7,'fwd',11.0,11.0),
  (55,'Gakpo',8,'fwd',8.5,8.5),
  (56,'Haaland',31,'fwd',11.5,11.5),
  (57,'Osimhen',23,'fwd',9.0,9.0),
  (58,'Ziyech',9,'fwd',7.5,7.5);
