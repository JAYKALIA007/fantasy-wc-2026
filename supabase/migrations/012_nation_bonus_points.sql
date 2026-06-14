CREATE TABLE IF NOT EXISTS nation_bonus_points (
  id uuid primary key default gen_random_uuid(),
  league_member_id uuid references league_members(id) on delete cascade,
  match_id int references matches(id),
  nation_id int references nations(id),
  pick_type text not null, -- 'primary' or 'secondary'
  points int not null,
  awarded_at timestamptz default now(),
  UNIQUE(league_member_id, match_id, nation_id)
);

ALTER TABLE nation_bonus_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read nation_bonus_points" ON nation_bonus_points FOR SELECT USING (true);
CREATE POLICY "Service role can insert nation_bonus_points" ON nation_bonus_points FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can delete nation_bonus_points" ON nation_bonus_points FOR DELETE USING (true);
