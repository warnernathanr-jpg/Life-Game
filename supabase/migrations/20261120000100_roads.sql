-- Roads: cheap 1x1 tiles bought in strokes (drag across the map), and bulk demolition.
-- Buildings only count toward population/jobs when they touch a road (worked out in the app).

insert into public.building_types
  (id, name, category, icon, description, cost, size, population, jobs, happiness, unlock_area, unlock_count, sort_order)
values
  ('road', 'Road', 'road', '🛣️', 'Connects buildings. Buildings only work when they touch a road.', 5, 1, 0, 0, 0, null, null, 1);

-- Most tiles one road stroke or demolition may cover.
create function public.max_stroke_tiles()
returns integer language sql immutable set search_path = '' as $$ select 200 $$;

-- Buy road tiles at the given [x, y] positions in one go. Tiles that are already road are skipped
-- (not charged); any tile outside the city or under another building refuses the whole stroke.
create function public.buy_roads(p_tiles jsonb)
returns table (built integer, cost bigint, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_road public.building_types;
  v_count integer;
  v_cost bigint;
begin
  v_profile := private.lock_profile(v_user);
  select * into v_road from public.building_types where id = 'road';

  if jsonb_typeof(p_tiles) is distinct from 'array' or jsonb_array_length(p_tiles) = 0 then
    raise exception 'no_tiles' using errcode = '22023';
  end if;
  if jsonb_array_length(p_tiles) > public.max_stroke_tiles() then
    raise exception 'too_many_tiles' using errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.road_stroke (x integer, y integer) on commit drop;
  truncate pg_temp.road_stroke;
  begin
    insert into pg_temp.road_stroke (x, y)
    select distinct (t ->> 0)::integer, (t ->> 1)::integer from jsonb_array_elements(p_tiles) t;
  exception when others then
    raise exception 'bad_tiles' using errcode = '22023';
  end;
  if exists (select 1 from pg_temp.road_stroke where x is null or y is null) then
    raise exception 'bad_tiles' using errcode = '22023';
  end if;

  -- Skip tiles that already have a road.
  delete from pg_temp.road_stroke s
  using public.placed_buildings b
  where b.user_id = v_user and b.type_id = 'road' and b.x = s.x and b.y = s.y;

  select count(*) into v_count from pg_temp.road_stroke;
  if v_count = 0 then
    return query select 0, 0::bigint, private.balance(v_user);
    return;
  end if;
  if exists (select 1 from pg_temp.road_stroke s
             where not private.lot_free(v_user, v_profile.city_size, s.x, s.y, 1, null)) then
    raise exception 'lot_taken' using errcode = '23P01';
  end if;

  v_cost := v_count * v_road.cost;
  if private.balance(v_user) < v_cost then
    raise exception 'not_enough_coins' using errcode = '22023';
  end if;

  insert into public.placed_buildings (user_id, type_id, x, y, price_paid)
  select v_user, 'road', s.x, s.y, v_road.cost from pg_temp.road_stroke s;

  insert into public.coin_ledger (user_id, amount, kind, reason)
  values (v_user, -v_cost, 'building',
          format('Built %s road tile%s', v_count, case when v_count = 1 then '' else 's' end));

  return query select v_count, v_cost, private.balance(v_user);
end $$;

-- Demolish several buildings/roads at once for half of what was paid (one ledger row).
create function public.sell_buildings(p_ids uuid[])
returns table (sold integer, refund bigint, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_sold integer;
  v_refund bigint;
begin
  perform private.lock_profile(v_user);
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'no_tiles' using errcode = '22023';
  end if;
  if cardinality(p_ids) > public.max_stroke_tiles() then
    raise exception 'too_many_tiles' using errcode = '22023';
  end if;

  with gone as (
    delete from public.placed_buildings
    where user_id = v_user and id = any (p_ids)
    returning price_paid
  )
  select count(*), coalesce(sum(public.sell_refund(price_paid)), 0) into v_sold, v_refund from gone;

  if v_sold = 0 then
    raise exception 'building_not_found' using errcode = 'P0002';
  end if;
  if v_refund > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, v_refund, 'building_sold',
            format('Demolished %s item%s', v_sold, case when v_sold = 1 then '' else 's' end));
  end if;

  return query select v_sold, v_refund, private.balance(v_user);
end $$;

revoke execute on function public.buy_roads(jsonb), public.sell_buildings(uuid[]), public.max_stroke_tiles() from public, anon;
grant execute on function public.buy_roads(jsonb), public.sell_buildings(uuid[]), public.max_stroke_tiles() to authenticated;
