-- Achievements pay coins once (claim_achievements), and the new "Added 10 tasks" / "Added a goal" badges.
begin;
select plan(8);
insert into auth.users (id, email) values ('ce111111-1111-1111-1111-111111111111', 'rew@example.com'), ('ce222222-2222-2222-2222-222222222222', 'rew2@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ce111111-1111-1111-1111-111111111111"}', true);
select is((select coins from public.my_achievement_coins()), 0, 'nothing to collect at first');
insert into public.tasks (title, area, difficulty, repeat) select 'T' || g, 'health', 'easy', 'daily' from generate_series(1, 10) g;
insert into public.goals (title, target_date) values ('Run a 5K', current_date + 30);
select public.complete_task((select id from public.tasks where title = 'T1'));
select is((select array_agg(id order by id) from (select id from public.achievements union select null where false) x),
  null::text[], 'not saved until synced');
select is((select row(badges, coins)::text from public.my_achievement_coins()), '(3,100)', 'first check-off 25 + 10 tasks 50 + a goal 25 waiting');
select ok(exists (select 1 from public.achievements where id = 'tasks_10') and exists (select 1 from public.achievements where id = 'goal_added'), 'new badges earned');
select is((select coins from public.claim_achievements()), 100, 'collected 100 coins');
select is((select coins from public.claim_achievements()), 0, 'nothing twice');
select is((select coins from public.my_achievement_coins()), 0, 'nothing left to collect');
select set_config('request.jwt.claims', '{"sub":"ce222222-2222-2222-2222-222222222222"}', true);
select is((select coins from public.claim_achievements()), 0, 'other players collect nothing of yours');
select * from finish();
rollback;
