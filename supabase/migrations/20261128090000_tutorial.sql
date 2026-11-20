-- Getting started: a six-step guided start for new players (add a task, check it off, lay a road, build a home beside it so
-- residents move in, tap it and pick its colors, open a shop beside the road so they have jobs). Each step is worked out from what the player has actually done; finishing pays a one-time
-- 100-coin reward through claim_reward('tutorial'). Players can hide the guide; existing players start with it hidden.
alter table public.profiles add column tutorial_hidden boolean not null default false;
update public.profiles p set tutorial_hidden = true
where exists (select 1 from public.tasks t where t.user_id = p.id)
   or exists (select 1 from public.placed_buildings b where b.user_id = p.id);
grant update (tutorial_hidden) on public.profiles to authenticated;

alter table public.user_rewards drop constraint user_rewards_reward_check;
alter table public.user_rewards add constraint user_rewards_reward_check check (reward in ('home_screen', 'notifications', 'tutorial'));

create function private.tutorial_state(p_user uuid)
returns table (has_task boolean, has_checkoff boolean, has_road boolean, has_home boolean, has_resident boolean, has_color boolean, has_shop boolean)
language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.tasks t where t.user_id = p_user),
    exists (select 1 from public.task_completions c where c.user_id = p_user and c.task_id is not null),
    exists (select 1 from public.placed_buildings b join public.building_types bt on bt.id = b.type_id
            where b.user_id = p_user and bt.category = 'road'),
    exists (select 1 from public.placed_buildings b join public.building_types bt on bt.id = b.type_id
            where b.user_id = p_user and bt.population > 0),
    private.city_population(p_user) > 0,
    exists (select 1 from public.placed_buildings b where b.user_id = p_user and b.color_seed is not null),
    -- a shop (any commercial building) with a road along one of its sides
    exists (
      select 1 from public.placed_buildings b join public.building_types t on t.id = b.type_id
      where b.user_id = p_user and t.category = 'commercial'
        and exists (
          select 1 from public.placed_buildings r join public.building_types rt on rt.id = r.type_id
          where r.user_id = p_user and rt.category = 'road'
            and ((r.x between b.x and b.x + private.fw(t, b.rotated) - 1 and (r.y = b.y - 1 or r.y = b.y + private.fd(t, b.rotated)))
              or (r.y between b.y and b.y + private.fd(t, b.rotated) - 1 and (r.x = b.x - 1 or r.x = b.x + private.fw(t, b.rotated))))
        )
    );
$$;
revoke execute on function private.tutorial_state(uuid) from public, anon, authenticated;

create function public.my_tutorial()
returns table (has_task boolean, has_checkoff boolean, has_road boolean, has_home boolean, has_resident boolean, has_color boolean, has_shop boolean, hidden boolean, claimed boolean)
language sql stable security definer set search_path = '' as $$
  select s.has_task, s.has_checkoff, s.has_road, s.has_home, s.has_resident, s.has_color, s.has_shop,
    (select p.tutorial_hidden from public.profiles p where p.id = auth.uid()),
    exists (select 1 from public.user_rewards r where r.user_id = auth.uid() and r.reward = 'tutorial')
  from private.tutorial_state(auth.uid()) s;
$$;
revoke execute on function public.my_tutorial() from public, anon;
grant execute on function public.my_tutorial() to authenticated;

-- claim_reward: 'tutorial' pays 100 once every step is done (checked here, not trusted from the app).
create or replace function public.claim_reward(p_reward text)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_coins integer := case when p_reward = 'tutorial' then 100 else 200 end;
  v_rows integer;
  v_state record;
begin
  perform private.lock_profile(v_user);
  if p_reward not in ('home_screen', 'notifications', 'tutorial') then
    raise exception 'unknown_reward' using errcode = '22023';
  end if;
  if p_reward = 'notifications' and not exists (select 1 from public.push_subscriptions where user_id = v_user) then
    raise exception 'no_subscription' using errcode = '22023';
  end if;
  if p_reward = 'tutorial' then
    select * into v_state from private.tutorial_state(v_user);
    if not (v_state.has_task and v_state.has_checkoff and v_state.has_road and v_state.has_resident and v_state.has_color and v_state.has_shop) then
      raise exception 'tutorial_not_done' using errcode = '22023';
    end if;
  end if;
  insert into public.user_rewards (user_id, reward, coins) values (v_user, p_reward, v_coins)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return query select 0, private.balance(v_user);
    return;
  end if;
  insert into public.coin_ledger (user_id, amount, kind, reason)
  values (v_user, v_coins, 'bonus', case p_reward
    when 'home_screen' then 'Reward: added LifeCity to the home screen'
    when 'tutorial' then 'Reward: finished Getting started'
    else 'Reward: turned on notifications' end);
  return query select v_coins, private.balance(v_user);
end $$;
