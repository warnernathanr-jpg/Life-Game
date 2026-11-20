-- A 50×50 world. Your land sits in the middle of it, and each land purchase adds a ring of one tile on every side
-- (2 more tiles across), so everything already built moves one tile right and down to stay centred.
create or replace function public.max_city_size()
returns integer language sql immutable set search_path = '' as $$ select 50 $$;

create or replace function public.buy_land()
returns table (city_size integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_price bigint;
  v_new integer;
begin
  v_profile := private.lock_profile(v_user);

  if v_profile.city_size >= public.max_city_size() then
    raise exception 'max_size' using errcode = '22023';
  end if;
  v_price := public.land_price(v_profile.land_purchases);
  if private.balance(v_user) < v_price then
    raise exception 'not_enough_coins' using errcode = '22023';
  end if;
  v_new := least(public.max_city_size(), v_profile.city_size + 2);

  update public.profiles
  set city_size = v_new, land_purchases = land_purchases + 1
  where id = v_user;

  -- New land on every side: shift the city one tile. (Placed buildings have no unique position index; road controls
  -- do, so they move in two steps to avoid clashing with a neighbour that hasn't moved yet.)
  update public.placed_buildings set x = x + 1, y = y + 1 where user_id = v_user;
  update public.road_controls set x = x + 100000, y = y + 100000 where user_id = v_user;
  update public.road_controls set x = x - 99999, y = y - 99999 where user_id = v_user;

  insert into public.coin_ledger (user_id, amount, kind, reason)
  values (v_user, -v_price, 'land', format('Bought land (%s×%s)', v_new, v_new));

  return query select v_new, private.balance(v_user);
end $$;
