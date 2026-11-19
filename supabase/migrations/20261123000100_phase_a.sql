-- Phase A: area points, Epic rewards, habit milestones, focus sessions that count toward an area.
--
-- One coin is spent on everything. Alongside it, every check-off earns AREA POINTS (Health, Work, Knowledge,
-- Personal) equal to the task's base reward, even after the daily coin cap. Points are never spent or lost; they
-- unlock buildings. Recurring tasks pay a one-off MILESTONE BONUS at 10, 30, 100 and 365 total check-offs
-- (kept forever; missing a day never takes anything away).

-- ---------------------------------------------------------------------------
-- Social merges into Personal
-- ---------------------------------------------------------------------------
update public.tasks set area = 'personal' where area = 'social';
update public.task_completions set area = 'personal' where area = 'social';
update public.building_types set unlock_area = 'personal' where unlock_area = 'social';
alter table public.tasks add constraint tasks_area_not_social check (area <> 'social');
alter table public.task_completions add constraint task_completions_area_not_social check (area <> 'social');

-- ---------------------------------------------------------------------------
-- Rewards
-- ---------------------------------------------------------------------------
create or replace function public.task_reward(p_difficulty public.task_difficulty)
returns integer language sql immutable set search_path = '' as $$
  select case p_difficulty when 'easy' then 10 when 'medium' then 25 when 'hard' then 50 when 'epic' then 100 end;
$$;

-- Bonus for reaching a number of total check-offs of a recurring task (0 if none).
create function public.milestone_bonus(p_total integer)
returns integer language sql immutable set search_path = '' as $$
  select case p_total when 10 then 25 when 30 then 75 when 100 then 250 when 365 then 500 else 0 end;
$$;

-- ---------------------------------------------------------------------------
-- Area points
-- ---------------------------------------------------------------------------
alter table public.task_completions
  add column points integer not null default 0 check (points >= 0),
  add column bonus integer not null default 0 check (bonus >= 0);
update public.task_completions c set points = public.task_reward(t.difficulty)
from public.tasks t where t.id = c.task_id;

alter table public.focus_sessions
  add column area public.life_area check (area is null or area <> 'social'),
  add column points integer not null default 0 check (points >= 0);

-- Buildings unlock at a number of area points (was: number of completions).
alter table public.building_types add column unlock_points integer check (unlock_points > 0);
update public.building_types set unlock_points = case id
  when 'house' then 75 when 'apartments' then 300 when 'cafe' then 75 when 'office' then 375
  when 'warehouse' then 125 when 'factory' then 250 when 'park' then 75 when 'clinic' then 250
  when 'school' then 125 when 'library' then 250 when 'fire_station' then 150 when 'community' then 250
end where unlock_area is not null;
alter table public.building_types drop constraint building_types_check;
alter table public.building_types drop column unlock_count;
alter table public.building_types add constraint building_types_unlock_check
  check ((unlock_area is null) = (unlock_points is null) and (unlock_area is null or unlock_area <> 'social'));

-- Points per area for a user (tasks + focus).
create function private.area_points(p_user uuid)
returns table (area public.life_area, points bigint) language sql stable set search_path = '' as $$
  select a.area, sum(a.points)::bigint from (
    select c.area, c.points from public.task_completions c where c.user_id = p_user
    union all
    select f.area, f.points from public.focus_sessions f where f.user_id = p_user and f.area is not null
  ) a group by a.area;
$$;

create or replace function private.is_unlocked(p_user uuid, p_type public.building_types)
returns boolean language sql stable set search_path = '' as $$
  select p_type.unlock_area is null
    or coalesce((select points from private.area_points(p_user) a where a.area = p_type.unlock_area), 0)
       >= p_type.unlock_points;
$$;
drop function private.area_counts(uuid);

-- ---------------------------------------------------------------------------
-- Tasks: points and milestone bonuses
-- ---------------------------------------------------------------------------
create or replace function public.complete_task(p_task_id uuid)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_task public.tasks;
  v_today date;
  v_period date;
  v_done integer;
  v_earned_today integer;
  v_coins integer;
  v_total integer;
  v_bonus integer := 0;
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

  if v_task.repeat = 'days' and not (extract(isodow from v_today)::smallint = any (v_task.weekdays)) then
    raise exception 'not_scheduled_today' using errcode = '22023';
  end if;
  if v_task.repeat = 'once' and exists (select 1 from public.task_completions where task_id = v_task.id) then
    raise exception 'already_done' using errcode = '23505';
  end if;
  if exists (select 1 from public.task_completions where task_id = v_task.id and local_day = v_today) then
    raise exception 'already_done' using errcode = '23505';
  end if;
  select count(*) into v_done from public.task_completions where task_id = v_task.id and period_start = v_period;
  if v_done >= private.period_target(v_task) then
    raise exception 'already_done' using errcode = '23505';
  end if;

  select coalesce(sum(c.coins), 0) into v_earned_today
  from public.task_completions c where c.user_id = v_user and c.local_day = v_today;
  v_coins := greatest(0, least(public.task_reward(v_task.difficulty), public.daily_coin_cap() - v_earned_today));

  if v_task.repeat <> 'once' then
    select count(*) + 1 into v_total from public.task_completions where task_id = v_task.id;
    v_bonus := public.milestone_bonus(v_total);
  end if;

  insert into public.task_completions (task_id, user_id, area, period_start, local_day, coins, points, bonus)
  values (v_task.id, v_user, v_task.area, v_period, v_today, v_coins, public.task_reward(v_task.difficulty), v_bonus);

  if v_coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, task_id)
    values (v_user, v_coins, 'task', left('Completed: ' || v_task.title, 200), v_task.id);
  end if;
  if v_bonus > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, task_id)
    values (v_user, v_bonus, 'bonus', left(format('Milestone: %s check-offs of %s', v_total, v_task.title), 200), v_task.id);
  end if;

  return query select v_coins + v_bonus, private.balance(v_user);
