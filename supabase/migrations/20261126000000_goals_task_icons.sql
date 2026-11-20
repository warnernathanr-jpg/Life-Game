-- Goals (separate from tasks): a title, an optional life area and icon, a target date, notes, and steps (subtasks) that
-- are checked off. Goals don't move coins (yet), so the owner reads and writes them directly under RLS.
-- Tasks get an optional icon (a Lucide icon name from the app's list).

-- ---------------------------------------------------------------------------
-- Task icons
-- ---------------------------------------------------------------------------
alter table public.tasks add column icon text check (icon ~ '^[a-z0-9-]{1,40}$');

drop function public.my_tasks();
create function public.my_tasks()
returns table (
  id uuid, title text, area public.life_area, difficulty public.task_difficulty, repeat public.task_repeat,
  weekdays smallint[], times_per_period smallint,
  archived_at timestamptz, created_at timestamptz, reward integer,
  done boolean, done_at timestamptz, done_today boolean,
  period_count integer, period_target integer, scheduled_today boolean,
  total_completions bigint, today date, icon text
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
    t.icon
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

-- ---------------------------------------------------------------------------
-- Goals and their steps
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text check (char_length(notes) <= 1000),
  area public.life_area check (area is null or area <> 'social'),
  icon text check (icon ~ '^[a-z0-9-]{1,40}$'),
  target_date date not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index goals_user_idx on public.goals (user_id, completed_at, target_date);

create table public.goal_steps (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  position integer not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index goal_steps_goal_idx on public.goal_steps (goal_id, position);

alter table public.goals enable row level security;
alter table public.goal_steps enable row level security;

create policy goals_own on public.goals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- A step belongs to the user and to one of the user's own goals.
create policy goal_steps_own on public.goal_steps for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()));

grant select, insert, update, delete on public.goals, public.goal_steps to authenticated;
-- A user can't hand a goal or step to someone else.
revoke update (user_id) on public.goals from authenticated;
revoke update (user_id, goal_id) on public.goal_steps from authenticated;
