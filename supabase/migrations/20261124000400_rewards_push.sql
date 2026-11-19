-- One-time rewards (200 coins for adding the app to the home screen, 200 for turning on notifications)
-- and saved push subscriptions (one row per device).

create table public.user_rewards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  reward text not null check (reward in ('home_screen', 'notifications')),
  coins integer not null check (coins >= 0),
  claimed_at timestamptz not null default now(),
  primary key (user_id, reward)
);
alter table public.user_rewards enable row level security;
create policy "user_rewards: read own" on public.user_rewards for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.user_rewards from anon, authenticated;
grant select on public.user_rewards to authenticated;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions: read own" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon, authenticated;
grant select (id, user_agent, created_at) on public.push_subscriptions to authenticated;

-- Save (or move to this user) a device's push subscription.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_user, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;

-- Claim a one-time reward. Returns the coins paid now (0 if already claimed).
-- 'notifications' needs a saved push subscription.
create function public.claim_reward(p_reward text)
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
    when 'home_screen' then 'Reward: added Life City to the home screen'
    else 'Reward: turned on notifications' end);
  return query select v_coins, private.balance(v_user);
end $$;

revoke execute on function public.save_push_subscription(text, text, text, text), public.claim_reward(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text), public.claim_reward(text) to authenticated;
