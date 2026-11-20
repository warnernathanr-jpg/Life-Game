-- Three more recreation buildings: Soccer Field (3x3), Beach (3x1, must touch water) and Amusement Park (4x4).
insert into public.building_types
  (id, name, category, icon, description, cost, size, w, d, population, jobs, happiness, unlock_area, unlock_points, sort_order)
values
  ('soccer_field', 'Soccer Field', 'service', '⚽', 'A full-size pitch with goals and bleachers (3×3).', 600, 3, 3, 3, 0, 6, 10, 'health', 300, 59),
  ('beach', 'Beach', 'service', '🏖️', 'Sand, umbrellas and a lifeguard tower. Must touch water (3×1).', 400, 3, 3, 1, 0, 4, 12, 'personal', 200, 60),
  ('amusement_park', 'Amusement Park', 'service', '🎡', 'A Ferris wheel, a roller coaster and more rides (4×4).', 2000, 4, 4, 4, 0, 40, 24, 'personal', 900, 61);

-- A beach must touch water along one of its sides. Checked at the end of the transaction (so moving the whole city, which
-- shifts the water too, isn't refused halfway through).
create function private.beach_by_water()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_type public.building_types;
  v_w integer;
  v_d integer;
begin
  select * into v_type from public.building_types where id = new.type_id;
  v_w := private.fw(v_type, new.rotated);
  v_d := private.fd(v_type, new.rotated);
  if not exists (
    select 1 from public.placed_buildings w
    where w.user_id = new.user_id and w.type_id = 'water'
      and (
        (w.x between new.x and new.x + v_w - 1 and (w.y = new.y - 1 or w.y = new.y + v_d))
        or (w.y between new.y and new.y + v_d - 1 and (w.x = new.x - 1 or w.x = new.x + v_w))
      )
  ) then
    raise exception 'needs_water' using errcode = '22023';
  end if;
  return null;
end $$;
revoke execute on function private.beach_by_water() from public, anon, authenticated;

create constraint trigger placed_buildings_beach_water
  after insert or update of x, y, rotated on public.placed_buildings
  deferrable initially deferred
  for each row when (new.type_id = 'beach')
  execute function private.beach_by_water();
