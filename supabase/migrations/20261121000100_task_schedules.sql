-- Task schedules: daily, weekly, monthly, quarterly, yearly, on certain weekdays, or N times a week/month.
--
-- Every completion is for one local day (a task can be checked off at most once a day), and belongs to a
-- period: the day (once, daily, days), the ISO week (weekly, times_per_week), the month (monthly,
-- times_per_month), the quarter or the year. complete_task() enforces how many completions a period allows.

alter table public.tasks
  add column weekdays smallint[],          -- ISO weekdays 1 (Mon) .. 7 (Sun), for 'days'
  add column times_per_period smallint,    -- N, for 'times_per_week' / 'times_per_month'
  add constraint tasks_weekdays_check check (
    (repeat = 'days') = (weekdays is not null)
    and (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]))
  ),
  add constraint tasks_times_check check (
    (repeat in ('times_per_week', 'times_per_month')) = (times_per_period is not null)
    and (times_per_period is null
         or (repeat = 'times_per_week' and times_per_period between 2 and 7)
         or (repeat = 'times_per_month' and times_per_period between 2 and 31))
  );

grant update (weekdays, times_per_period) on public.tasks to authenticated;

-- Sort and de-duplicate weekdays on save.
create function private.tasks_clean_weekdays()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.weekdays is not null then
    new.weekdays := (select array_agg(distinct d order by d) from unnest(new.weekdays) d);
  end if;
  return new;
end $$;
create trigger tasks_clean_weekdays before insert or update of weekdays on public.tasks
  for each row execute function private.tasks_clean_weekdays();
grant execute on function private.tasks_clean_weekdays() to authenticated;

-- One completion per task per day (any schedule); periods may hold several (N times a week/month).
alter table public.task_completions drop constraint task_completions_task_id_period_start_key;
alter table public.task_completions add constraint task_completions_task_day_key unique (task_id, local_day);
create index task_completions_task_period_idx on public.task_completions (task_id, period_start);

-- Start of the period a day belongs to.
create or replace function private.period_start(p_repeat public.task_repeat, p_day date)
returns date language sql immutable set search_path = '' as $$
  select case p_repeat
    when 'weekly' then p_day - (extract(isodow from p_day)::integer - 1)
    when 'times_per_week' then p_day - (extract(isodow from p_day)::integer - 1)
    when 'monthly' then date_trunc('month', p_day)::date
    when 'times_per_month' then date_trunc('month', p_day)::date
    when 'quarterly' then date_trunc('quarter', p_day)::date
    when 'yearly' then date_trunc('year', p_day)::date
    else p_day
  end;
$$;

-- Completions a period allows.
create function private.period_target(p_task public.tasks)
returns integer language sql immutable set search_path = '' as $$
  select case when p_task.repeat in ('times_per_week', 'times_per_month') then p_task.times_per_period else 1 end;
$$;

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

  insert into public.task_completions (task_id, user_id, area, period_start, local_day, coins)
  values (v_task.id, v_user, v_task.area, v_period, v_today, v_coins);

  if v_coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, task_id)
    values (v_user, v_coins, 'task', left('Completed: ' || v_task.title, 200), v_task.id);
  end if;

  return query select v_coins, private.balance(v_user);
end $$;

-- Undo the latest check-off in the current period (for one-off tasks: the check-off, whenever it was).
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

  return query select v_completion.coins, private.balance(v_user);
end $$;

-- The signed-in user's tasks with their progress in the current period.
--   done          the period needs nothing more (or a one-off task is done)
--   done_today    checked off today
--   period_count  completions in the current period; period_target how many it allows
--   scheduled_today  false only for 'days' tasks on a day they aren't on
drop function public.my_tasks();
create function public.my_tasks()
returns table (
  id uuid, title text, area public.life_area, difficulty public.task_difficulty, repeat public.task_repeat,
  weekdays smallint[], times_per_period smallint,
  archived_at timestamptz, created_at timestamptz, reward integer,
  done boolean, done_at timestamptz, done_today boolean,
  period_count integer, period_target integer, scheduled_today boolean,
  total_completions bigint, today date
)
language sql stable security definer set search_path = '' as $$
  with me as (select p.id, private.local_today(p.timezone) as today from public.profiles p where p.id = auth.uid())
  select t.id, t.title, t.area, t.difficulty, t.repeat, t.weekdays, t.times_per_period,
    t.archived_at, t.created_at, public.task_reward(t.difficulty),
    case when t.repeat = 'once' then c.n > 0 else c.n >= private.period_target(t) end,
    c.last_at,
    c.today_n > 0,
    c.n::integer,
    private.period_target(t),
    t.repeat <> 'days' or extract(isodow from me.today)::smallint = any (t.weekdays),
    (select count(*) from public.task_completions x where x.task_id = t.id),
    me.today
  from me
  join public.tasks t on t.user_id = me.id
  cross join lateral (
    select count(*) as n, max(x.completed_at) as last_at, count(*) filter (where x.local_day = me.today) as today_n
    from public.task_completions x
    where x.task_id = t.id
      and (t.repeat = 'once' or x.period_start = private.period_start(t.repeat, me.today))
  ) c
  order by t.created_at;
$$;
revoke execute on function public.my_tasks() from public, anon;
grant execute on function public.my_tasks() to authenticated;
revoke execute on function private.period_target(public.tasks) from public, anon, authenticated;
