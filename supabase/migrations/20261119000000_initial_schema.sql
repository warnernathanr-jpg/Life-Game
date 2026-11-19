-- Life Game: initial schema.
--
-- Two halves joined by an economy:
--   * life tracker: tasks (one-off, daily, weekly) and their completions;
--   * city game: a square grid of land where bought buildings are placed.
-- Coins only move through the security-definer functions below, and every
-- movement is a row in coin_ledger (balance = sum of the ledger). Users can
-- read their own rows (RLS) but never write the ledger, completions or
-- buildings directly.


-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.life_area as enum ('health', 'work', 'learning', 'home', 'social');
create type public.task_difficulty as enum ('easy', 'medium', 'hard');
create type public.task_repeat as enum ('once', 'daily', 'weekly');
create type public.building_category as enum ('residential', 'commercial', 'industrial', 'service');
create type public.ledger_kind as enum ('task', 'task_undo', 'building', 'building_sold', 'land', 'bonus');

-- ---------------------------------------------------------------------------
-- Settings (game rules in one place, readable by everyone signed in)
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Coins per completion, by difficulty.
create function public.task_reward(p_difficulty public.task_difficulty)
returns integer language sql immutable set search_path = '' as $$
  select case p_difficulty when 'easy' then 10 when 'medium' then 25 when 'hard' then 50 end;
$$;

-- Most coins tasks can earn in one day (stops a pile of trivial tasks breaking the economy).
create function public.daily_coin_cap()
returns integer language sql immutable set search_path = '' as $$ select 400 $$;

-- Land: the city starts 8x8 and grows by 2 per purchase, up to 30x30.
create function public.starting_city_size()
returns integer language sql immutable set search_path = '' as $$ select 8 $$;
create function public.max_city_size()
returns integer language sql immutable set search_path = '' as $$ select 30 $$;
-- Price of the next expansion after n purchases: 300 * 1.6^n, rounded to 10.
create function public.land_price(p_purchases integer)
returns bigint language sql immutable set search_path = '' as $$
  select (round(300 * power(1.6, p_purchases) / 10) * 10)::bigint;
$$;

-- Selling a building gives back half its price.
create function public.sell_refund(p_cost bigint)
returns bigint language sql immutable set search_path = '' as $$ select p_cost / 2 $$;

-- ---------------------------------------------------------------------------
-- Profiles (one per login; also the city's size)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  timezone text not null default 'UTC'
    check (char_length(timezone) between 1 and 64),
  city_name text not null default 'My City' check (char_length(city_name) between 1 and 40),
  city_size integer not null default public.starting_city_size()
    check (city_size between 1 and public.max_city_size()),
  land_purchases integer not null default 0 check (land_purchases >= 0),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
-- Only these columns are editable by the user; size and purchases change through buy_land().
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, timezone, city_name) on public.profiles to authenticated;

-- Valid IANA zone (pg_timezone_names), else UTC.
create function private.clean_timezone(p_tz text)
returns text language sql stable set search_path = '' as $$
  select coalesce((select name from pg_catalog.pg_timezone_names where name = p_tz limit 1), 'UTC');
$$;

create function private.profiles_check_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.timezone := private.clean_timezone(new.timezone);
  return new;
end $$;
create trigger profiles_check_timezone before insert or update of timezone on public.profiles
  for each row execute function private.profiles_check_timezone();

-- New login -> profile (time zone from sign-up metadata) and a welcome bonus.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 60), ''),
    coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC')
  );
  insert into public.coin_ledger (user_id, amount, kind, reason)
  values (new.id, 100, 'bonus', 'Welcome bonus');
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  area public.life_area not null,
  difficulty public.task_difficulty not null default 'medium',
  repeat public.task_repeat not null default 'once',
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index tasks_user_idx on public.tasks (user_id, created_at);
alter table public.tasks enable row level security;

create policy "tasks: read own" on public.tasks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "tasks: insert own" on public.tasks
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "tasks: update own" on public.tasks
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "tasks: delete own" on public.tasks
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.tasks from anon, authenticated;
grant select, insert, delete on public.tasks to authenticated;
grant update (title, area, difficulty, repeat, archived_at) on public.tasks to authenticated;

