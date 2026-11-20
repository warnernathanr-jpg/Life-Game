-- Times of day for daily / certain-days tasks: a task can list Morning, Afternoon and/or Night and is then checked off once
-- per listed time each day (e.g. "Eat a healthy meal" × 3), each paying its coins. Tasks without times work as before.
alter table public.tasks
  add column times_of_day text[] check (
    times_of_day is null
    or (cardinality(times_of_day) between 1 and 3 and times_of_day <@ array['morning', 'afternoon', 'night']::text[])
  ),
  add constraint tasks_times_need_daily check (times_of_day is null or repeat in ('daily', 'days'));
grant update (times_of_day) on public.tasks to authenticated;

alter table public.task_completions add column slot text check (slot in ('morning', 'afternoon', 'night'));
alter table public.task_completions drop constraint task_completions_task_day_key;
create unique index task_completions_task_day_slot_key on public.task_completions (task_id, local_day, coalesce(slot, ''));

-- How many check-offs a period allows: N times a week/month, or one per time of day.
create or replace function private.period_target(p_task public.tasks)
returns integer language sql immutable set search_path = '' as $$
  select case
    when p_task.repeat in ('times_per_week', 'times_per_month') then p_task.times_per_period
    when p_task.times_of_day is not null then cardinality(p_task.times_of_day)
    else 1 end;
$$;

drop function public.complete_task(uuid);
create function public.complete_task(p_task_id uuid, p_slot text default null)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_task public.tasks;
  v_today date;
  v_period date;
  v_done integer;
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
  if v_task.times_of_day is not null then
    -- One check-off per listed time of day.
    if p_slot is null or not (p_slot = any (v_task.times_of_day)) then
      raise exception 'pick_a_time' using errcode = '22023';
    end if;
    if exists (select 1 from public.task_completions where task_id = v_task.id and local_day = v_today and slot = p_slot) then
      raise exception 'already_done' using errcode = '23505';
    end if;
  else
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
  end if;

  v_coins := public.task_reward(v_task.difficulty);
  if v_task.repeat <> 'once' then
    select count(*) + 1 into v_total from public.task_completions where task_id = v_task.id;
    v_bonus := public.milestone_bonus(v_total);
  end if;

  insert into public.task_completions (task_id, user_id, area, period_start, local_day, coins, points, bonus, slot)
  values (v_task.id, v_user, v_task.area, v_period, v_today, v_coins, v_coins, v_bonus,
          case when v_task.times_of_day is not null then p_slot end);

  insert into public.coin_ledger (user_id, amount, kind, reason, task_id)
  values (v_user, v_coins, 'task', left('Completed: ' || v_task.title || coalesce(' (' || p_slot || ')', ''), 200), v_task.id);
  if v_bonus > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, task_id)
    values (v_user, v_bonus, 'bonus', left(format('Milestone: %s check-offs of %s', v_total, v_task.title), 200), v_task.id);
  end if;

  return query select v_coins + v_bonus, private.balance(v_user);
end $$;

drop function public.undo_task(uuid);
create function public.undo_task(p_task_id uuid, p_slot text default null)
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

  -- With a time of day: today's check-off for that time. Otherwise the latest one in the current period.
  select * into v_completion from public.task_completions
  where task_id = v_task.id
    and (p_slot is null or (slot = p_slot and local_day = private.local_today(v_profile.timezone)))
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

revoke execute on function public.complete_task(uuid, text), public.undo_task(uuid, text) from public, anon;
grant execute on function public.complete_task(uuid, text), public.undo_task(uuid, text) to authenticated;

drop function public.my_tasks();
create function public.my_tasks()
returns table (
  id uuid, title text, area public.life_area, difficulty public.task_difficulty, repeat public.task_repeat,
  weekdays smallint[], times_per_period smallint,
  archived_at timestamptz, created_at timestamptz, reward integer,
  done boolean, done_at timestamptz, done_today boolean,
  period_count integer, period_target integer, scheduled_today boolean,
  total_completions bigint, today date, icon text, due_date date,
  times_of_day text[], slots_done text[]
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
    me.today,
    t.icon,
    t.due_date,
    t.times_of_day,
    coalesce(c.slots, '{}')
  from me
  join public.tasks t on t.user_id = me.id
  cross join lateral (
    select count(*) as n, max(x.completed_at) as last_at, count(*) filter (where x.local_day = me.today) as today_n,
      array_agg(x.slot) filter (where x.local_day = me.today and x.slot is not null) as slots
    from public.task_completions x
    where x.task_id = t.id
      and (t.repeat = 'once' or x.period_start = private.period_start(t.repeat, me.today))
  ) c
  order by t.created_at;
$$;
revoke execute on function public.my_tasks() from public, anon;
grant execute on function public.my_tasks() to authenticated;
