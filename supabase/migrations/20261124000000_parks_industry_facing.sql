-- Bigger footprints (up to 4x4), industrial buildings become 2x2, four park sizes, and saved facing.

-- ---------------------------------------------------------------------------
-- Sizes up to 4x4
-- ---------------------------------------------------------------------------
alter table public.building_types drop constraint building_types_size_check;
alter table public.building_types add constraint building_types_size_check check (size between 1 and 4);

-- ---------------------------------------------------------------------------
-- Workshop and warehouse become 2x2. Each placed one keeps its spot if the 2x2 fits there, or shifts by one tile
-- (still covering its old tile); otherwise it is removed and its full price refunded.
-- ---------------------------------------------------------------------------
update public.building_types set size = 2,
  description = case id
    when 'workshop' then 'Makes and fixes things. A little noisy. Takes a 2×2 lot.'
    when 'warehouse' then 'Storage and shipping jobs. Takes a 2×2 lot.'
  end
where id in ('workshop', 'warehouse');

do $$
declare
  b record;
  v_city integer;
  v_spot record;
  v_placed boolean;
begin
  for b in
    select pb.*, t.name from public.placed_buildings pb join public.building_types t on t.id = pb.type_id
    where pb.type_id in ('workshop', 'warehouse') order by pb.created_at
  loop
    select city_size into v_city from public.profiles where id = b.user_id;
    v_placed := false;
    for v_spot in select * from (values (0, 0), (-1, 0), (0, -1), (-1, -1)) as s(dx, dy) loop
      if private.lot_free(b.user_id, v_city, b.x + v_spot.dx, b.y + v_spot.dy, 2, b.id) then
        update public.placed_buildings set x = b.x + v_spot.dx, y = b.y + v_spot.dy where id = b.id;
        v_placed := true;
        exit;
      end if;
    end loop;
    if not v_placed then
      delete from public.placed_buildings where id = b.id;
      if b.price_paid > 0 then
        insert into public.coin_ledger (user_id, amount, kind, reason, building_id)
        values (b.user_id, b.price_paid, 'building_sold', 'Refund: ' || b.name || ' (now needs a 2×2 lot)', b.id);
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Parks: small 1x1, basketball court 2x2, garden 3x3, central park 4x4
-- ---------------------------------------------------------------------------
update public.building_types
set name = 'Small Park', description = 'Trees and a bench on a 1×1 lot. Makes people happier.'
where id = 'park';

insert into public.building_types
  (id, name, category, icon, description, cost, size, population, jobs, happiness, unlock_area, unlock_points, sort_order)
values
  ('court',        'Basketball Court', 'service', '🏀', 'A fenced court with hoops. Takes a 2×2 lot.',                     140, 2, 0, 1,  9, 'health', 150, 46),
  ('garden',       'Garden Park',      'service', '🌷', 'Flower beds, paths and a pond. Takes a 3×3 lot.',                 300, 3, 0, 2, 15, 'health', 300, 47),
  ('central_park', 'Central Park',     'service', '🏞️', 'A lake, woods, a gazebo and a playground. Takes a 4×4 lot.',      550, 4, 0, 4, 24, 'health', 500, 48);

-- ---------------------------------------------------------------------------
-- Facing: which side a building's front faces (null = automatic: toward its road)
-- ---------------------------------------------------------------------------
alter table public.placed_buildings
  add column facing text check (facing in ('south', 'east', 'west', 'north'));

-- Turn a building to face another side. Cosmetic: the app offers only sides that touch a road.
create function public.set_building_facing(p_building_id uuid, p_facing text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_facing is not null and p_facing not in ('south', 'east', 'west', 'north') then
    raise exception 'bad_facing' using errcode = '22023';
  end if;
  update public.placed_buildings set facing = p_facing
  where id = p_building_id and user_id = auth.uid() and type_id <> 'road';
  if not found then
    raise exception 'building_not_found' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.set_building_facing(uuid, text) from public, anon;
grant execute on function public.set_building_facing(uuid, text) to authenticated;