-- One row per task per period (the day for daily, the Monday for weekly, the day done for once).
create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  area public.life_area not null,
  period_start date not null,
  local_day date not null,
  coins integer not null check (coins >= 0),
  completed_at timestamptz not null default now(),
  unique (task_id, period_start)
);
create index task_completions_user_day_idx on public.task_completions (user_id, local_day);
alter table public.task_completions enable row level security;
create policy "task_completions: read own" on public.task_completions
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.task_completions from anon, authenticated;
grant select on public.task_completions to authenticated;

-- ---------------------------------------------------------------------------
-- Coins
-- ---------------------------------------------------------------------------

create table public.coin_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount bigint not null check (amount <> 0),
  kind public.ledger_kind not null,
  reason text not null check (char_length(reason) <= 200),
  task_id uuid references public.tasks (id) on delete set null,
  building_id uuid,
  created_at timestamptz not null default now()
);
create index coin_ledger_user_idx on public.coin_ledger (user_id, created_at desc);
alter table public.coin_ledger enable row level security;
create policy "coin_ledger: read own" on public.coin_ledger
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.coin_ledger from anon, authenticated;
grant select on public.coin_ledger to authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.balance(p_user uuid)
returns bigint language sql stable set search_path = '' as $$
  select coalesce(sum(amount), 0)::bigint from public.coin_ledger where user_id = p_user;
$$;

-- Lock the caller's profile so concurrent purchases/completions run one at a time.
create function private.lock_profile(p_user uuid)
returns public.profiles language plpgsql set search_path = '' as $$
declare
  v public.profiles;
begin
  if p_user is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  select * into v from public.profiles where id = p_user for update;
  if not found then
    raise exception 'no_profile' using errcode = 'P0002';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Buildings
-- ---------------------------------------------------------------------------

-- Catalog (reference data, same for everyone).
create table public.building_types (
  id text primary key check (id ~ '^[a-z_]{2,40}$'),
  name text not null,
  category public.building_category not null,
  icon text not null,
  description text not null,
  cost bigint not null check (cost > 0),
  size integer not null default 1 check (size between 1 and 2),
  population integer not null default 0 check (population >= 0),
  jobs integer not null default 0 check (jobs >= 0),
  happiness integer not null default 0,
  -- Unlocked after this many completed tasks in this life area (null = from the start).
  unlock_area public.life_area,
  unlock_count integer check (unlock_count > 0),
  sort_order integer not null default 0,
  check ((unlock_area is null) = (unlock_count is null))
);
alter table public.building_types enable row level security;
create policy "building_types: read" on public.building_types for select to authenticated using (true);
revoke all on public.building_types from anon, authenticated;
grant select on public.building_types to authenticated;

insert into public.building_types
  (id, name, category, icon, description, cost, size, population, jobs, happiness, unlock_area, unlock_count, sort_order)
values
  ('cottage',      'Cottage',        'residential', '🏠', 'A small home for a few residents.',              40, 1,  4,  0,  0, null,       null, 10),
  ('house',        'Family House',   'residential', '🏡', 'Room for a growing family.',                       90, 1, 10,  0,  1, 'home',        3, 11),
  ('apartments',   'Apartments',     'residential', '🏢', 'Dense housing. Takes a 2×2 lot.',                 320, 2, 48,  0, -1, 'home',       12, 12),
  ('corner_shop',  'Corner Shop',    'commercial',  '🏪', 'Sells the basics. Needs residents nearby.',        60, 1,  0,  4,  1, null,       null, 20),
  ('cafe',         'Café',           'commercial',  '☕', 'A place to meet friends.',                        120, 1,  0,  5,  3, 'social',      3, 21),
  ('office',       'Office Tower',   'commercial',  '🏬', 'Lots of jobs. Takes a 2×2 lot.',                  360, 2,  0, 36,  0, 'work',       15, 22),
  ('workshop',     'Workshop',       'industrial',  '🔧', 'Makes and fixes things. A little noisy.',          70, 1,  0,  6, -1, null,       null, 30),
  ('warehouse',    'Warehouse',      'industrial',  '📦', 'Storage and shipping jobs.',                      140, 1,  0, 10, -2, 'work',        5, 31),
  ('factory',      'Factory',        'industrial',  '🏭', 'Many jobs, more pollution. Takes a 2×2 lot.',     280, 2,  0, 30, -6, 'work',       10, 32),
  ('park',         'Park',           'service',     '🌳', 'Green space. Makes people happier.',               50, 1,  0,  0,  5, 'health',      3, 40),
  ('clinic',       'Clinic',         'service',     '🏥', 'Keeps the city healthy.',                         200, 1,  0,  6,  6, 'health',     10, 41),
  ('school',       'School',         'service',     '🏫', 'Education for the next generation.',              220, 1,  0,  8,  6, 'learning',    5, 42),
  ('library',      'Library',        'service',     '📚', 'Books and quiet.',                                160, 1,  0,  3,  4, 'learning',   10, 43),
  ('fire_station', 'Fire Station',   'service',     '🚒', 'Keeps everyone safe.',                            180, 1,  0,  6,  4, 'home',        6, 44),
  ('community',    'Community Hall', 'service',     '🎪', 'Events and gatherings.',                          240, 1,  0,  4,  7, 'social',     10, 45);

