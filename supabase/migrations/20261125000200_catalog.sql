-- The full building catalog: rectangular footprints (w × d, e.g. 2×1, 3×1, 4×3) that can be turned when placed, and
-- about 45 buildings across residential, commercial, industrial, services, knowledge, recreation, transportation and
-- landmarks. Existing buildings keep their ids (renamed where they match the new list); nothing placed is removed.

-- ---------------------------------------------------------------------------
-- Footprints: width (along x) and depth (along y). A placed building can be turned (w and d swapped).
-- ---------------------------------------------------------------------------
alter table public.building_types add column w integer, add column d integer;
update public.building_types set w = size, d = size;
alter table public.building_types
  alter column w set not null, alter column d set not null,
  add constraint building_types_w_check check (w between 1 and 4),
  add constraint building_types_d_check check (d between 1 and 4);
alter table public.building_types drop constraint building_types_size_check;
alter table public.building_types add constraint building_types_size_check check (size = greatest(w, d));

alter table public.placed_buildings add column rotated boolean not null default false;

-- Footprint of a placed building (turned buildings swap width and depth).
create function private.fw(p_type public.building_types, p_rotated boolean) returns integer
language sql immutable set search_path = '' as $$ select case when p_rotated then p_type.d else p_type.w end $$;
create function private.fd(p_type public.building_types, p_rotated boolean) returns integer
language sql immutable set search_path = '' as $$ select case when p_rotated then p_type.w else p_type.d end $$;

-- Is a w × d lot inside the city and clear of everything but trees?
create function private.lot_free_rect(p_user uuid, p_city integer, p_x integer, p_y integer, p_w integer, p_d integer, p_except uuid)
returns boolean language sql stable set search_path = '' as $$
  select p_x >= 0 and p_y >= 0 and p_x + p_w <= p_city and p_y + p_d <= p_city
    and not exists (
      select 1
      from public.placed_buildings b
      join public.building_types t on t.id = b.type_id
      where b.user_id = p_user
        and b.type_id <> 'tree'
        and (p_except is null or b.id <> p_except)
        and b.x < p_x + p_w and p_x < b.x + (case when b.rotated then t.d else t.w end)
        and b.y < p_y + p_d and p_y < b.y + (case when b.rotated then t.w else t.d end)
    );
$$;

create or replace function private.lot_free(p_user uuid, p_city integer, p_x integer, p_y integer, p_size integer, p_except uuid)
returns boolean language sql stable set search_path = '' as $$
  select private.lot_free_rect(p_user, p_city, p_x, p_y, p_size, p_size, p_except);
$$;

create or replace function private.clear_trees_under()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_type public.building_types;
begin
  if new.type_id = 'tree' then
    return new;
  end if;
  select * into v_type from public.building_types where id = new.type_id;
  delete from public.placed_buildings b
  where b.user_id = new.user_id and b.type_id = 'tree' and b.id <> new.id
    and b.x >= new.x and b.x < new.x + private.fw(v_type, new.rotated)
    and b.y >= new.y and b.y < new.y + private.fd(v_type, new.rotated);
  return new;
end $$;
drop trigger placed_buildings_clear_trees on public.placed_buildings;
create trigger placed_buildings_clear_trees
after insert or update of x, y, type_id, rotated on public.placed_buildings
for each row execute function private.clear_trees_under();

