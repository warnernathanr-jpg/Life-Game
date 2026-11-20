-- Achievements pay coins: each badge has a reward (private.achievement_reward), collected once with claim_achievements()
-- (a ledger row per badge, kind 'bonus'). Two new badges: "Added 10 tasks" (tasks_10) and "Added a goal" (goal_added).
-- my_achievement_coins() reports how many badges and coins are waiting (it saves newly earned badges first).

alter table public.achievements add column claimed_at timestamptz;

create function private.achievement_reward(p_id text)
returns integer
language sql immutable set search_path = '' as $$
  select case p_id
    when 'first_checkoff' then 25 when 'checkoffs_100' then 150 when 'checkoffs_1000' then 750
    when 'habit_30' then 100 when 'habit_100' then 300 when 'well_rounded' then 250
    when 'tasks_10' then 50 when 'goal_added' then 25
    when 'goal_first' then 100 when 'goals_5' then 300 when 'focus_first' then 25 when 'focus_10h' then 200
    when 'getting_started' then 25 when 'build_first' then 25 when 'build_50' then 200
    when 'people_100' then 100 when 'people_1000' then 400 when 'land_first' then 50 when 'first_friend' then 50
    else 0 end;
$$;
revoke execute on function private.achievement_reward(text) from public, anon, authenticated;

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
  union all select 'goal_added', (select min(created_at) from public.goals where user_id = p_user)
  union all select 'getting_started', (select claimed_at from public.user_rewards where user_id = p_user and reward = 'tutorial');
$$;
revoke execute on function private.achievement_times(uuid) from public, anon, authenticated;

-- Badges earned but not collected yet, and their coins (saves newly earned badges first).
create function public.my_achievement_coins()
returns table (badges integer, coins integer)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_achievements();
  return query
    select count(*)::integer, coalesce(sum(private.achievement_reward(a.id)), 0)::integer
    from public.achievements a
    where a.user_id = auth.uid() and a.claimed_at is null and private.achievement_reward(a.id) > 0;
end $$;

-- Collect every earned badge's coins (once each).
create function public.claim_achievements()
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_total integer := 0;
  r record;
begin
  perform private.lock_profile(v_user);
  perform public.sync_achievements();
  for r in
    select a.id, private.achievement_reward(a.id) as reward from public.achievements a
    where a.user_id = v_user and a.claimed_at is null and private.achievement_reward(a.id) > 0
    order by a.achieved_at
  loop
    update public.achievements set claimed_at = now() where user_id = v_user and id = r.id;
    insert into public.coin_ledger (user_id, amount, kind, reason) values (v_user, r.reward, 'bonus', 'Achievement: ' || r.id);
    v_total := v_total + r.reward;
  end loop;
  return query select v_total, private.balance(v_user);
end $$;

revoke execute on function public.my_achievement_coins(), public.claim_achievements() from public, anon;
grant execute on function public.my_achievement_coins(), public.claim_achievements() to authenticated;
