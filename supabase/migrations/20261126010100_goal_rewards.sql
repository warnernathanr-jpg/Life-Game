-- Goals and steps earn coins, through functions only (every coin change is a ledger row):
--   * each step pays 15 coins when checked off (the first 20 steps of a goal), taken back when unchecked or deleted;
--   * reaching a goal pays its size bonus (small 150, medium 400, big 750) if it was set at least 3 days earlier
--     (goals should take real time), taken back if it's reopened.
-- Owners can still edit titles, notes, dates and so on directly, but not check things off or delete checked steps.

alter table public.goals
  add column size text not null default 'medium' check (size in ('small', 'medium', 'big')),
  add column reward_coins integer check (reward_coins >= 0);
alter table public.goal_steps add column coins integer not null default 0 check (coins >= 0);

create function public.goal_reward(p_size text) returns integer
language sql immutable set search_path = '' as $$
  select case p_size when 'small' then 150 when 'big' then 750 else 400 end
$$;
create function public.goal_step_reward() returns integer language sql immutable set search_path = '' as $$ select 15 $$;
create function public.goal_min_days() returns integer language sql immutable set search_path = '' as $$ select 3 $$;

-- Checking off and coins only through the functions below.
revoke update, delete on public.goal_steps from authenticated;
grant update (title, position) on public.goal_steps to authenticated;
revoke update on public.goals from authenticated;
grant update (title, notes, area, icon, target_date, size) on public.goals to authenticated;
-- Goals can be deleted any time (coins already earned stay, like a deleted task's check-offs).
drop policy goals_own on public.goals;
create policy goals_select on public.goals for select to authenticated using (user_id = auth.uid());
create policy goals_insert on public.goals for insert to authenticated with check (user_id = auth.uid() and completed_at is null and reward_coins is null);
create policy goals_update on public.goals for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_delete on public.goals for delete to authenticated using (user_id = auth.uid());
drop policy goal_steps_own on public.goal_steps;
create policy goal_steps_select on public.goal_steps for select to authenticated using (user_id = auth.uid());
create policy goal_steps_insert on public.goal_steps for insert to authenticated
  with check (user_id = auth.uid() and done_at is null and coins = 0
              and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()));
create policy goal_steps_update on public.goal_steps for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create function public.complete_goal_step(p_step_id uuid)
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
    v_coins := public.goal_step_reward();
  end if;
  update public.goal_steps gs set done_at = now(), coins = v_coins where gs.id = v_step.id;
  if v_coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, v_coins, 'goal', left('Goal step: ' || v_step.title, 200));
  end if;
  return query select v_coins, private.balance(v_user);
end $$;

create function public.undo_goal_step(p_step_id uuid)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_step public.goal_steps;
begin
  perform private.lock_profile(v_user);
  select * into v_step from public.goal_steps where id = p_step_id and user_id = v_user for update;
  if not found then
    raise exception 'step_not_found' using errcode = 'P0002';
  end if;
  if v_step.done_at is null then
    raise exception 'not_done' using errcode = '22023';
  end if;
  if exists (select 1 from public.goals g where g.id = v_step.goal_id and g.completed_at is not null) then
    raise exception 'goal_done' using errcode = '22023';
  end if;
  update public.goal_steps gs set done_at = null, coins = 0 where gs.id = v_step.id;
  if v_step.coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, -v_step.coins, 'goal', left('Unchecked goal step: ' || v_step.title, 200));
  end if;
  return query select -v_step.coins, private.balance(v_user);
end $$;

create function public.delete_goal_step(p_step_id uuid)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_step public.goal_steps;
begin
  perform private.lock_profile(v_user);
  select * into v_step from public.goal_steps where id = p_step_id and user_id = v_user for update;
  if not found then
    raise exception 'step_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.goals g where g.id = v_step.goal_id and g.completed_at is not null) then
    raise exception 'goal_done' using errcode = '22023';
  end if;
  delete from public.goal_steps where id = v_step.id;
  if v_step.coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, -v_step.coins, 'goal', left('Deleted goal step: ' || v_step.title, 200));
  end if;
  return query select -v_step.coins, private.balance(v_user);
end $$;

create function public.complete_goal(p_goal_id uuid)
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
    v_coins := public.goal_reward(v_goal.size);
  end if;
  update public.goals set completed_at = now(), reward_coins = v_coins where id = v_goal.id;
  if v_coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, v_coins, 'goal', left('Goal reached: ' || v_goal.title, 200));
  end if;
  return query select v_coins, private.balance(v_user);
end $$;

create function public.reopen_goal(p_goal_id uuid)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_goal public.goals;
begin
  perform private.lock_profile(v_user);
  select * into v_goal from public.goals where id = p_goal_id and user_id = v_user for update;
  if not found then
    raise exception 'goal_not_found' using errcode = 'P0002';
  end if;
  if v_goal.completed_at is null then
    raise exception 'not_done' using errcode = '22023';
  end if;
  update public.goals set completed_at = null, reward_coins = null where id = v_goal.id;
  if coalesce(v_goal.reward_coins, 0) > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, -v_goal.reward_coins, 'goal', left('Goal reopened: ' || v_goal.title, 200));
  end if;
  return query select -coalesce(v_goal.reward_coins, 0), private.balance(v_user);
end $$;

revoke execute on function public.complete_goal_step(uuid), public.undo_goal_step(uuid), public.delete_goal_step(uuid),
  public.complete_goal(uuid), public.reopen_goal(uuid) from public, anon;
grant execute on function public.complete_goal_step(uuid), public.undo_goal_step(uuid), public.delete_goal_step(uuid),
  public.complete_goal(uuid), public.reopen_goal(uuid) to authenticated;
