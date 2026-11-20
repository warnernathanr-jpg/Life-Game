-- Achievements and a timeline. Badges are worked out from what the player has done (check-offs, habits, goals, focus, the
-- city, friends) and saved the first time they're earned, so they're kept forever: demolishing buildings or deleting a task
-- never takes one away. sync_achievements() saves any newly earned badge with the moment it was first earned; my_timeline()
-- lists the player's story (badges, goals reached, habit milestones, population milestones, land bought, the day they started).

create table public.achievements (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9_]{2,40}$'),
  achieved_at timestamptz not null,
  seen boolean not null default false,
  primary key (user_id, id)
);
alter table public.achievements enable row level security;
create policy achievements_select on public.achievements for select to authenticated using (user_id = auth.uid());
revoke all on public.achievements from anon, authenticated;
grant select on public.achievements to authenticated;

-- When each badge was (or would have been) first earned; null if not yet.
create function private.achievement_times(p_user uuid)
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
  union all select 'getting_started', (select claimed_at from public.user_rewards where user_id = p_user and reward = 'tutorial');
$$;
revoke execute on function private.achievement_times(uuid) from public, anon, authenticated;

-- Save newly earned badges (never removes any); returns how many were new.
create function public.sync_achievements()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_new integer;
begin
  insert into public.achievements (user_id, id, achieved_at)
  select auth.uid(), t.id, t.at from private.achievement_times(auth.uid()) t where t.at is not null
  on conflict do nothing;
  get diagnostics v_new = row_count;
  return v_new;
end $$;

-- Mark every badge as seen (clears the "New" labels).
create function public.mark_achievements_seen()
returns void
language sql security definer set search_path = '' as $$
  update public.achievements set seen = true where user_id = auth.uid() and not seen;
$$;

-- The player's story, newest first.
create function public.my_timeline()
returns table (at timestamptz, kind text, title text, detail text)
language sql stable security definer set search_path = '' as $$
  select * from (
    select a.achieved_at, 'achievement', a.id, null::text from public.achievements a where a.user_id = auth.uid()
    union all
    select g.completed_at, 'goal', g.title, null from public.goals g where g.user_id = auth.uid() and g.completed_at is not null
    union all
    select c.completed_at, 'habit', coalesce(c.title, 'A habit'), c.bonus::text
    from public.task_completions c where c.user_id = auth.uid() and c.bonus > 0
    union all
    select m.claimed_at, 'milestone', m.population::text, null from public.city_milestones m where m.user_id = auth.uid()
    union all
    select l.created_at, 'land', l.reason, null from public.coin_ledger l where l.user_id = auth.uid() and l.kind = 'land'
    union all
    select p.created_at, 'joined', p.city_name, null from public.profiles p where p.id = auth.uid()
  ) t (at, kind, title, detail)
  order by at desc
  limit 300;
$$;

revoke execute on function public.sync_achievements(), public.mark_achievements_seen(), public.my_timeline() from public, anon;
grant execute on function public.sync_achievements(), public.mark_achievements_seen(), public.my_timeline() to authenticated;

-- Start over also clears achievements (a true fresh start).
create or replace function public.reset_progress(p_confirm text)
returns table (balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if p_confirm is distinct from 'START OVER' then
    raise exception 'confirm_reset' using errcode = '22023';
  end if;
  perform private.lock_profile(v_user);
  delete from public.placed_buildings where user_id = v_user;
  delete from public.road_controls where user_id = v_user;
  delete from public.city_milestones where user_id = v_user;
  delete from public.achievements where user_id = v_user;
  delete from public.task_completions where user_id = v_user;
  delete from public.tasks where user_id = v_user;
  delete from public.focus_sessions where user_id = v_user;
  delete from public.goals where user_id = v_user; -- steps go with them
  delete from public.user_rewards where user_id = v_user;
  delete from public.coin_ledger where user_id = v_user;
  update public.profiles set city_size = 8, land_purchases = 0 where id = v_user;
  insert into public.coin_ledger (user_id, amount, kind, reason) values (v_user, 100, 'bonus', 'Welcome bonus (started over)');
  return query select private.balance(v_user);
end $$;
