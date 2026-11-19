-- Landscape tiles: trees and water, painted like roads. They don't need a road; each adds a little
-- happiness (the app caps the total "Nature" bonus).

insert into public.building_types
  (id, name, category, icon, description, cost, size, population, jobs, happiness, unlock_area, unlock_points, sort_order)
values
  ('tree',  'Trees', 'landscape', '🌲', 'Plant trees anywhere. A little greener, a little happier.', 3, 1, 0, 0, 1, null, null, 2),
  ('water', 'Water', 'landscape', '💧', 'Dig ponds and lakes. Neighboring water tiles join up.',     6, 1, 0, 0, 1, null, null, 3);

-- Buy 1x1 road or landscape tiles at the given [x, y] positions in one go. Tiles that already hold this type are
-- skipped (not charged); any tile outside the city or under something else refuses the whole stroke.
create function public.buy_tiles(p_type_id text, p_tiles jsonb)
returns table (built integer, cost bigint, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_type public.building_types;
  v_count integer;
  v_cost bigint;
begin
  v_profile := private.lock_profile(v_user);
  select * into v_type from public.building_types where id = p_type_id;
  if not found or v_type.size <> 1 or v_type.category not in ('road', 'landscape') then
    raise exception 'unknown_building' using errcode = 'P0002';
  end if;
  if not private.is_unlocked(v_user, v_type) then
    raise exception 'locked' using errcode = '42501';
  end if;

  if jsonb_typeof(p_tiles) is distinct from 'array' or jsonb_array_length(p_tiles) = 0 then
    raise exception 'no_tiles' using errcode = '22023';
  end if;
  if jsonb_array_length(p_tiles) > public.max_stroke_tiles() then
    raise exception 'too_many_tiles' using errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.tile_stroke (x integer, y integer) on commit drop;
  truncate pg_temp.tile_stroke;
  begin
    insert into pg_temp.tile_stroke (x, y)
    select distinct (t ->> 0)::integer, (t ->> 1)::integer from jsonb_array_elements(p_tiles) t;
  exception when others then
    raise exception 'bad_tiles' using errcode = '22023';
  end;
  if exists (select 1 from pg_temp.tile_stroke where x is null or y is null) then
    raise exception 'bad_tiles' using errcode = '22023';
  end if;

  delete from pg_temp.tile_stroke s
  using public.placed_buildings b
  where b.user_id = v_user and b.type_id = v_type.id and b.x = s.x and b.y = s.y;

  select count(*) into v_count from pg_temp.tile_stroke;
  if v_count = 0 then
    return query select 0, 0::bigint, private.balance(v_user);
    return;
  end if;
  if exists (select 1 from pg_temp.tile_stroke s
             where not private.lot_free(v_user, v_profile.city_size, s.x, s.y, 1, null)) then
    raise exception 'lot_taken' using errcode = '23P01';
  end if;

  v_cost := v_count * v_type.cost;
  if private.balance(v_user) < v_cost then
    raise exception 'not_enough_coins' using errcode = '22023';
  end if;

  insert into public.placed_buildings (user_id, type_id, x, y, price_paid)
  select v_user, v_type.id, s.x, s.y, v_type.cost from pg_temp.tile_stroke s;

  insert into public.coin_ledger (user_id, amount, kind, reason)
  values (v_user, -v_cost, 'building', case v_type.id
    when 'road' then format('Built %s road tile%s', v_count, case when v_count = 1 then '' else 's' end)
    when 'tree' then format('Planted %s tree%s', v_count, case when v_count = 1 then '' else 's' end)
    when 'water' then format('Dug %s water tile%s', v_count, case when v_count = 1 then '' else 's' end)
    else format('Built %s × %s', v_count, v_type.name)
  end);

  return query select v_count, v_cost, private.balance(v_user);
end $$;

-- Roads now go through the same function.
create or replace function public.buy_roads(p_tiles jsonb)
returns table (built integer, cost bigint, balance bigint)
language sql security definer set search_path = '' as $$
  select * from public.buy_tiles('road', p_tiles);
$$;

revoke execute on function public.buy_tiles(text, jsonb) from public, anon;
grant execute on function public.buy_tiles(text, jsonb) to authenticated;
