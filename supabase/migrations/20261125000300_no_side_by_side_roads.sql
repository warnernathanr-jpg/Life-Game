-- Roads can't run side by side (no 2x2 block of road tiles): drawing one next to another along its length is refused.
-- Crossings, corners and T-junctions are fine. Roads already built that way stay.

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
  v_swaps integer := 0;
  v_cost bigint;
  v_is_road boolean;
  v_noun text;
begin
  v_profile := private.lock_profile(v_user);
  select * into v_type from public.building_types where id = p_type_id;
  if not found or v_type.id = 'bridge' or v_type.size <> 1 or v_type.category not in ('road', 'landscape') then
    raise exception 'unknown_building' using errcode = 'P0002';
  end if;
  if not private.is_unlocked(v_user, v_type) then
    raise exception 'locked' using errcode = '42501';
  end if;
  v_is_road := v_type.category = 'road';

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

  -- Skip tiles that already are this (a bridge already is road of every kind, and already is water).
  delete from pg_temp.tile_stroke s
  using public.placed_buildings b
  where b.user_id = v_user and b.x = s.x and b.y = s.y
    and (b.type_id = v_type.id or (b.type_id = 'bridge' and (v_is_road or v_type.id = 'water')));

  create temporary table if not exists pg_temp.bridge_stroke (id uuid) on commit drop;
  create temporary table if not exists pg_temp.swap_stroke (id uuid) on commit drop;
  truncate pg_temp.bridge_stroke;
  truncate pg_temp.swap_stroke;
  if v_is_road then
    -- Over water: bridges.
    insert into pg_temp.bridge_stroke (id)
    select b.id from public.placed_buildings b join pg_temp.tile_stroke s on b.x = s.x and b.y = s.y
    where b.user_id = v_user and b.type_id = 'water';
    get diagnostics v_bridges = row_count;
    -- Over another kind of road: replace it.
    insert into pg_temp.swap_stroke (id)
    select b.id from public.placed_buildings b
    join public.building_types t on t.id = b.type_id
    join pg_temp.tile_stroke s on b.x = s.x and b.y = s.y
    where b.user_id = v_user and t.category = 'road' and b.type_id not in ('bridge', v_type.id);
    get diagnostics v_swaps = row_count;
    delete from pg_temp.tile_stroke s
    using public.placed_buildings b
    where b.user_id = v_user and b.x = s.x and b.y = s.y
      and b.id in (select id from pg_temp.bridge_stroke union all select id from pg_temp.swap_stroke);
    select * into v_bridge from public.building_types where id = 'bridge';
  end if;

  select count(*) into v_count from pg_temp.tile_stroke;
  if v_count + v_bridges + v_swaps = 0 then
    return query select 0, 0::bigint, private.balance(v_user);
    return;
  end if;
  if exists (select 1 from pg_temp.tile_stroke s
             where not private.lot_free(v_user, v_profile.city_size, s.x, s.y, 1, null)) then
    raise exception 'lot_taken' using errcode = '23P01';
  end if;

  -- Roads may not run side by side: no 2x2 block of road tiles may include a tile from this stroke.
  if v_is_road and exists (
    with fresh as (
      select x, y from pg_temp.tile_stroke
      union select b.x, b.y from public.placed_buildings b where b.id in (select id from pg_temp.bridge_stroke)
    ),
    road as (
      select b.x, b.y from public.placed_buildings b join public.building_types t on t.id = b.type_id
      where b.user_id = v_user and t.category = 'road'
      union select x, y from fresh
    )
    select 1 from fresh f
    cross join (values (0, 0), (-1, 0), (0, -1), (-1, -1)) o(dx, dy)
    where (select count(*) from road r
           where r.x between f.x + o.dx and f.x + o.dx + 1 and r.y between f.y + o.dy and f.y + o.dy + 1) = 4
  ) then
    raise exception 'roads_side_by_side' using errcode = '23P01';
  end if;

  v_cost := (v_count + v_swaps) * v_type.cost + v_bridges * coalesce(v_bridge.cost, 0);
  if private.balance(v_user) < v_cost then
    raise exception 'not_enough_coins' using errcode = '22023';
  end if;

  insert into public.placed_buildings (user_id, type_id, x, y, price_paid)
  select v_user, v_type.id, s.x, s.y, v_type.cost from pg_temp.tile_stroke s;
  update public.placed_buildings set type_id = v_type.id, price_paid = v_type.cost, facing = null
  where id in (select id from pg_temp.swap_stroke);
  -- The bridge keeps the water's price, so demolishing it gives the water back as it was.
  update public.placed_buildings set type_id = 'bridge', facing = null
  where id in (select id from pg_temp.bridge_stroke);

  v_noun := case v_type.id when 'road' then 'road tile' when 'dirt_road' then 'dirt road tile' when 'avenue' then '4-lane road tile'
                           when 'tree' then 'tree' when 'water' then 'water tile' else lower(v_type.name) end;
  if v_cost > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, -v_cost, 'building', case
      when v_is_road then concat_ws(' and ',
        case when v_count + v_swaps > 0 then format('Built %s %s%s', v_count + v_swaps, v_noun, case when v_count + v_swaps = 1 then '' else 's' end) end,
        case when v_bridges > 0 then format('%s %s bridge tile%s', case when v_count + v_swaps > 0 then 'built' else 'Built' end,
                                            v_bridges, case when v_bridges = 1 then '' else 's' end) end)
      when v_type.id = 'tree' then format('Planted %s tree%s', v_count, case when v_count = 1 then '' else 's' end)
      when v_type.id = 'water' then format('Dug %s water tile%s', v_count, case when v_count = 1 then '' else 's' end)
      else format('Built %s × %s', v_count, v_type.name)
    end);
  end if;

  return query select v_count + v_bridges + v_swaps, v_cost, private.balance(v_user);
end $$;

-- The Airport is 4x4 (none were placed at 3x3).
update public.building_types set w = 4, d = 4, size = 4, description = 'A runway and a terminal (4×4). Flights out, visitors in.' where id = 'airport';
