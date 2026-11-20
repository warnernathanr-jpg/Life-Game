-- Admin page: admins are listed in private.admins (added by hand in the database, never from the app). The admin functions
-- check that the caller is an admin and otherwise refuse, so the app still only uses the signed-in user's session.

create table private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admins where user_id = auth.uid());
$$;
revoke execute on function private.is_admin() from public, anon, authenticated;

-- Whether the signed-in player is an admin (for showing the link).
create function public.am_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin();
$$;

-- Sign-ups per day for the last N days (in the admin's own time zone), newest first.
create function public.admin_signups(p_days integer default 30)
returns table (day date, signups integer, played integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
begin
  if not private.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = auth.uid();
  return query
    select d::date,
      (select count(*)::integer from auth.users u where (u.created_at at time zone v_tz)::date = d::date),
      -- of those, how many checked off at least one task
      (select count(*)::integer from auth.users u where (u.created_at at time zone v_tz)::date = d::date
         and exists (select 1 from public.task_completions c where c.user_id = u.id and c.task_id is not null))
    from generate_series((now() at time zone v_tz)::date - (least(greatest(p_days, 1), 365) - 1), (now() at time zone v_tz)::date, interval '1 day') d
    order by 1 desc;
end $$;

-- Every player with how far they've got, newest first.
create function public.admin_players()
returns table (
  user_id uuid, email text, display_name text, city_name text, signed_up timestamptz, last_sign_in timestamptz,
  tasks integer, checkoffs integer, last_checkoff timestamptz, buildings integer, population integer, coins bigint,
  land integer, friends integer, tutorial_done boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, p.display_name, p.city_name, u.created_at, u.last_sign_in_at,
      (select count(*)::integer from public.tasks t where t.user_id = u.id),
      (select count(*)::integer from public.task_completions c where c.user_id = u.id and c.task_id is not null),
      (select max(c.completed_at) from public.task_completions c where c.user_id = u.id and c.task_id is not null),
      (select count(*)::integer from public.placed_buildings b join public.building_types bt on bt.id = b.type_id
        where b.user_id = u.id and bt.category not in ('road', 'landscape')),
      private.city_population(u.id),
      private.balance(u.id),
      p.city_size,
      (select count(*)::integer from public.friendships f where f.user_id = u.id),
      exists (select 1 from public.user_rewards r where r.user_id = u.id and r.reward = 'tutorial')
    from auth.users u left join public.profiles p on p.id = u.id
    order by u.created_at desc
    limit 500;
end $$;

revoke execute on function public.am_admin(), public.admin_signups(integer), public.admin_players() from public, anon;
grant execute on function public.am_admin(), public.admin_signups(integer), public.admin_players() to authenticated;
