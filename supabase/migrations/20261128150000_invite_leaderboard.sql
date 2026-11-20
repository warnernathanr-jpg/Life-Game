-- Sharing the invite link earns a badge ("Spread the word", 50 coins); becoming friends now pays 100. A global leaderboard of
-- the 10 most populous cities; anyone on it can be visited (view only), like a friend's city.

alter table public.profiles add column invite_shared_at timestamptz;

-- The app calls this when the player shares or copies their invite link (the first time is kept).
create function public.record_invite_shared()
returns void
language sql security definer set search_path = '' as $$
  update public.profiles set invite_shared_at = now() where id = auth.uid() and invite_shared_at is null;
$$;

create or replace function private.achievement_reward(p_id text)
returns integer
language sql immutable set search_path = '' as $$
  select case p_id
    when 'first_checkoff' then 25 when 'checkoffs_100' then 150 when 'checkoffs_1000' then 750
    when 'habit_30' then 100 when 'habit_100' then 300 when 'well_rounded' then 250
    when 'tasks_10' then 50 when 'goal_added' then 25
    when 'goal_first' then 100 when 'goals_5' then 300 when 'focus_first' then 25 when 'focus_10h' then 200
    when 'getting_started' then 25 when 'build_first' then 25 when 'build_50' then 200
    when 'people_100' then 100 when 'people_1000' then 400 when 'land_first' then 50 when 'first_friend' then 100 when 'invite_shared' then 50
    else 0 end;
$$;

create or replace function private.achievement_times(p_user uuid)
returns table (id text, at timestamptz)
language sql stable security definer set search_path = '' as $$
  with checkoffs as (
    -- real check-offs only (hand-granted points have no task and no coins)
    select c.completed_at, c.area, c.points, coalesce(c.task_id::text, c.title) as habit,
      row_number() over (order by c.completed_at) as n,
      row_number() over (partition by coalesce(c.task_id::text, c.title) order by c.completed_at) as per_habit
    from public.task_completions c where c.user_id = p_user and (c.task_id is not null or c.coins > 0)
  ),
  goals_done as (
    select g.completed_at, row_number() over (order by g.completed_at) as n
    from public.goals g where g.user_id = p_user and g.completed_at is not null
  ),
  focus as (
    select f.finished_at, sum(f.minutes) over (order by f.finished_at) as total, row_number() over (order by f.finished_at) as n
    from public.focus_sessions f where f.user_id = p_user and f.status = 'completed'
  ),
  built as (
    select b.created_at, row_number() over (order by b.created_at) as n
    from public.placed_buildings b join public.building_types t on t.id = b.type_id
    where b.user_id = p_user and t.category not in ('road', 'landscape')
  ),
  area_points as (
    select c.area, c.completed_at, sum(c.points) over (partition by c.area order by c.completed_at) as total
    from public.task_completions c where c.user_id = p_user
  ),
  rounded as (
    select case when count(distinct a.area) = 4 then max(a.first_at) end as at
    from (select area, min(completed_at) as first_at from area_points where total >= 250 group by area) a
  )
  select 'first_checkoff', (select completed_at from checkoffs where n = 1)
  union all select 'checkoffs_100', (select completed_at from checkoffs where n = 100)
  union all select 'checkoffs_1000', (select completed_at from checkoffs where n = 1000)
  union all select 'habit_30', (select min(completed_at) from checkoffs where per_habit = 30)
  union all select 'habit_100', (select min(completed_at) from checkoffs where per_habit = 100)
  union all select 'goal_first', (select completed_at from goals_done where n = 1)
  union all select 'goals_5', (select completed_at from goals_done where n = 5)
  union all select 'focus_first', (select finished_at from focus where n = 1)
  union all select 'focus_10h', (select min(finished_at) from focus where total >= 600)
  union all select 'build_first', (select created_at from built where n = 1)
  union all select 'build_50', (select created_at from built where n = 50)
  union all select 'people_100', (select claimed_at from public.city_milestones where user_id = p_user and population = 100)
  union all select 'people_1000', (select claimed_at from public.city_milestones where user_id = p_user and population = 1000)
  union all select 'land_first', (select min(created_at) from public.coin_ledger where user_id = p_user and kind = 'land')
  union all select 'well_rounded', (select at from rounded)
  union all select 'first_friend', (select min(created_at) from public.friendships where user_id = p_user)
  union all select 'tasks_10', (select t.created_at from (select created_at, row_number() over (order by created_at) as n
      from public.tasks where user_id = p_user) t where t.n = 10)
  union all select 'invite_shared', (select invite_shared_at from public.profiles where id = p_user)
  union all select 'goal_added', (select min(created_at) from public.goals where user_id = p_user)
  union all select 'getting_started', (select claimed_at from public.user_rewards where user_id = p_user and reward = 'tutorial');
$$;

-- The most populous cities (homes beside a road), biggest first; ties by buildings, then the older city.
create function private.top_cities(p_limit integer)
returns table (rank integer, user_id uuid, population integer, buildings integer)
language sql stable security definer set search_path = '' as $$
  select (row_number() over (order by c.population desc, c.buildings desc, c.created_at))::integer, c.id, c.population, c.buildings
  from (
    select p.id, p.created_at, private.city_population(p.id) as population,
      (select count(*) from public.placed_buildings b join public.building_types t on t.id = b.type_id
       where b.user_id = p.id and t.category not in ('road', 'landscape'))::integer as buildings
    from public.profiles p
  ) c
  where c.population > 0
  order by 1
  limit p_limit;
$$;
revoke execute on function private.top_cities(integer) from public, anon, authenticated;

-- The top 10 for everyone to see: name, city, people, buildings (nothing private).
create function public.leaderboard()
returns table (rank integer, user_id uuid, display_name text, city_name text, population integer, buildings integer, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select t.rank, t.user_id, p.display_name, p.city_name, t.population, t.buildings, t.user_id = auth.uid()
  from private.top_cities(10) t join public.profiles p on p.id = t.user_id
  order by t.rank;
$$;

create or replace function public.friend_city(p_friend uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.friendships f where f.user_id = auth.uid() and f.friend_id = p_friend)
     and not exists (select 1 from private.top_cities(10) t where t.user_id = p_friend) then
    raise exception 'not_a_friend' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'city_name', p.city_name,
      'display_name', p.display_name,
      'city_size', p.city_size,
      'placed', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'type_id', b.type_id, 'x', b.x, 'y', b.y,
                 'facing', b.facing, 'rotated', b.rotated, 'color_seed', b.color_seed) order by b.created_at)
               from public.placed_buildings b where b.user_id = p.id), '[]'::jsonb),
      'controls', coalesce((select jsonb_agg(jsonb_build_object('x', c.x, 'y', c.y, 'kind', c.kind))
               from public.road_controls c where c.user_id = p.id), '[]'::jsonb)
    )
    from public.profiles p where p.id = p_friend
  );
end $$;

revoke execute on function public.record_invite_shared(), public.leaderboard() from public, anon;
grant execute on function public.record_invite_shared(), public.leaderboard() to authenticated;
