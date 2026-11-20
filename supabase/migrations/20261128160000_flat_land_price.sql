-- Every land expansion costs 300 coins, whatever the size.
create or replace function public.land_price(p_purchases integer)
returns bigint language sql immutable set search_path = '' as $$
  select 300::bigint;
$$;
