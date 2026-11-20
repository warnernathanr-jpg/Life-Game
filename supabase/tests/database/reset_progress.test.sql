-- Start over: wipes only the caller's progress, needs the exact confirmation, gives the welcome bonus again.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('a7111111-1111-1111-1111-111111111111', 'reset1@example.com'),
  ('a7222222-2222-2222-2222-222222222222', 'reset2@example.com');
insert into public.coin_ledger (user_id, amount, kind, reason) values ('a7111111-1111-1111-1111-111111111111', 500, 'bonus', 'test'), ('a7222222-2222-2222-2222-222222222222', 500, 'bonus', 'test');
insert into public.city_milestones (user_id, population, coins) values ('a7111111-1111-1111-1111-111111111111', 50, 100);
insert into public.achievements (user_id, id, achieved_at) values ('a7111111-1111-1111-1111-111111111111', 'first_checkoff', now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7111111-1111-1111-1111-111111111111"}', true);
insert into public.tasks (title, area, difficulty, repeat) values ('Walk', 'health', 'easy', 'daily');
select public.complete_task((select id from public.tasks where title = 'Walk'));
select public.buy_tiles('dirt_road', '[[0,0],[1,0]]');
insert into public.goals (title, target_date) values ('Goal', current_date + 10);

select throws_ok($$ select * from public.reset_progress('yes') $$, '22023', 'confirm_reset', 'needs the exact words');
select results_eq($$ select balance from public.reset_progress('START OVER') $$, $$ values (100::bigint) $$, 'back to the welcome 100 coins');
select is((select count(*)::int from public.tasks) + (select count(*)::int from public.task_completions) + (select count(*)::int from public.placed_buildings) + (select count(*)::int from public.goals), 0, 'tasks, check-offs, city and goals are gone');
select is((select count(*)::int from public.coin_ledger), 1, 'one ledger row: the welcome bonus');
select is((select city_size from public.profiles), 8, 'land back to 8x8');
select is((select count(*)::int from public.city_milestones), 0, 'city milestones cleared, so their bonuses can be earned again');
select is((select count(*)::int from public.achievements), 0, 'achievements cleared');

select set_config('request.jwt.claims', '{"sub":"a7222222-2222-2222-2222-222222222222"}', true);
select is((select balance from public.my_progress()), 600::bigint, 'the other user is untouched');
select set_config('request.jwt.claims', '{}', true);
reset role;
set local role anon;
select throws_ok($$ select * from public.reset_progress('START OVER') $$, '42501', null, 'not for anonymous visitors');

select * from finish();
rollback;
