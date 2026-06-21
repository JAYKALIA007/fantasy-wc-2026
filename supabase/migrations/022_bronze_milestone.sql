-- Add bronze final milestone support.
-- 1. Seed the bronze final round (July 18, 2026 — 3rd-place playoff).
-- 2. Expand the milestone check constraint on progression_bonus_points to allow 'bronze'.
--    Postgres requires drop + recreate for check constraints.

insert into rounds (id, name, start_date, end_date) values
  ('a0000000-0000-0000-0000-000000000008', 'bronze', '2026-07-18', '2026-07-18')
on conflict (id) do update
  set name = excluded.name,
      start_date = excluded.start_date,
      end_date = excluded.end_date;

alter table progression_bonus_points
  drop constraint progression_bonus_points_milestone_check;

alter table progression_bonus_points
  add constraint progression_bonus_points_milestone_check
  check (milestone in ('ro32', 'r16', 'qf', 'sf', 'bronze', 'final', 'win'));
