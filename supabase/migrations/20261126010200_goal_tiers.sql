-- Goals and steps use the same difficulty tiers as tasks (easy, medium, hard, epic):
--   a step pays what a task of its tier pays (10 / 25 / 50 / 100);
--   a goal pays ten times its tier when reached (100 / 250 / 500 / 1000), if set at least 3 days earlier.
-- Replaces the small / medium / big goal sizes (no goals had been reached yet).

alter table public.goals drop column size;
alter table public.goals add column difficulty public.task_difficulty not null default 'medium';
alter table public.goal_steps add column difficulty public.task_difficulty not null default 'easy';

drop function public.goal_reward(text);
create function public.goal_reward(p_difficulty public.task_difficulty) returns integer
language sql immutable set search_path = '' as $$ select public.task_reward(p_difficulty) * 10 $$;
drop function public.goal_step_reward();

revoke update on public.goals from authenticated;
grant update (title, notes, area, icon, target_date, difficulty) on public.goals to authenticated;
revoke update on public.goal_steps from authenticated;
grant update (title, position, difficulty) on public.goal_steps to authenticated;

create or replace function public.complete_goal_step(p_step_id uuid)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_step public.goal_steps;
  v_goal public.goals;
  v_paid integer;
  v_coins integer := 0;
begin
  perform private.lock_profile(v_user);
  select * into v_step from public.goal_steps where id = p_step_id and user_id = v_user for update;
  if not found then
    raise exception 'step_not_found' using errcode = 'P0002';
  end if;
  if v_step.done_at is not null then
    raise exception 'already_done' using errcode = '23505';
  end if;
  select * into v_goal from public.goals where id = v_step.goal_id;
  if v_goal.completed_at is not null then
    raise exception 'goal_done' using errcode = '22023';
  end if;
  select count(*) into v_paid from public.goal_steps gs where gs.goal_id = v_goal.id and gs.coins > 0;
  if v_paid < 20 then
    v_coins := public.task_reward(v_step.difficulty);
  end if;
  update public.goal_steps gs set done_at = now(), coins = v_coins where gs.id = v_step.id;
  if v_coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, v_coins, 'goal', left('Goal step: ' || v_step.title, 200));
  end if;
  return query select v_coins, private.balance(v_user);
end $$;

create or replace function public.complete_goal(p_goal_id uuid)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_goal public.goals;
  v_coins integer := 0;
begin
  perform private.lock_profile(v_user);
  select * into v_goal from public.goals where id = p_goal_id and user_id = v_user for update;
  if not found then
    raise exception 'goal_not_found' using errcode = 'P0002';
  end if;
  if v_goal.completed_at is not null then
    raise exception 'already_done' using errcode = '23505';
  end if;
  if v_goal.created_at <= now() - make_interval(days => public.goal_min_days()) then
    v_coins := public.goal_reward(v_goal.difficulty);
  end if;
  update public.goals set completed_at = now(), reward_coins = v_coins where id = v_goal.id;
  if v_coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, v_coins, 'goal', left('Goal reached: ' || v_goal.title, 200));
  end if;
  return query select v_coins, private.balance(v_user);
end $$;
