create table profiles (
  id uuid primary key references auth.users on delete cascade,
  created_at timestamptz default now()
);

create table platform_settings (
  id int primary key default 1,
  free_slots int not null default 20,
  total_users int not null default 0
);
insert into platform_settings (id) values (1);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid references profiles(id),
  invitee_email text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now(),
  resolved_at timestamptz,
  unique (inviter_id)
);

alter table profiles enable row level security;
alter table platform_settings enable row level security;
alter table referrals enable row level security;

create policy "Users can read own profile" on profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Public can read platform settings" on platform_settings for select using (true);

-- Helper function to atomically increment total_users
create or replace function increment_total_users()
returns void
language plpgsql
security definer
as $$
begin
  update platform_settings set total_users = total_users + 1 where id = 1;
end;
$$;