-- Buy and place a building, optionally turned.
drop function public.buy_building(text, integer, integer);
create function public.buy_building(p_type_id text, p_x integer, p_y integer, p_rotated boolean default false)
returns table (building_id uuid, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_type public.building_types;
  v_rot boolean;
  v_id uuid;
begin
  v_profile := private.lock_profile(v_user);

  select * into v_type from public.building_types where id = p_type_id;
  if not found or v_type.category in ('road', 'landscape') then
    raise exception 'unknown_building' using errcode = 'P0002';
  end if;
  if not private.is_unlocked(v_user, v_type) then
    raise exception 'locked' using errcode = '42501';
  end if;
  v_rot := coalesce(p_rotated, false) and v_type.w <> v_type.d;
  if not private.lot_free_rect(v_user, v_profile.city_size, p_x, p_y, private.fw(v_type, v_rot), private.fd(v_type, v_rot), null) then
    raise exception 'lot_taken' using errcode = '23P01';
  end if;
  if private.balance(v_user) < v_type.cost then
    raise exception 'not_enough_coins' using errcode = '22023';
  end if;

  insert into public.placed_buildings (user_id, type_id, x, y, price_paid, rotated)
  values (v_user, v_type.id, p_x, p_y, v_type.cost, v_rot)
  returning id into v_id;

  insert into public.coin_ledger (user_id, amount, kind, reason, building_id)
  values (v_user, -v_type.cost, 'building', 'Bought: ' || v_type.name, v_id);

  return query select v_id, private.balance(v_user);
end $$;
revoke execute on function public.buy_building(text, integer, integer, boolean) from public, anon;
grant execute on function public.buy_building(text, integer, integer, boolean) to authenticated;

-- Move a building (free), optionally turning it (null keeps how it is turned).
drop function public.move_building(uuid, integer, integer);
create function public.move_building(p_building_id uuid, p_x integer, p_y integer, p_rotated boolean default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_b public.placed_buildings;
  v_type public.building_types;
  v_rot boolean;
begin
  v_profile := private.lock_profile(v_user);
  select * into v_b from public.placed_buildings where id = p_building_id and user_id = v_user;
  if not found then
    raise exception 'building_not_found' using errcode = 'P0002';
  end if;
  select * into v_type from public.building_types where id = v_b.type_id;
  if v_type.category in ('road', 'landscape') then
    raise exception 'cant_move' using errcode = '22023';
  end if;
  v_rot := coalesce(p_rotated, v_b.rotated) and v_type.w <> v_type.d;
  if not private.lot_free_rect(v_user, v_profile.city_size, p_x, p_y, private.fw(v_type, v_rot), private.fd(v_type, v_rot), v_b.id) then
    raise exception 'lot_taken' using errcode = '23P01';
  end if;
  update public.placed_buildings set x = p_x, y = p_y, rotated = v_rot, facing = case when v_rot <> v_b.rotated then null else facing end
  where id = v_b.id;
end $$;
revoke execute on function public.move_building(uuid, integer, integer, boolean) from public, anon;
grant execute on function public.move_building(uuid, integer, integer, boolean) to authenticated;

-- Upgrades stay on square steps (the residential ladder); they use the footprint width.
create or replace function public.upgrade_building(p_building_id uuid)
returns table (building_id uuid, cost bigint, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_building public.placed_buildings;
  v_from public.building_types;
  v_to public.building_types;
  v_cost bigint;
  v_x integer;
  v_y integer;
  v_found boolean := false;
  dx integer;
  dy integer;
begin
  v_profile := private.lock_profile(v_user);
  select * into v_building from public.placed_buildings where id = p_building_id and user_id = v_user;
  if not found then
    raise exception 'building_not_found' using errcode = 'P0002';
  end if;
  select * into v_from from public.building_types where id = v_building.type_id;
  if v_from.upgrades_to is null then
    raise exception 'no_upgrade' using errcode = '22023';
  end if;
  select * into v_to from public.building_types where id = v_from.upgrades_to;
  if not private.is_unlocked(v_user, v_to) then
    raise exception 'locked' using errcode = '42501';
  end if;

  <<search>>
  for dy in 0 .. greatest(0, v_to.d - v_from.d) loop
    for dx in 0 .. greatest(0, v_to.w - v_from.w) loop
      if private.lot_free_rect(v_user, v_profile.city_size, v_building.x - dx, v_building.y - dy, v_to.w, v_to.d, v_building.id) then
        v_x := v_building.x - dx;
        v_y := v_building.y - dy;
        v_found := true;
        exit search;
      end if;
    end loop;
  end loop;
  if not v_found then
    raise exception 'no_room' using errcode = '23P01';
  end if;

  v_cost := greatest(0, v_to.cost - v_building.price_paid);
  if private.balance(v_user) < v_cost then
    raise exception 'not_enough_coins' using errcode = '22023';
  end if;

  update public.placed_buildings
  set type_id = v_to.id, x = v_x, y = v_y, rotated = false, price_paid = greatest(v_building.price_paid, v_to.cost)
  where id = v_building.id;
  if v_cost > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason, building_id)
    values (v_user, -v_cost, 'building', format('Upgraded: %s → %s', v_from.name, v_to.name), v_building.id);
  end if;

  return query select v_building.id, v_cost, private.balance(v_user);
end $$;

-- ---------------------------------------------------------------------------
-- Existing buildings: renames and footprints that match the new list (none of the resized ones are placed yet).
-- ---------------------------------------------------------------------------
update public.building_types set name = 'Starter House', description = 'A simple first home for a small family.' where id = 'cottage';
update public.building_types set name = 'Townhouse', description = 'A narrow house sharing walls with its neighbors.' where id = 'house';
update public.building_types set name = 'Apartment Building', description = 'Flats for many families on a 2×2 lot.' where id = 'apartments';
update public.building_types set name = 'Coffee Shop', icon = '☕' where id = 'cafe';
update public.building_types set name = 'Convenience Store' where id = 'corner_shop';
update public.building_types set name = 'Manufacturing Plant', description = 'A big plant with lots of jobs, and some noise and smoke.' where id = 'factory';
update public.building_types set w = 2, d = 1, size = 2, description = 'Storage and loading bays on a 2×1 lot.' where id = 'warehouse';
update public.building_types set name = 'Medical Clinic', icon = '🩺' where id = 'clinic';
update public.building_types set name = 'Elementary School', w = 2, d = 1, size = 2, description = 'Classrooms and a playground for the neighborhood''s children.' where id = 'school';
update public.building_types set w = 2, d = 1, size = 2, description = 'Books, quiet rooms and story time on a 2×1 lot.' where id = 'library';
update public.building_types set name = 'Community Center', w = 2, d = 1, size = 2, description = 'Classes, events and a place to meet neighbors.' where id = 'community';
update public.building_types set name = 'Neighborhood Park', description = 'Trees and a bench on a 1×1 lot. Makes people happier.' where id = 'park';

-- ---------------------------------------------------------------------------
-- New buildings.
-- ---------------------------------------------------------------------------
insert into public.building_types
  (id, name, category, icon, description, cost, size, w, d, population, jobs, happiness, unlock_area, unlock_points, sort_order)
values
  -- Residential
  ('small_cottage', 'Small Cottage', 'residential', '🛖', 'A tiny cottage, the cheapest home there is.', 25, 1, 1, 1, 2, 0, 0, null, null, 9),
  ('suburban', 'Suburban House', 'residential', '🏡', 'A family home with a garage and a yard.', 70, 1, 1, 1, 6, 0, 1, 'personal', 40, 10),
  ('duplex', 'Duplex', 'residential', '🏘️', 'Two homes side by side on a 2×1 lot.', 110, 2, 2, 1, 12, 0, 1, 'personal', 100, 12),
  ('luxury', 'Luxury Home', 'residential', '💎', 'A big house with a pool and a garden on a 2×2 lot.', 400, 2, 2, 2, 8, 0, 6, 'personal', 400, 14),
  ('highrise', 'High-Rise Apartments', 'residential', '🏙️', 'A tall tower with homes for a hundred people.', 700, 2, 2, 2, 120, 0, -2, 'personal', 600, 15),
  -- Commercial
  ('grocery', 'Grocery Store', 'commercial', '🛒', 'Fresh food for the neighborhood on a 2×1 lot.', 200, 2, 2, 1, 0, 12, 4, 'health', 100, 23),
  ('restaurant', 'Restaurant', 'commercial', '🍽️', 'Dinner out with friends.', 150, 1, 1, 1, 0, 8, 4, 'personal', 120, 24),
  ('clothing', 'Clothing Store', 'commercial', '👕', 'Shirts, shoes and everything in between.', 140, 1, 1, 1, 0, 6, 2, 'personal', 150, 25),
  ('bank', 'Bank', 'commercial', '🏦', 'Savings, loans and a big safe.', 260, 1, 1, 1, 0, 10, 1, 'work', 200, 26),
  ('cinema', 'Movie Theater', 'commercial', '🎬', 'The latest films on a big screen (2×2).', 500, 2, 2, 2, 0, 15, 9, 'personal', 300, 27),
  ('hotel', 'Hotel', 'commercial', '🏨', 'Rooms for visitors on a 2×2 lot.', 600, 2, 2, 2, 0, 30, 3, 'work', 350, 28),
  ('mall', 'Shopping Mall', 'commercial', '🛍️', 'Dozens of shops under one roof (3×3).', 900, 3, 3, 3, 0, 60, 8, 'personal', 500, 29),
  -- Industrial
  ('small_factory', 'Small Factory', 'industrial', '🏭', 'A small plant on a 1×1 lot. Some jobs, a little noise.', 60, 1, 1, 1, 0, 5, -1, null, null, 29),
  ('distribution', 'Distribution Center', 'industrial', '🚚', 'Trucks in, trucks out (3×3). Lots of jobs.', 600, 3, 3, 3, 0, 50, -5, 'work', 450, 33),
  -- Municipal & services
  ('police', 'Police Station', 'service', '🚓', 'Keeps the streets safe.', 200, 1, 1, 1, 0, 8, 5, 'personal', 150, 44),
  ('hospital', 'Hospital', 'service', '🏥', 'Emergency care and doctors for the whole city (2×2).', 700, 2, 2, 2, 0, 40, 10, 'health', 500, 49),
  ('city_hall', 'City Hall', 'service', '🏛️', 'Where the city is run, with a clock tower (2×2).', 800, 2, 2, 2, 0, 20, 8, 'work', 500, 50),
  -- Knowledge
  ('high_school', 'High School', 'service', '🎒', 'Classrooms, labs and a track (2×2).', 450, 2, 2, 2, 0, 20, 6, 'knowledge', 300, 51),
  ('university', 'University', 'service', '🎓', 'Lecture halls around a green quad (3×3).', 1200, 3, 3, 3, 0, 60, 10, 'knowledge', 700, 52),
  -- Recreation & community
  ('pool', 'Swimming Pool', 'service', '🏊', 'Lanes and a diving board on a 1×1 lot.', 180, 1, 1, 1, 0, 3, 7, 'health', 200, 53),
  ('gym', 'Gym', 'service', '🏋️', 'Weights, classes and a juice bar (2×1).', 220, 2, 2, 1, 0, 6, 6, 'health', 150, 54),
  ('museum', 'Museum', 'service', '🖼️', 'Art and history in a long gallery (3×1).', 650, 3, 3, 1, 0, 12, 10, 'knowledge', 450, 55),
  ('golf', 'Golf Course', 'service', '⛳', 'Fairways, greens and a clubhouse (4×3).', 900, 4, 4, 3, 0, 10, 14, 'health', 600, 56),
  ('stadium', 'Sports Stadium', 'service', '🏟️', 'Big games under the lights (4×4).', 1500, 4, 4, 4, 0, 40, 18, 'health', 800, 57),
  ('zoo', 'Zoo', 'service', '🦁', 'Animals from around the world (4×4).', 1300, 4, 4, 4, 0, 30, 20, 'knowledge', 650, 58),
  -- Transportation
  ('gas_station', 'Gas Station', 'service', '⛽', 'Fuel and snacks for drivers.', 120, 1, 1, 1, 0, 4, -1, 'work', 75, 60),
  ('bus_station', 'Bus Station', 'service', '🚌', 'Buses to every part of town.', 250, 1, 1, 1, 0, 6, 3, 'work', 150, 61),
  ('parking', 'Parking Garage', 'service', '🅿️', 'Three floors of parking on a 2×1 lot.', 200, 2, 2, 1, 0, 2, 1, 'work', 120, 62),
  ('airport', 'Airport', 'service', '✈️', 'A runway and a terminal (3×3). Flights out, visitors in.', 2000, 3, 3, 3, 0, 80, -4, 'work', 900, 63),
  -- Landmarks
  ('monument', 'Monument', 'service', '🗽', 'A landmark statue on a plaza (2×2). Everyone loves it.', 1000, 2, 2, 2, 0, 0, 15, 'personal', 700, 70);

-- The home ladder: Small Cottage → Starter House → Suburban House → Townhouse → Apartment Building → High-Rise.
update public.building_types set upgrades_to = 'cottage' where id = 'small_cottage';
update public.building_types set upgrades_to = 'suburban' where id = 'cottage';
update public.building_types set upgrades_to = 'house' where id = 'suburban';
update public.building_types set upgrades_to = 'highrise' where id = 'apartments';
