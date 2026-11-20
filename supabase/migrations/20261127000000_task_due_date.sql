-- One-off tasks can have a due date (shown on that day in the Tasks calendar). Recurring tasks don't have one.
alter table public.tasks
  add column due_date date,
  add constraint tasks_due_date_once check (due_date is null or repeat = 'once');
grant update (due_date) on public.tasks to authenticated;

drop function public.my_tasks();
create function public.my_tasks()
returns table (
  id uuid, title text, area public.life_area, difficulty public.task_difficulty, repeat public.task_repeat,
  weekdays smallint[], times_per_period smallint,
  archived_at timestamptz, created_at timestamptz, reward integer,
  done boolean, done_at timestamptz, done_today boolean,
  period_count integer, period_target integer, scheduled_today boolean,
  total_completions bigint, today date, icon text, due_date date
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
    t.due_date
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
