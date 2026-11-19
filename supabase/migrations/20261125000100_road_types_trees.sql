-- Road types (Dirt Road 1, 2-Lane Road 5, 4-Lane Road 10; existing roads are 2-lane) and building over trees:
-- trees no longer block anything; whatever is placed or moved onto them clears them.

-- ---------------------------------------------------------------------------
-- Road types
-- ---------------------------------------------------------------------------
update public.building_types
set name = '2-Lane Road', cost = 5,
    description = 'A paved street with a lane each way. Buildings only work when they touch a road. Across water it becomes a bridge.'
where id = 'road';

insert into public.building_types
  (id, name, category, icon, description, cost, size, population, jobs, happiness, unlock_area, unlock_points, sort_order)
values
  ('dirt_road', 'Dirt Road', 'road', '🟫', 'A cheap gravel track. Connects buildings like any road. Across water it becomes a bridge.', 1, 1, 0, 0, 0, null, null, 0),
  ('avenue', '4-Lane Road', 'road', '🛣️', 'A wide avenue with two lanes each way. Draw it over other roads to upgrade them.', 10, 1, 0, 0, 0, null, null, 1);
update public.building_types set icon = '🚗' where id = 'road';

-- ---------------------------------------------------------------------------
-- Trees never block a lot; placing or moving anything onto them clears them.
-- ---------------------------------------------------------------------------
create or replace function private.lot_free(p_user uuid, p_city integer, p_x integer, p_y integer, p_size integer, p_except uuid)
returns boolean language sql stable set search_path = '' as $$
  select p_x >= 0 and p_y >= 0 and p_x + p_size <= p_city and p_y + p_size <= p_city
    and not exists (
      select 1
      from public.placed_buildings b
      join public.building_types t on t.id = b.type_id
      where b.user_id = p_user
        and b.type_id <> 'tree'
        and (p_except is null or b.id <> p_except)
        and b.x < p_x + p_size and p_x < b.x + t.size
        and b.y < p_y + p_size and p_y < b.y + t.size
    );
$$;

create or replace function private.clear_trees_under()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_size integer;
begin
  if new.type_id = 'tree' then
    return new;
  end if;
  select size into v_size from public.building_types where id = new.type_id;
  delete from public.placed_buildings b
  where b.user_id = new.user_id and b.type_id = 'tree' and b.id <> new.id
    and b.x >= new.x and b.x < new.x + v_size
    and b.y >= new.y and b.y < new.y + v_size;
  return new;
end $$;

create trigger placed_buildings_clear_trees
after insert or update of x, y, type_id on public.placed_buildings
for each row execute function private.clear_trees_under();

-- ---------------------------------------------------------------------------
-- buy_tiles: any road type over water builds a bridge; a road type drawn over another road type replaces it.
-- ---------------------------------------------------------------------------
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
