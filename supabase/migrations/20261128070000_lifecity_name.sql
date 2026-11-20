-- The app is called LifeCity (one word): the home-screen reward's coin-history line uses the new name.
create or replace function public.claim_reward(p_reward text)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_coins integer := 200;
  v_rows integer;
begin
  perform private.lock_profile(v_user);
  if p_reward not in ('home_screen', 'notifications') then
    raise exception 'unknown_reward' using errcode = '22023';
  end if;
  if p_reward = 'notifications' and not exists (select 1 from public.push_subscriptions where user_id = v_user) then
    raise exception 'no_subscription' using errcode = '22023';
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
    else 'Reward: turned on notifications' end);
  return query select v_coins, private.balance(v_user);
end $$;
