-- 1. Gentler land prices: 300 × 1.35ⁿ (was 1.6ⁿ), rounded to 10. All 11 purchases now cost about 22,400 (was 87,460).
create or replace function public.land_price(p_purchases integer)
returns bigint language sql immutable set search_path = '' as $$
  select (round(300 * power(1.35, p_purchases) / 10) * 10)::bigint;
$$;

-- 2. Population milestones. A city's population counts homes beside a road (the server's simple check; the app also
--    needs the road to join the main network). Reaching 50 / 100 / 250 / 500 / 1,000 / 2,500 people pays a one-time bonus
--    (once ever, even after Start over) and makes that milestone's landmark available: free, one each, and never sold in the
--    shop (buy_building refuses them because their unlock_points can't be reached; place_landmark() places them).
alter table public.building_types add column milestone_population integer check (milestone_population > 0);

insert into public.building_types
  (id, name, category, icon, description, cost, size, w, d, population, jobs, happiness, unlock_area, unlock_points, sort_order, milestone_population)
values
  ('welcome_arch', 'Welcome Arch', 'service', '', 'A grand arch welcoming visitors to town. Reach 50 people.', 1, 1, 1, 1, 0, 0, 4, 'personal', 1000000000, 90, 50),
  ('clock_tower', 'Clock Tower', 'service', '', 'A brick clock tower everyone sets their watch by. Reach 100 people.', 1, 1, 1, 1, 0, 0, 6, 'personal', 1000000000, 91, 100),
  ('fountain', 'Fountain Plaza', 'service', '', 'A paved plaza around a splashing fountain. Reach 250 people.', 1, 2, 2, 2, 0, 0, 10, 'personal', 1000000000, 92, 250),
  ('founders_statue', 'Founders'' Statue', 'service', '', 'A golden statue honouring the town''s founders. Reach 500 people.', 1, 2, 2, 2, 0, 0, 12, 'personal', 1000000000, 93, 500),
  ('observation_tower', 'Observation Tower', 'service', '', 'A slender tower with a view over the whole city. Reach 1,000 people.', 1, 2, 2, 2, 0, 4, 16, 'personal', 1000000000, 94, 1000),
  ('crystal_spire', 'Crystal Spire', 'service', '', 'A shining glass spire, the pride of a great city. Reach 2,500 people.', 1, 2, 2, 2, 0, 6, 22, 'personal', 1000000000, 95, 2500);

create function public.city_milestone_bonus(p_population integer) returns integer
language sql immutable set search_path = '' as $$
  select case p_population when 50 then 100 when 100 then 200 when 250 then 400 when 500 then 750
    when 1000 then 1500 when 2500 then 3000 end
$$;

create function private.city_population(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(t.population), 0)::integer
  from public.placed_buildings b
  join public.building_types t on t.id = b.type_id
  where b.user_id = p_user and t.population > 0
    and exists (
      select 1 from public.placed_buildings r join public.building_types rt on rt.id = r.type_id
      where r.user_id = p_user and rt.category = 'road'
        and ((r.x between b.x and b.x + private.fw(t, b.rotated) - 1 and (r.y = b.y - 1 or r.y = b.y + private.fd(t, b.rotated)))
          or (r.y between b.y and b.y + private.fd(t, b.rotated) - 1 and (r.x = b.x - 1 or r.x = b.x + private.fw(t, b.rotated))))
    );
$$;

create table public.city_milestones (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  population integer not null,
  coins integer not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, population)
);
alter table public.city_milestones enable row level security;
create policy city_milestones_select on public.city_milestones for select to authenticated using (user_id = auth.uid());
revoke all on public.city_milestones from anon, authenticated;
grant select on public.city_milestones to authenticated;

create function public.claim_city_milestone(p_population integer)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_bonus integer := public.city_milestone_bonus(p_population);
begin
  if v_bonus is null then
    raise exception 'unknown_milestone' using errcode = '22023';
  end if;
  perform private.lock_profile(v_user);
  if exists (select 1 from public.city_milestones m where m.user_id = v_user and m.population = p_population) then
    raise exception 'already_done' using errcode = '23505';
  end if;
  if private.city_population(v_user) < p_population then
    raise exception 'not_enough_people' using errcode = '22023';
  end if;
  insert into public.city_milestones (user_id, population, coins) values (v_user, p_population, v_bonus);
  insert into public.coin_ledger (user_id, amount, kind, reason)
  values (v_user, v_bonus, 'bonus', format('City milestone: %s people', p_population));
  return query select v_bonus, private.balance(v_user);
end $$;

create function public.place_landmark(p_type_id text, p_x integer, p_y integer, p_rotated boolean default false)
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
  if private.city_population(v_user) < v_type.milestone_population then
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

