-- Stop signs and traffic lights on crossings (road tiles where 3 or 4 roads meet). They change how cars take turns
-- there (and how much a junction slows traffic). Bought with coins, half back when removed; only through functions.
create table public.road_controls (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  x integer not null,
  y integer not null,
  kind text not null check (kind in ('stop', 'light')),
  price_paid integer not null check (price_paid >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, x, y)
);
alter table public.road_controls enable row level security;
create policy road_controls_select on public.road_controls for select to authenticated using (user_id = auth.uid());
revoke all on public.road_controls from anon, authenticated;
grant select on public.road_controls to authenticated;

create function public.road_control_price(p_kind text) returns integer
language sql immutable set search_path = '' as $$
  select case p_kind when 'stop' then 10 when 'light' then 40 end
$$;

create function public.place_road_control(p_x integer, p_y integer, p_kind text)
returns table (cost integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_price integer := public.road_control_price(p_kind);
  v_old public.road_controls;
  v_roads integer;
begin
  if v_price is null then
    raise exception 'unknown_building' using errcode = 'P0002';
  end if;
  perform private.lock_profile(v_user);
  if not exists (
    select 1 from public.placed_buildings b join public.building_types t on t.id = b.type_id
    where b.user_id = v_user and b.x = p_x and b.y = p_y and t.category = 'road' and b.type_id <> 'bridge'
  ) then
    raise exception 'not_a_crossing' using errcode = '22023';
  end if;
  select count(*) into v_roads
  from public.placed_buildings b join public.building_types t on t.id = b.type_id
  where b.user_id = v_user and t.category = 'road'
    and ((b.x = p_x + 1 and b.y = p_y) or (b.x = p_x - 1 and b.y = p_y) or (b.x = p_x and b.y = p_y + 1) or (b.x = p_x and b.y = p_y - 1));
  if v_roads < 3 then
    raise exception 'not_a_crossing' using errcode = '22023';
  end if;
  select * into v_old from public.road_controls where user_id = v_user and x = p_x and y = p_y for update;
  if found and v_old.kind = p_kind then
    raise exception 'already_there' using errcode = '23505';
  end if;
  if private.balance(v_user) < v_price then
    raise exception 'not_enough_coins' using errcode = '22023';
  end if;
  insert into public.road_controls (user_id, x, y, kind, price_paid) values (v_user, p_x, p_y, p_kind, v_price)
  on conflict (user_id, x, y) do update set kind = excluded.kind, price_paid = excluded.price_paid, created_at = now();
  insert into public.coin_ledger (user_id, amount, kind, reason)
  values (v_user, -v_price, 'building', case p_kind when 'stop' then 'Stop sign' else 'Traffic light' end);
  return query select v_price, private.balance(v_user);
end $$;

create function public.remove_road_control(p_x integer, p_y integer)
returns table (refund integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_old public.road_controls;
  v_refund integer;
begin
  perform private.lock_profile(v_user);
  delete from public.road_controls where user_id = v_user and x = p_x and y = p_y returning * into v_old;
  if not found then
    raise exception 'building_not_found' using errcode = 'P0002';
  end if;
  v_refund := v_old.price_paid / 2;
  if v_refund > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, v_refund, 'building_sold', case v_old.kind when 'stop' then 'Removed stop sign' else 'Removed traffic light' end);
  end if;
  return query select v_refund, private.balance(v_user);
end $$;

-- A control goes when the road under it is demolished (swapping road kinds keeps it: that's an update).
create function private.drop_road_control() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.road_controls where user_id = old.user_id and x = old.x and y = old.y;
  return old;
end $$;
create trigger placed_buildings_drop_control after delete on public.placed_buildings
for each row execute function private.drop_road_control();

revoke execute on function public.place_road_control(integer, integer, text), public.remove_road_control(integer, integer) from public, anon;
grant execute on function public.place_road_control(integer, integer, text), public.remove_road_control(integer, integer) to authenticated;
