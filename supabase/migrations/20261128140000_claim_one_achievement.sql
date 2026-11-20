-- Achievement coins are collected one badge at a time: claim_achievement(id) replaces claim_achievements().
drop function public.claim_achievements();

create function public.claim_achievement(p_id text)
returns table (coins integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_reward integer := private.achievement_reward(p_id);
begin
  perform private.lock_profile(v_user);
  perform public.sync_achievements();
  update public.achievements set claimed_at = now()
  where user_id = v_user and id = p_id and claimed_at is null and v_reward > 0;
  if not found then
    raise exception 'nothing_to_collect' using errcode = '22023';
  end if;
  insert into public.coin_ledger (user_id, amount, kind, reason) values (v_user, v_reward, 'bonus', 'Achievement: ' || p_id);
  return query select v_reward, private.balance(v_user);
end $$;
revoke execute on function public.claim_achievement(text) from public, anon;
grant execute on function public.claim_achievement(text) to authenticated;