create table public.placed_buildings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type_id text not null references public.building_types (id),
  x integer not null check (x >= 0),
  y integer not null check (y >= 0),
  price_paid bigint not null check (price_paid >= 0),
  created_at timestamptz not null default now()
);
create index placed_buildings_user_idx on public.placed_buildings (user_id);
alter table public.placed_buildings enable row level security;
create policy "placed_buildings: read own" on public.placed_buildings
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.placed_buildings from anon, authenticated;
grant select on public.placed_buildings to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Today in the user's time zone.
create function private.local_today(p_tz text)
returns date language sql stable set search_path = '' as $$
  select (now() at time zone p_tz)::date;
$$;

-- Period a completion counts for.
create function private.period_start(p_repeat public.task_repeat, p_day date)
returns date language sql immutable set search_path = '' as $$
  select case p_repeat
    when 'weekly' then (p_day - (extract(isodow from p_day)::integer - 1))
    else p_day
  end;
$$;

-- Completions per life area (drives unlocks).
create function private.area_counts(p_user uuid)
returns table (area public.life_area, n bigint) language sql stable set search_path = '' as $$
  select c.area, count(*) from public.task_completions c where c.user_id = p_user group by c.area;
$$;

create function private.is_unlocked(p_user uuid, p_type public.building_types)
returns boolean language sql stable set search_path = '' as $$
  select p_type.unlock_area is null
    or coalesce((select n from private.area_counts(p_user) a where a.area = p_type.unlock_area), 0)
       >= p_type.unlock_count;
$$;

-- Is the size×size lot at (x, y) inside the city and free (ignoring p_except)?
create function private.lot_free(p_user uuid, p_city integer, p_x integer, p_y integer, p_size integer, p_except uuid)
returns boolean language sql stable set search_path = '' as $$
  select p_x >= 0 and p_y >= 0 and p_x + p_size <= p_city and p_y + p_size <= p_city
    and not exists (
      select 1
      from public.placed_buildings b
      join public.building_types t on t.id = b.type_id
      where b.user_id = p_user
        and (p_except is null or b.id <> p_except)
        and b.x < p_x + p_size and p_x < b.x + t.size
        and b.y < p_y + p_size and p_y < b.y + t.size
    );
$$;

-- ---------------------------------------------------------------------------
-- Actions (the only way coins move)
-- ---------------------------------------------------------------------------

-- Check off a task for its current period. Returns coins earned (0 once the daily cap is reached).
create function public.complete_task(p_task_id uuid)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_task public.tasks;
  v_today date;
  v_period date;
  v_earned_today integer;
  v_coins integer;
