-- Friend requests. Adding someone by code (or through their invite link) sends them a request; they accept (you become
-- friends both ways and can visit each other's cities) or decline. If they had already asked you, adding them accepts it.
-- Friendships made before this stay as they are.
create table public.friend_requests (
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
alter table public.friend_requests enable row level security;
create policy friend_requests_select on public.friend_requests for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());
revoke all on public.friend_requests from anon, authenticated;
grant select on public.friend_requests to authenticated;

-- Become friends both ways and clear any request between the two.
create function private.make_friends(p_a uuid, p_b uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.friendships (user_id, friend_id) values (p_a, p_b), (p_b, p_a) on conflict do nothing;
  delete from public.friend_requests where (from_id = p_a and to_id = p_b) or (from_id = p_b and to_id = p_a);
$$;
revoke execute on function private.make_friends(uuid, uuid) from public, anon, authenticated;

drop function public.add_friend(text);
create function public.add_friend(p_code text)
returns table (friend_id uuid, city_name text, status text)
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
  if exists (select 1 from public.friendships f where f.user_id = v_user and f.friend_id = v_friend.id) then
    return query select v_friend.id, v_friend.city_name, 'friends'::text;
  elsif exists (select 1 from public.friend_requests r where r.from_id = v_friend.id and r.to_id = v_user) then
    perform private.make_friends(v_user, v_friend.id); -- they asked first: that's a yes
    return query select v_friend.id, v_friend.city_name, 'friends'::text;
  else
    insert into public.friend_requests (from_id, to_id) values (v_user, v_friend.id) on conflict do nothing;
    return query select v_friend.id, v_friend.city_name, 'requested'::text;
  end if;
end $$;

create function public.accept_friend_request(p_from uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.friend_requests r where r.from_id = p_from and r.to_id = auth.uid()) then
    raise exception 'no_request' using errcode = 'P0002';
  end if;
  perform private.make_friends(auth.uid(), p_from);
end $$;

-- Decline a request to you, or take back one you sent.
create function public.drop_friend_request(p_other uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.friend_requests
  where (from_id = p_other and to_id = auth.uid()) or (from_id = auth.uid() and to_id = p_other);
$$;

-- Requests to you ('in') and from you ('out'), with the other person's name and city.
create function public.my_friend_requests()
returns table (other_id uuid, direction text, display_name text, city_name text, city_size integer, population integer, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, case when r.to_id = auth.uid() then 'in' else 'out' end, p.display_name, p.city_name, p.city_size,
    private.city_population(p.id), r.created_at
  from public.friend_requests r
  join public.profiles p on p.id = case when r.to_id = auth.uid() then r.from_id else r.to_id end
  where r.to_id = auth.uid() or r.from_id = auth.uid()
  order by r.created_at desc;
$$;

revoke execute on function public.add_friend(text), public.accept_friend_request(uuid), public.drop_friend_request(uuid),
  public.my_friend_requests() from public, anon;
grant execute on function public.add_friend(text), public.accept_friend_request(uuid), public.drop_friend_request(uuid),
  public.my_friend_requests() to authenticated;
