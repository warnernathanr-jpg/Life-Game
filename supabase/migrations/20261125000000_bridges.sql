-- Bridges: drawing a road across water turns those water tiles into bridge tiles (10 coins each).
-- A bridge counts as road. Demolishing one turns it back into water (no refund; the water stays as it was).

insert into public.building_types
  (id, name, category, icon, description, cost, size, population, jobs, happiness, unlock_area, unlock_points, sort_order)
values
  ('bridge', 'Bridge', 'road', '🌉', 'Draw a road across water to build a bridge.', 10, 1, 0, 0, 0, null, null, 1);

create or replace function public.buy_tiles(p_type_id text, p_tiles jsonb)
returns table (built integer, cost bigint, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_type public.building_types;
  v_bridge public.building_types;
  v_count integer;
  v_bridges integer := 0;
  v_cost bigint;
begin
  v_profile := private.lock_profile(v_user);
  select * into v_type from public.building_types where id = p_type_id;
  if not found or v_type.id = 'bridge' or v_type.size <> 1 or v_type.category not in ('road', 'landscape') then
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

  -- Skip tiles that already are this (a bridge already is road, and already is water).
  delete from pg_temp.tile_stroke s
  using public.placed_buildings b
  where b.user_id = v_user and b.x = s.x and b.y = s.y
    and (b.type_id = v_type.id
         or (b.type_id = 'bridge' and v_type.id in ('road', 'water')));

  -- Roads over water become bridges.
  create temporary table if not exists pg_temp.bridge_stroke (id uuid) on commit drop;
  truncate pg_temp.bridge_stroke;
  if v_type.id = 'road' then
    insert into pg_temp.bridge_stroke (id)
    select b.id from public.placed_buildings b join pg_temp.tile_stroke s on b.x = s.x and b.y = s.y
    where b.user_id = v_user and b.type_id = 'water';
    get diagnostics v_bridges = row_count;
    delete from pg_temp.tile_stroke s
    using public.placed_buildings b
    where b.user_id = v_user and b.type_id = 'water' and b.x = s.x and b.y = s.y;
    select * into v_bridge from public.building_types where id = 'bridge';
  end if;

  select count(*) into v_count from pg_temp.tile_stroke;
  if v_count + v_bridges = 0 then
    return query select 0, 0::bigint, private.balance(v_user);
    return;
  end if;
  if exists (select 1 from pg_temp.tile_stroke s
             where not private.lot_free(v_user, v_profile.city_size, s.x, s.y, 1, null)) then
    raise exception 'lot_taken' using errcode = '23P01';
  end if;

  v_cost := v_count * v_type.cost + v_bridges * coalesce(v_bridge.cost, 0);
  if private.balance(v_user) < v_cost then
    raise exception 'not_enough_coins' using errcode = '22023';
  end if;

  insert into public.placed_buildings (user_id, type_id, x, y, price_paid)
  select v_user, v_type.id, s.x, s.y, v_type.cost from pg_temp.tile_stroke s;
  -- The bridge keeps the water's price, so demolishing it gives the water back as it was.
  update public.placed_buildings set type_id = 'bridge', facing = null
  where id in (select id from pg_temp.bridge_stroke);

  if v_cost > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, -v_cost, 'building', case v_type.id
      when 'road' then concat_ws(' and ',
        case when v_count > 0 then format('Built %s road tile%s', v_count, case when v_count = 1 then '' else 's' end) end,
        case when v_bridges > 0 then format('%s %s bridge tile%s', case when v_count > 0 then 'built' else 'Built' end,
                                            v_bridges, case when v_bridges = 1 then '' else 's' end) end)
      when 'tree' then format('Planted %s tree%s', v_count, case when v_count = 1 then '' else 's' end)
      when 'water' then format('Dug %s water tile%s', v_count, case when v_count = 1 then '' else 's' end)
      else format('Built %s × %s', v_count, v_type.name)
    end);
  end if;

  return query select v_count + v_bridges, v_cost, private.balance(v_user);
end $$;

-- Demolishing: a bridge turns back into water (no refund); everything else as before.
create or replace function public.sell_buildings(p_ids uuid[])
returns table (sold integer, refund bigint, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_bridges uuid[];
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

  with b as (
    update public.placed_buildings set type_id = 'water'
    where user_id = v_user and id = any (p_ids) and type_id = 'bridge'
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_bridges from b;

  with gone as (
    delete from public.placed_buildings
    where user_id = v_user and id = any (p_ids) and not (id = any (v_bridges))
    returning price_paid
  )
  select count(*), coalesce(sum(public.sell_refund(price_paid)), 0) into v_sold, v_refund from gone;
  v_sold := v_sold + cardinality(v_bridges);

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

create or replace function public.sell_building(p_building_id uuid)
returns table (refund bigint, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_building public.placed_buildings;
  v_name text;
  v_refund bigint;
begin
  perform private.lock_profile(v_user);

  select * into v_building from public.placed_buildings where id = p_building_id and user_id = v_user;
  if not found then
    raise exception 'building_not_found' using errcode = 'P0002';
  end if;
  if v_building.type_id = 'bridge' then
    update public.placed_buildings set type_id = 'water' where id = v_building.id;
    return query select 0::bigint, private.balance(v_user);
    return;
  end if;
  select name into v_name from public.building_types where id = v_building.type_id;

  v_refund := public.sell_refund(v_building.price_paid);
  delete from public.placed_buildings where id = v_building.id;
  if v_refund > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, building_id)
    values (v_user, v_refund, 'building_sold', 'Sold: ' || v_name, v_building.id);
  end if;

  return query select v_refund, private.balance(v_user);
end $$;

-- Bridges stay where the water is.
create or replace function public.move_building(p_building_id uuid, p_x integer, p_y integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_size integer;
  v_type text;
begin
  v_profile := private.lock_profile(v_user);

  select t.size, t.id into v_size, v_type
  from public.placed_buildings b join public.building_types t on t.id = b.type_id
  where b.id = p_building_id and b.user_id = v_user;
  if not found then
    raise exception 'building_not_found' using errcode = 'P0002';
  end if;
  if v_type = 'bridge' then
    raise exception 'cant_move' using errcode = '22023';
  end if;
  if not private.lot_free(v_user, v_profile.city_size, p_x, p_y, v_size, p_building_id) then
    raise exception 'lot_taken' using errcode = '23P01';
  end if;

  update public.placed_buildings set x = p_x, y = p_y where id = p_building_id;
end $$;

update public.building_types
set description = 'Connects buildings. Buildings only work when they touch a road. Draw across water for a bridge (10 coins a tile).'
where id = 'road';