end $$;

create or replace function public.undo_task(p_task_id uuid)
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

  select * into v_completion from public.task_completions
  where task_id = v_task.id
    and (v_task.repeat = 'once'
         or period_start = private.period_start(v_task.repeat, private.local_today(v_profile.timezone)))
  order by completed_at desc
  limit 1;
  if v_completion.id is null then
    raise exception 'not_done' using errcode = 'P0002';
  end if;

  delete from public.task_completions where id = v_completion.id;
  if v_completion.coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, task_id)
    values (v_user, -v_completion.coins, 'task_undo', left('Undid: ' || v_task.title, 200), v_task.id);
  end if;
  if v_completion.bonus > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, task_id)
    values (v_user, -v_completion.bonus, 'task_undo', left('Undid milestone: ' || v_task.title, 200), v_task.id);
  end if;

  return query select v_completion.coins + v_completion.bonus, private.balance(v_user);
end $$;

-- ---------------------------------------------------------------------------
-- Progress: balance, today's coins, points per area
-- ---------------------------------------------------------------------------
drop function public.my_progress();
create function public.my_progress()
returns table (balance bigint, earned_today integer, health bigint, work bigint, knowledge bigint, personal bigint)
language sql stable security definer set search_path = '' as $$
  with me as (select p.* from public.profiles p where p.id = auth.uid())
  select
    private.balance(me.id),
    coalesce((select sum(c.coins) from public.task_completions c
              where c.user_id = me.id and c.local_day = private.local_today(me.timezone)), 0)::integer,
    coalesce((select points from private.area_points(me.id) where area = 'health'), 0),
    coalesce((select points from private.area_points(me.id) where area = 'work'), 0),
    coalesce((select points from private.area_points(me.id) where area = 'knowledge'), 0),
    coalesce((select points from private.area_points(me.id) where area = 'personal'), 0)
  from me;
$$;

-- ---------------------------------------------------------------------------
-- Focus sessions can count toward an area (points = minutes when completed)
-- ---------------------------------------------------------------------------
drop function public.start_focus(integer, text);
create function public.start_focus(p_minutes integer, p_label text default null, p_area public.life_area default null)
returns table (id uuid, started_at timestamptz, ends_at timestamptz, server_now timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_row public.focus_sessions;
begin
  v_profile := private.lock_profile(v_user);
  if p_minutes is null or p_minutes < 5 or p_minutes > 60 then
    raise exception 'bad_minutes' using errcode = '22023';
  end if;
  if p_area = 'social' then
    raise exception 'bad_area' using errcode = '22023';
  end if;

  update public.focus_sessions set status = 'abandoned', finished_at = now()
  where user_id = v_user and status = 'running';

  insert into public.focus_sessions (user_id, minutes, label, area, started_at, ends_at, local_day)
  values (v_user, p_minutes, nullif(left(trim(coalesce(p_label, '')), 80), ''), p_area, now(),
          now() + make_interval(mins => p_minutes), private.local_today(v_profile.timezone))
  returning * into v_row;

  return query select v_row.id, v_row.started_at, v_row.ends_at, now();
end $$;

create or replace function public.complete_focus(p_id uuid)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_row public.focus_sessions;
  v_earned integer;
  v_coins integer;
begin
  v_profile := private.lock_profile(v_user);
  select * into v_row from public.focus_sessions s where s.id = p_id and s.user_id = v_user for update;
  if not found then
    raise exception 'focus_not_found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'running' then
    raise exception 'focus_over' using errcode = '22023';
  end if;
  if now() < v_row.ends_at - interval '3 seconds' then
    raise exception 'focus_too_early' using errcode = '22023';
  end if;
  if now() > v_row.ends_at + public.focus_claim_window() then
    update public.focus_sessions set status = 'abandoned', finished_at = now() where id = v_row.id;
    return query select 0, private.balance(v_user);
    return;
  end if;

  select coalesce(sum(s.coins), 0) into v_earned
  from public.focus_sessions s where s.user_id = v_user and s.local_day = private.local_today(v_profile.timezone);
  v_coins := greatest(0, least(v_row.minutes, public.daily_focus_cap() - v_earned));

  update public.focus_sessions
  set status = 'completed', coins = v_coins, finished_at = now(),
      points = case when area is not null then minutes else 0 end,
      local_day = private.local_today(v_profile.timezone)
  where id = v_row.id;

  if v_coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, v_coins, 'focus',
            left(format('Focused %s min', v_row.minutes) || coalesce(': ' || v_row.label, ''), 200));
  end if;

  return query select v_coins, private.balance(v_user);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.milestone_bonus(integer), public.my_progress(),
  public.start_focus(integer, text, public.life_area) from public, anon;
grant execute on function public.milestone_bonus(integer), public.my_progress(),
  public.start_focus(integer, text, public.life_area) to authenticated;
revoke execute on function private.area_points(uuid) from public, anon, authenticated;
