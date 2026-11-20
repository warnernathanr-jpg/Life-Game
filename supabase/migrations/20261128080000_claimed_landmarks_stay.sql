-- A claimed milestone keeps its landmark unlocked for good (milestones are kept forever), even if the population drops.
create or replace function public.place_landmark(p_type_id text, p_x integer, p_y integer, p_rotated boolean default false)
returns table (building_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_type public.building_types;
  v_id uuid;
begin
  v_profile := private.lock_profile(v_user);
  select * into v_type from public.building_types where id = p_type_id and milestone_population is not null;
  if not found then
    raise exception 'unknown_building' using errcode = 'P0002';
  end if;
  if private.city_population(v_user) < v_type.milestone_population
     and not exists (select 1 from public.city_milestones m where m.user_id = v_user and m.population = v_type.milestone_population) then
    raise exception 'not_enough_people' using errcode = '22023';
  end if;
  if exists (select 1 from public.placed_buildings where user_id = v_user and type_id = p_type_id) then
    raise exception 'already_there' using errcode = '23505';
  end if;
  if not private.lot_free_rect(v_user, v_profile.city_size, p_x, p_y, private.fw(v_type, p_rotated), private.fd(v_type, p_rotated), null) then
    raise exception 'lot_taken' using errcode = '23P01';
  end if;
  insert into public.placed_buildings (user_id, type_id, x, y, price_paid, rotated)
  values (v_user, p_type_id, p_x, p_y, 0, coalesce(p_rotated, false))
  returning id into v_id;
  return query select v_id;
end $$;
