-- Start over brings the Getting started guide back (it was skipped for good before).
create or replace function public.reset_progress(p_confirm text)
returns table (balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if p_confirm is distinct from 'START OVER' then
    raise exception 'confirm_reset' using errcode = '22023';
  end if;
  perform private.lock_profile(v_user);
  delete from public.placed_buildings where user_id = v_user;
  delete from public.road_controls where user_id = v_user;
  delete from public.city_milestones where user_id = v_user;
  delete from public.achievements where user_id = v_user;
  delete from public.task_completions where user_id = v_user;
  delete from public.tasks where user_id = v_user;
  delete from public.focus_sessions where user_id = v_user;
  delete from public.goals where user_id = v_user; -- steps go with them
  delete from public.user_rewards where user_id = v_user;
  delete from public.coin_ledger where user_id = v_user;
  update public.profiles set city_size = 8, land_purchases = 0, tutorial_hidden = false where id = v_user;
  insert into public.coin_ledger (user_id, amount, kind, reason) values (v_user, 100, 'bonus', 'Welcome bonus (started over)');
  return query select private.balance(v_user);
end $$;
