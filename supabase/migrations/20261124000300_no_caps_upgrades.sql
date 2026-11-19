-- No daily coin limits (tasks and focus pay in full), and homes can be upgraded in place:
-- House → Townhome → Apartments, paying the price difference.

-- ---------------------------------------------------------------------------
-- Tasks pay in full (no daily cap).
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

  v_coins := public.task_reward(v_task.difficulty);
  if v_task.repeat <> 'once' then
    select count(*) + 1 into v_total from public.task_completions where task_id = v_task.id;
    v_bonus := public.milestone_bonus(v_total);
  end if;

  insert into public.task_completions (task_id, user_id, area, period_start, local_day, coins, points, bonus)
  values (v_task.id, v_user, v_task.area, v_period, v_today, v_coins, v_coins, v_bonus);

  insert into public.coin_ledger (user_id, amount, kind, reason, task_id)
  values (v_user, v_coins, 'task', left('Completed: ' || v_task.title, 200), v_task.id);
  if v_bonus > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, task_id)
    values (v_user, v_bonus, 'bonus', left(format('Milestone: %s check-offs of %s', v_total, v_task.title), 200), v_task.id);
  end if;

  return query select v_coins + v_bonus, private.balance(v_user);
end $$;

-- ---------------------------------------------------------------------------
-- Focus pays 1 coin per minute in full (no daily cap).
-- ---------------------------------------------------------------------------
create or replace function public.complete_focus(p_id uuid)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_row public.focus_sessions;
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

  update public.focus_sessions
  set status = 'completed', coins = v_row.minutes, finished_at = now(),
      points = case when area is not null then minutes else 0 end,
      local_day = private.local_today(v_profile.timezone)
  where id = v_row.id;

  insert into public.coin_ledger (user_id, amount, kind, reason)
  values (v_user, v_row.minutes, 'focus',
          left(format('Focused %s min', v_row.minutes) || coalesce(': ' || v_row.label, ''), 200));

  return query select v_row.minutes, private.balance(v_user);
end $$;

-- ---------------------------------------------------------------------------
-- Upgrades: House (cottage) → Townhome (house) → Apartments.
-- ---------------------------------------------------------------------------
alter table public.building_types add column upgrades_to text references public.building_types (id);
update public.building_types set upgrades_to = 'house' where id = 'cottage';
update public.building_types set upgrades_to = 'apartments' where id = 'house';

-- Upgrade a building in place for the price difference. A bigger next step (e.g. 2x2 Apartments) needs a free lot
-- that still covers the building's tile; it uses the first that fits (the building's own tile as the top-left first).
create function public.upgrade_building(p_building_id uuid)
returns table (building_id uuid, cost bigint, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_building public.placed_buildings;
  v_from public.building_types;
  v_to public.building_types;
  v_cost bigint;
  v_x integer;
  v_y integer;
  v_found boolean := false;
  dx integer;
  dy integer;
begin
  v_profile := private.lock_profile(v_user);
  select * into v_building from public.placed_buildings where id = p_building_id and user_id = v_user;
  if not found then
    raise exception 'building_not_found' using errcode = 'P0002';
  end if;
  select * into v_from from public.building_types where id = v_building.type_id;
  if v_from.upgrades_to is null then
    raise exception 'no_upgrade' using errcode = '22023';
  end if;
  select * into v_to from public.building_types where id = v_from.upgrades_to;
  if not private.is_unlocked(v_user, v_to) then
    raise exception 'locked' using errcode = '42501';
  end if;

  -- Find a lot for the upgraded size that covers the old tile.
  <<search>>
  for dy in 0 .. v_to.size - v_from.size loop
    for dx in 0 .. v_to.size - v_from.size loop
      if private.lot_free(v_user, v_profile.city_size, v_building.x - dx, v_building.y - dy, v_to.size, v_building.id) then
        v_x := v_building.x - dx;
        v_y := v_building.y - dy;
        v_found := true;
        exit search;
      end if;
    end loop;
  end loop;
  if not v_found then
    raise exception 'no_room' using errcode = '23P01';
  end if;

  v_cost := greatest(0, v_to.cost - v_building.price_paid);
  if private.balance(v_user) < v_cost then
    raise exception 'not_enough_coins' using errcode = '22023';
  end if;

  update public.placed_buildings
  set type_id = v_to.id, x = v_x, y = v_y, price_paid = greatest(v_building.price_paid, v_to.cost)
  where id = v_building.id;
  if v_cost > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, building_id)
    values (v_user, -v_cost, 'building', format('Upgraded: %s → %s', v_from.name, v_to.name), v_building.id);
  end if;

  return query select v_building.id, v_cost, private.balance(v_user);
end $$;
revoke execute on function public.upgrade_building(uuid) from public, anon;
grant execute on function public.upgrade_building(uuid) to authenticated;
