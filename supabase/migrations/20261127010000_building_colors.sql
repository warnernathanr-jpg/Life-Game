-- Players can pick a building's color scheme (free). null = the automatic colors from the building's id.
alter table public.placed_buildings
  add column color_seed bigint check (color_seed is null or color_seed between 0 and 4294967295);

create function public.set_building_color(p_building_id uuid, p_seed bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_seed is not null and (p_seed < 0 or p_seed > 4294967295) then
    raise exception 'bad_color' using errcode = '22023';
  end if;
  update public.placed_buildings b set color_seed = p_seed
  from public.building_types t
  where b.id = p_building_id and b.user_id = auth.uid() and t.id = b.type_id
    and t.category not in ('road', 'landscape');
  if not found then
    raise exception 'building_not_found' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.set_building_color(uuid, bigint) from public, anon;
grant execute on function public.set_building_color(uuid, bigint) to authenticated;