create function public.my_city_population() returns integer
language sql stable security definer set search_path = '' as $$ select private.city_population(auth.uid()) $$;

-- 3. Friends: every city has a 6-letter code; add a friend by their code and visit their city (read only).
create function private.new_city_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6)
$$;
alter table public.profiles add column city_code text unique default private.new_city_code();
update public.profiles set city_code = private.new_city_code() where city_code is null;
alter table public.profiles alter column city_code set not null;

create table public.friendships (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
alter table public.friendships enable row level security;
create policy friendships_select on public.friendships for select to authenticated using (user_id = auth.uid());
create policy friendships_remove on public.friendships for delete to authenticated using (user_id = auth.uid());
revoke all on public.friendships from anon, authenticated;
grant select, delete on public.friendships to authenticated;

create function public.add_friend(p_code text)
returns table (friend_id uuid, city_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_friend public.profiles;
begin
  select * into v_friend from public.profiles p where p.city_code = upper(btrim(p_code));
  if not found then
    raise exception 'unknown_city_code' using errcode = 'P0002';
  end if;
  if v_friend.id = v_user then
    raise exception 'own_city_code' using errcode = '22023';
  end if;
  insert into public.friendships (user_id, friend_id) values (v_user, v_friend.id) on conflict do nothing;
  return query select v_friend.id, v_friend.city_name;
end $$;

-- Friends' cities: name, size, population and buildings, only for cities you've added.
create function public.my_friends()
returns table (friend_id uuid, city_name text, city_code text, city_size integer, population integer, buildings bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.city_name, p.city_code, p.city_size, private.city_population(p.id),
    (select count(*) from public.placed_buildings b join public.building_types t on t.id = b.type_id
     where b.user_id = p.id and t.category not in ('road', 'landscape'))
  from public.friendships f join public.profiles p on p.id = f.friend_id
  where f.user_id = auth.uid()
  order by f.created_at;
$$;

create function public.friend_city(p_friend uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.friendships f where f.user_id = auth.uid() and f.friend_id = p_friend) then
    raise exception 'not_a_friend' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'city_name', p.city_name,
      'city_size', p.city_size,
      'placed', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'type_id', b.type_id, 'x', b.x, 'y', b.y,
                 'facing', b.facing, 'rotated', b.rotated, 'color_seed', b.color_seed) order by b.created_at)
               from public.placed_buildings b where b.user_id = p.id), '[]'::jsonb),
      'controls', coalesce((select jsonb_agg(jsonb_build_object('x', c.x, 'y', c.y, 'kind', c.kind))
               from public.road_controls c where c.user_id = p.id), '[]'::jsonb)
    )
    from public.profiles p where p.id = p_friend
  );
end $$;

revoke execute on function public.claim_city_milestone(integer), public.place_landmark(text, integer, integer, boolean),
  public.my_city_population(), public.add_friend(text), public.my_friends(), public.friend_city(uuid) from public, anon;
grant execute on function public.claim_city_milestone(integer), public.place_landmark(text, integer, integer, boolean),
  public.my_city_population(), public.add_friend(text), public.my_friends(), public.friend_city(uuid) to authenticated;
revoke execute on function private.city_population(uuid), private.new_city_code() from public, anon, authenticated;

-- 4. Players' names (profiles.display_name, set in Settings) show with the city name to friends.
drop function public.my_friends();
create function public.my_friends()
returns table (friend_id uuid, city_name text, city_code text, city_size integer, population integer, buildings bigint, display_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.city_name, p.city_code, p.city_size, private.city_population(p.id),
    (select count(*) from public.placed_buildings b join public.building_types t on t.id = b.type_id
     where b.user_id = p.id and t.category not in ('road', 'landscape')),
    p.display_name
  from public.friendships f join public.profiles p on p.id = f.friend_id
  where f.user_id = auth.uid()
  order by f.created_at;
$$;
revoke execute on function public.my_friends() from public, anon;
grant execute on function public.my_friends() to authenticated;

create or replace function public.friend_city(p_friend uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.friendships f where f.user_id = auth.uid() and f.friend_id = p_friend) then
    raise exception 'not_a_friend' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'city_name', p.city_name,
      'display_name', p.display_name,
      'city_size', p.city_size,
      'placed', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'type_id', b.type_id, 'x', b.x, 'y', b.y,
                 'facing', b.facing, 'rotated', b.rotated, 'color_seed', b.color_seed) order by b.created_at)
               from public.placed_buildings b where b.user_id = p.id), '[]'::jsonb),
      'controls', coalesce((select jsonb_agg(jsonb_build_object('x', c.x, 'y', c.y, 'kind', c.kind))
               from public.road_controls c where c.user_id = p.id), '[]'::jsonb)
    )
    from public.profiles p where p.id = p_friend
  );
end $$;
