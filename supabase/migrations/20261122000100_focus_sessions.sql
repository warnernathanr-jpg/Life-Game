-- Focus timer: the user picks 5–60 minutes and keeps the page open (the app ends the session if they
-- leave it). Coins (1 per minute, up to daily_focus_cap() a day) are paid by complete_focus() only once
-- the full time has passed, and only within focus_claim_window() after it ends.

create function public.daily_focus_cap()
returns integer language sql immutable set search_path = '' as $$ select 180 $$;

create function public.focus_claim_window()
returns interval language sql immutable set search_path = '' as $$ select interval '10 minutes' $$;

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  minutes integer not null check (minutes between 5 and 60),
  label text check (char_length(label) <= 80),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  local_day date not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'abandoned')),
  coins integer not null default 0 check (coins >= 0),
  finished_at timestamptz,
  check (ends_at = started_at + make_interval(mins => minutes))
);
create index focus_sessions_user_day_idx on public.focus_sessions (user_id, local_day);
-- At most one running session per user.
create unique index focus_sessions_one_running on public.focus_sessions (user_id) where status = 'running';
alter table public.focus_sessions enable row level security;
create policy "focus_sessions: read own" on public.focus_sessions
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.focus_sessions from anon, authenticated;
grant select on public.focus_sessions to authenticated;

-- Start a session (any running one is abandoned first).
create function public.start_focus(p_minutes integer, p_label text default null)
returns table (id uuid, started_at timestamptz, ends_at timestamptz, server_now timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_row public.focus_sessions;
begin
  v_profile := private.lock_profile(v_user);
  if p_minutes is null or p_minutes < 5 or p_minutes > 60 then
    raise exception 'bad_minutes' using errcode = '22023';
  end if;

  update public.focus_sessions set status = 'abandoned', finished_at = now()
  where user_id = v_user and status = 'running';

  insert into public.focus_sessions (user_id, minutes, label, started_at, ends_at, local_day)
  values (v_user, p_minutes, nullif(left(trim(coalesce(p_label, '')), 80), ''), now(),
          now() + make_interval(mins => p_minutes), private.local_today(v_profile.timezone))
  returning * into v_row;

  return query select v_row.id, v_row.started_at, v_row.ends_at, now();
end $$;

-- Claim a finished session's coins.
create function public.complete_focus(p_id uuid)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_row public.focus_sessions;
  v_earned integer;
  v_coins integer;
begin
  v_profile := private.lock_profile(v_user);
  select * into v_row from public.focus_sessions s where s.id = p_id and s.user_id = v_user for update;
  if not found then
    raise exception 'focus_not_found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'running' then
    raise exception 'focus_over' using errcode = '22023';
  end if;
  if now() < v_row.ends_at - interval '3 seconds' then
    raise exception 'focus_too_early' using errcode = '22023';
  end if;
  if now() > v_row.ends_at + public.focus_claim_window() then
    update public.focus_sessions set status = 'abandoned', finished_at = now() where id = v_row.id;
    return query select 0, private.balance(v_user);
    return;
  end if;

  select coalesce(sum(s.coins), 0) into v_earned
  from public.focus_sessions s where s.user_id = v_user and s.local_day = private.local_today(v_profile.timezone);
  v_coins := greatest(0, least(v_row.minutes, public.daily_focus_cap() - v_earned));

  update public.focus_sessions
  set status = 'completed', coins = v_coins, finished_at = now(),
      local_day = private.local_today(v_profile.timezone)
  where id = v_row.id;

  if v_coins > 0 then
    insert into public.coin_ledger (user_id, amount, kind, reason)
    values (v_user, v_coins, 'focus',
            left(format('Focused %s min', v_row.minutes) || coalesce(': ' || v_row.label, ''), 200));
  end if;

  return query select v_coins, private.balance(v_user);
end $$;

-- End a running session without coins (left the page, or gave up).
create function public.fail_focus(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.focus_sessions set status = 'failed', finished_at = now()
  where id = p_id and user_id = auth.uid() and status = 'running';
end $$;

revoke execute on function public.daily_focus_cap(), public.focus_claim_window(), public.start_focus(integer, text),
  public.complete_focus(uuid), public.fail_focus(uuid) from public, anon;
grant execute on function public.daily_focus_cap(), public.focus_claim_window(), public.start_focus(integer, text),
  public.complete_focus(uuid), public.fail_focus(uuid) to authenticated;
