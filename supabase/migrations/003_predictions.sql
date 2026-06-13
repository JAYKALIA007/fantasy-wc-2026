create table nations (
  id int primary key,
  name text not null,
  flag_code text not null,
  fifa_ranking int,
  eliminated boolean not null default false,
  eliminated_in_round text
);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  squad_lock_time timestamptz
);

create table matches (
  id int primary key,
  round_id uuid references rounds(id),
  home_nation_id int references nations(id),
  away_nation_id int references nations(id),
  kickoff_time timestamptz not null,
  home_score int,
  away_score int,
  status text not null default 'scheduled' check (status in ('scheduled','live','finished'))
);

create table predictions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id),
  user_id uuid not null references profiles(id),
  match_id int not null references matches(id),
  predicted_home_score int not null,
  predicted_away_score int not null,
  submitted_at timestamptz default now(),
  points int,
  unique (league_id, user_id, match_id)
);

create table prediction_round_scores (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id),
  user_id uuid not null references profiles(id),
  round_id uuid not null references rounds(id),
  total_points int not null default 0,
  unique (league_id, user_id, round_id)
);

alter table nations enable row level security;
alter table rounds enable row level security;
alter table matches enable row level security;
alter table predictions enable row level security;
alter table prediction_round_scores enable row level security;

create policy "Anyone can read nations" on nations for select using (true);
create policy "Anyone can read rounds" on rounds for select using (true);
create policy "Anyone can read matches" on matches for select using (true);
create policy "Users can read predictions" on predictions for select using (true);
create policy "Users can insert own predictions" on predictions for insert with check (auth.uid() = user_id);
create policy "Users can update own predictions" on predictions for update using (auth.uid() = user_id);
create policy "Anyone can read prediction_round_scores" on prediction_round_scores for select using (true);

create index on prediction_round_scores (league_id, round_id);
create index on predictions (user_id, match_id);

-- Scoring function
create or replace function score_prediction(p_id uuid)
returns void language plpgsql security definer as $$
declare
  p predictions%rowtype;
  m matches%rowtype;
  pts int := 0;
begin
  select * into p from predictions where id = p_id;
  select * into m from matches where id = p.match_id;
  if m.status != 'finished' then return; end if;

  -- correct result
  if (p.predicted_home_score > p.predicted_away_score) = (m.home_score > m.away_score)
     and (p.predicted_home_score = p.predicted_away_score) = (m.home_score = m.away_score)
  then pts := 1; end if;

  -- exact score bonus
  if p.predicted_home_score = m.home_score and p.predicted_away_score = m.away_score
  then pts := 3; end if;

  update predictions set points = pts where id = p_id;

  -- upsert prediction_round_scores
  insert into prediction_round_scores (league_id, user_id, round_id, total_points)
    select p.league_id, p.user_id, m.round_id, pts
    on conflict (league_id, user_id, round_id)
    do update set total_points = prediction_round_scores.total_points + excluded.total_points;
end;
$$;

-- Seed data
insert into rounds (id, name, start_date, end_date) values
  ('a0000000-0000-0000-0000-000000000001', 'group_stage', '2026-06-11', '2026-07-02'),
  ('a0000000-0000-0000-0000-000000000002', 'r16', '2026-07-04', '2026-07-08');

insert into nations (id, name, flag_code, fifa_ranking) values
  (1,'France','FRA',2),(2,'England','ENG',5),(3,'Spain','ESP',1),
  (4,'Germany','GER',13),(5,'Brazil','BRA',3),(6,'Argentina','ARG',4),
  (7,'Portugal','POR',6),(8,'Netherlands','NED',7),(9,'Morocco','MAR',14),
  (10,'Croatia','CRO',10),(11,'Japan','JPN',18),(12,'USA','USA',16),
  (13,'Uruguay','URU',20),(14,'Senegal','SEN',19),(15,'Australia','AUS',23),(16,'Mexico','MEX',15);

-- 6 upcoming + 2 finished matches in R16
insert into matches (id, round_id, home_nation_id, away_nation_id, kickoff_time, home_score, away_score, status) values
  (1, 'a0000000-0000-0000-0000-000000000002', 1, 2, now() + interval '3 hours', null, null, 'scheduled'),
  (2, 'a0000000-0000-0000-0000-000000000002', 3, 4, now() + interval '6 hours', null, null, 'scheduled'),
  (3, 'a0000000-0000-0000-0000-000000000002', 5, 6, now() + interval '27 hours', null, null, 'scheduled'),
  (4, 'a0000000-0000-0000-0000-000000000002', 7, 8, now() + interval '30 hours', null, null, 'scheduled'),
  (5, 'a0000000-0000-0000-0000-000000000002', 9, 10, now() + interval '51 hours', null, null, 'scheduled'),
  (6, 'a0000000-0000-0000-0000-000000000002', 11, 12, now() + interval '54 hours', null, null, 'scheduled'),
  (7, 'a0000000-0000-0000-0000-000000000002', 13, 14, now() - interval '3 hours', 2, 1, 'finished'),
  (8, 'a0000000-0000-0000-0000-000000000002', 15, 16, now() - interval '6 hours', 0, 0, 'finished');
