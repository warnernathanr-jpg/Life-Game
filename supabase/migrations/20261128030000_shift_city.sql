-- Slide the whole city one tile inside your land (free): everything built and the road controls move together.
-- Refused if anything would go past the edge of your land.
create function public.shift_city(p_dx integer, p_dy integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
begin
  if abs(p_dx) + abs(p_dy) <> 1 then
    raise exception 'bad_direction' using errcode = '22023';
  end if;
  v_profile := private.lock_profile(v_user);
  if exists (
    select 1 from public.placed_buildings b join public.building_types t on t.id = b.type_id
    where b.user_id = v_user
      and (b.x + p_dx < 0 or b.y + p_dy < 0
        or b.x + p_dx + private.fw(t, b.rotated) > v_profile.city_size
        or b.y + p_dy + private.fd(t, b.rotated) > v_profile.city_size)
  ) then
    raise exception 'off_the_edge' using errcode = '22023';
  end if;
  update public.placed_buildings set x = x + p_dx, y = y + p_dy where user_id = v_user;
  -- Road controls have a unique position: move them out of the way first, then into place.
  update public.road_controls set x = x + 100000, y = y + 100000 where user_id = v_user;
  update public.road_controls set x = x - 100000 + p_dx, y = y - 100000 + p_dy where user_id = v_user;
end $$;

revoke execute on function public.shift_city(integer, integer) from public, anon;
grant execute on function public.shift_city(integer, integer) to authenticated;