begin
  v_profile := private.lock_profile(v_user);

  select * into v_task from public.tasks where id = p_task_id and user_id = v_user;
  if not found then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;
  if v_task.archived_at is not null then
    raise exception 'task_archived' using errcode = '22023';
  end if;

  v_today := private.local_today(v_profile.timezone);
  v_period := private.period_start(v_task.repeat, v_today);

  if v_task.repeat = 'once' and exists (select 1 from public.task_completions where task_id = v_task.id) then
    raise exception 'already_done' using errcode = '23505';
  end if;
  if exists (select 1 from public.task_completions where task_id = v_task.id and period_start = v_period) then
    raise exception 'already_done' using errcode = '23505';
  end if;

  select coalesce(sum(c.coins), 0) into v_earned_today
  from public.task_completions c where c.user_id = v_user and c.local_day = v_today;
  v_coins := greatest(0, least(public.task_reward(v_task.difficulty), public.daily_coin_cap() - v_earned_today));

  insert into public.task_completions (task_id, user_id, area, period_start, local_day, coins)
  values (v_task.id, v_user, v_task.area, v_period, v_today, v_coins);

  if v_coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, task_id)
    values (v_user, v_coins, 'task', left('Completed: ' || v_task.title, 200), v_task.id);
  end if;

  return query select v_coins, private.balance(v_user);
end $$;

-- Undo this period's check-off: removes the completion and takes its coins back
-- (the balance may go below zero if they were already spent).
create function public.undo_task(p_task_id uuid)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_task public.tasks;
  v_completion public.task_completions;
begin
  v_profile := private.lock_profile(v_user);

  select * into v_task from public.tasks where id = p_task_id and user_id = v_user;
  if not found then
    raise exception 'task_not_found' using errcode = 'P0002';
  end if;

  if v_task.repeat = 'once' then
    select * into v_completion from public.task_completions where task_id = v_task.id
    order by completed_at desc limit 1;
  else
    select * into v_completion from public.task_completions
    where task_id = v_task.id
      and period_start = private.period_start(v_task.repeat, private.local_today(v_profile.timezone));
  end if;
  if v_completion.id is null then
    raise exception 'not_done' using errcode = 'P0002';
  end if;

  delete from public.task_completions where id = v_completion.id;
  if v_completion.coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, task_id)
    values (v_user, -v_completion.coins, 'task_undo', left('Undid: ' || v_task.title, 200), v_task.id);
  end if;

  return query select v_completion.coins, private.balance(v_user);
end $$;

-- Buy a building and place it at (x, y) (its top-left tile).
create function public.buy_building(p_type_id text, p_x integer, p_y integer)
returns table (building_id uuid, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_type public.building_types;
  v_id uuid;
begin
  v_profile := private.lock_profile(v_user);

  select * into v_type from public.building_types where id = p_type_id;
  if not found then
    raise exception 'unknown_building' using errcode = 'P0002';
  end if;
  if not private.is_unlocked(v_user, v_type) then
    raise exception 'locked' using errcode = '42501';
  end if;
  if not private.lot_free(v_user, v_profile.city_size, p_x, p_y, v_type.size, null) then
    raise exception 'lot_taken' using errcode = '23P01';
  end if;
  if private.balance(v_user) < v_type.cost then
    raise exception 'not_enough_coins' using errcode = '22023';
  end if;

  insert into public.placed_buildings (user_id, type_id, x, y, price_paid)
  values (v_user, v_type.id, p_x, p_y, v_type.cost)
  returning id into v_id;

  insert into public.coin_ledger (user_id, amount, kind, reason, building_id)
  values (v_user, -v_type.cost, 'building', 'Bought: ' || v_type.name, v_id);

  return query select v_id, private.balance(v_user);
end $$;

-- Move a placed building to another free lot (free of charge).
create function public.move_building(p_building_id uuid, p_x integer, p_y integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_size integer;
begin
  v_profile := private.lock_profile(v_user);

  select t.size into v_size
  from public.placed_buildings b join public.building_types t on t.id = b.type_id
  where b.id = p_building_id and b.user_id = v_user;
  if not found then
    raise exception 'building_not_found' using errcode = 'P0002';
  end if;
  if not private.lot_free(v_user, v_profile.city_size, p_x, p_y, v_size, p_building_id) then
    raise exception 'lot_taken' using errcode = '23P01';
  end if;

  update public.placed_buildings set x = p_x, y = p_y where id = p_building_id;
end $$;

-- Demolish a building for half of what was paid.
create function public.sell_building(p_building_id uuid)
returns table (refund bigint, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_building public.placed_buildings;
  v_name text;
  v_refund bigint;
begin
  perform private.lock_profile(v_user);

  select * into v_building from public.placed_buildings where id = p_building_id and user_id = v_user;
  if not found then
    raise exception 'building_not_found' using errcode = 'P0002';
  end if;
  select name into v_name from public.building_types where id = v_building.type_id;

  v_refund := public.sell_refund(v_building.price_paid);
  delete from public.placed_buildings where id = v_building.id;
  if v_refund > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, building_id)
    values (v_user, v_refund, 'building_sold', 'Sold: ' || v_name, v_building.id);
  end if;

  return query select v_refund, private.balance(v_user);
end $$;

-- Grow the city by 2 tiles in each direction (new land on the right and bottom).
create function public.buy_land()
returns table (city_size integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_price bigint;
  v_new integer;
begin
  v_profile := private.lock_profile(v_user);

  if v_profile.city_size >= public.max_city_size() then
    raise exception 'max_size' using errcode = '22023';
  end if;
  v_price := public.land_price(v_profile.land_purchases);
  if private.balance(v_user) < v_price then
    raise exception 'not_enough_coins' using errcode = '22023';
  end if;
  v_new := least(public.max_city_size(), v_profile.city_size + 2);

  update public.profiles
  set city_size = v_new, land_purchases = land_purchases + 1
  where id = v_user;

  insert into public.coin_ledger (user_id, amount, kind, reason)
  values (v_user, -v_price, 'land', format('Bought land (%s×%s)', v_new, v_new));

  return query select v_new, private.balance(v_user);
end $$;

-- Coin balance and per-area completion counts for the signed-in user.
create function public.my_progress()
returns table (balance bigint, earned_today integer, health bigint, work bigint, learning bigint, home bigint, social bigint)
language sql stable security definer set search_path = '' as $$
  with me as (select p.* from public.profiles p where p.id = auth.uid())
  select
    private.balance(me.id),
    coalesce((select sum(c.coins) from public.task_completions c
              where c.user_id = me.id and c.local_day = private.local_today(me.timezone)), 0)::integer,
    coalesce((select n from private.area_counts(me.id) where area = 'health'), 0),
    coalesce((select n from private.area_counts(me.id) where area = 'work'), 0),
    coalesce((select n from private.area_counts(me.id) where area = 'learning'), 0),
    coalesce((select n from private.area_counts(me.id) where area = 'home'), 0),
    coalesce((select n from private.area_counts(me.id) where area = 'social'), 0)
  from me;
$$;

-- The signed-in user's tasks, with whether each is done for its current period
-- (today for daily, this week for weekly, ever for one-off), in the user's time zone.
create function public.my_tasks()
returns table (
  id uuid, title text, area public.life_area, difficulty public.task_difficulty, repeat public.task_repeat,
  archived_at timestamptz, created_at timestamptz, reward integer,
  done boolean, done_at timestamptz, done_today boolean, total_completions bigint
)
language sql stable security definer set search_path = '' as $$
  with me as (select p.id, private.local_today(p.timezone) as today from public.profiles p where p.id = auth.uid())
  select t.id, t.title, t.area, t.difficulty, t.repeat, t.archived_at, t.created_at,
    public.task_reward(t.difficulty),
    c.completed_at is not null,
    c.completed_at,
    coalesce(c.local_day = me.today, false),
    (select count(*) from public.task_completions x where x.task_id = t.id)
  from me
  join public.tasks t on t.user_id = me.id
  left join lateral (
    select x.completed_at, x.local_day
    from public.task_completions x
    where x.task_id = t.id
      and (t.repeat = 'once' or x.period_start = private.period_start(t.repeat, me.today))
    order by x.completed_at desc
    limit 1
  ) c on true
  order by t.created_at;
$$;

-- Functions: signed-in users only.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  public.complete_task(uuid), public.undo_task(uuid),
  public.buy_building(text, integer, integer), public.move_building(uuid, integer, integer),
  public.sell_building(uuid), public.buy_land(), public.my_progress(), public.my_tasks(),
  public.task_reward(public.task_difficulty), public.daily_coin_cap(), public.land_price(integer),
  public.starting_city_size(), public.max_city_size(), public.sell_refund(bigint)
to authenticated;

-- The auth trigger and the profile timezone trigger run as their owner / on behalf of the user.
grant usage on schema private to authenticated;
grant execute on function private.clean_timezone(text), private.profiles_check_timezone() to authenticated;
