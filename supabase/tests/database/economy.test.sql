-- Coins, tasks, buildings and land: rules enforced by the database functions,
-- and isolation between two users.
begin;
select plan(62);

-- Two users (the auth trigger creates profiles and the 100-coin welcome bonus).
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com', '{"display_name":"Ann","timezone":"America/Chicago"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com', '{"timezone":"Not/AZone"}');

select is((select timezone from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'America/Chicago', 'sign-up keeps a valid time zone');
select is((select timezone from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'UTC', 'an invalid time zone becomes UTC');
select is((select city_size from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  8, 'a new city is 8x8');

-- Act as user A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

select is((select balance from public.my_progress()), 100::bigint, 'welcome bonus of 100 coins');

insert into public.tasks (id, title, area, difficulty, repeat) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Go for a run', 'health', 'medium', 'daily'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'File taxes', 'personal', 'hard', 'once'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Read a chapter', 'knowledge', 'easy', 'weekly');

select results_eq($$ select coins, balance from public.complete_task('aaaaaaaa-0000-0000-0000-000000000001') $$,
  $$ values (25, 125::bigint) $$, 'medium task earns 25');
select throws_ok($$ select * from public.complete_task('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '23505', 'already_done', 'a daily task can only be done once a day');
select results_eq($$ select coins from public.complete_task('aaaaaaaa-0000-0000-0000-000000000002') $$,
  $$ values (50) $$, 'hard task earns 50');
select throws_ok($$ select * from public.complete_task('aaaaaaaa-0000-0000-0000-000000000002') $$,
  '23505', 'already_done', 'a one-off task can only be done once');
select results_eq($$ select coins from public.complete_task('aaaaaaaa-0000-0000-0000-000000000003') $$,
  $$ values (10) $$, 'easy task earns 10');
select throws_ok($$ select * from public.complete_task('aaaaaaaa-0000-0000-0000-000000000003') $$,
  '23505', 'already_done', 'a weekly task can only be done once a week');
select is((select period_start from public.task_completions where task_id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  (select (now() at time zone 'America/Chicago')::date - (extract(isodow from (now() at time zone 'America/Chicago')::date)::int - 1)),
  'weekly completions count for the Monday of the week (user time zone)');
select is((select balance from public.my_progress()), 185::bigint, 'balance is the sum of the ledger');
select is((select health from public.my_progress()), 25::bigint, 'a medium health task earns 25 health points');

select results_eq($$ select title, done, done_today, reward from public.my_tasks() order by title $$,
  $$ values ('File taxes', true, true, 50), ('Go for a run', true, true, 25), ('Read a chapter', true, true, 10) $$,
  'my_tasks shows what is done this period');
-- Undo.
select results_eq($$ select coins, balance from public.undo_task('aaaaaaaa-0000-0000-0000-000000000003') $$,
  $$ values (10, 175::bigint) $$, 'undo takes the coins back');
select throws_ok($$ select * from public.undo_task('aaaaaaaa-0000-0000-0000-000000000003') $$,
  'P0002', 'not_done', 'nothing to undo twice');
select is((select count(*)::int from public.coin_ledger where kind = 'task_undo'), 1, 'undo is a ledger row, not a deletion');
select lives_ok($$ select * from public.complete_task('aaaaaaaa-0000-0000-0000-000000000003') $$, 'can redo after undo');

-- Archived tasks can't be completed.
insert into public.tasks (id, title, area, difficulty, repeat, archived_at)
values ('aaaaaaaa-0000-0000-0000-000000000004', 'Old', 'work', 'easy', 'daily', now());
select throws_ok($$ select * from public.complete_task('aaaaaaaa-0000-0000-0000-000000000004') $$,
  '22023', 'task_archived', 'archived tasks cannot be completed');

-- No daily cap: earned today so far = 25 + 50 + 10 = 85; eight hard tasks pay 50 each.
insert into public.tasks (id, title, area, difficulty, repeat)
select ('bbbbbbbb-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'Hard ' || g, 'work', 'hard', 'once'
from generate_series(1, 8) g;
select public.complete_task(('bbbbbbbb-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid)
from generate_series(1, 6) g; -- +300 -> 385 today
select results_eq($$ select coins from public.complete_task('bbbbbbbb-0000-0000-0000-000000000007') $$,
  $$ values (50) $$, 'tasks pay in full (no daily cap)');
select results_eq($$ select coins from public.complete_task('bbbbbbbb-0000-0000-0000-000000000008') $$,
  $$ values (50) $$, 'still full pay past 400 coins in a day');
select is((select earned_today from public.my_progress()), 485, 'earned today keeps counting');
select is((select work from public.my_progress()), 400::bigint, 'capped completions still earn area points (8 hard = 400)');
select is((select count(*)::int from public.coin_ledger where amount = 0), 0, 'no zero-coin ledger rows');

-- Balance now: 175 + 10 + 400 = 585.
select is((select balance from public.my_progress()), 585::bigint, 'balance after tasks');

-- Buildings.
select throws_ok($$ select * from public.buy_building('clinic', 0, 0) $$,
  '42501', 'locked', 'a locked building cannot be bought');
select throws_ok($$ select * from public.buy_building('nope', 0, 0) $$,
  'P0002', 'unknown_building', 'unknown building type');
select throws_ok($$ select * from public.buy_building('cottage', 8, 0) $$,
  '23P01', 'lot_taken', 'cannot build outside the city');
select throws_ok($$ select * from public.buy_building('cottage', -1, 0) $$,
  '23P01', 'lot_taken', 'negative coordinates are outside the city');
select throws_ok($$ select * from public.buy_building('apartments', 0, 0) $$,
  '42501', 'locked', 'apartments need 300 personal points (50 so far)');
select results_eq($$ select balance from public.buy_building('warehouse', 0, 0) $$,
  $$ values (445::bigint) $$, 'warehouse (unlocked at 125 work points) costs 140');
select throws_ok($$ select * from public.buy_building('cottage', 0, 0) $$,
  '23P01', 'lot_taken', 'cannot build on an occupied tile');

-- Two more work tasks (+10 each).
insert into public.tasks (id, title, area, difficulty, repeat) values
  ('cccccccc-0000-0000-0000-000000000001', 'W1', 'work', 'easy', 'once'),
  ('cccccccc-0000-0000-0000-000000000002', 'W2', 'work', 'easy', 'once');
select public.complete_task('cccccccc-0000-0000-0000-000000000001');
select public.complete_task('cccccccc-0000-0000-0000-000000000002');
select throws_ok($$ select * from public.buy_building('factory', 0, 0) $$,
  '23P01', 'lot_taken', 'a 2x2 lot overlapping a building is refused');
select throws_ok($$ select * from public.buy_building('factory', 7, 7) $$,
  '23P01', 'lot_taken', 'a 2x2 building must fit inside the city');
select results_eq($$ select balance from public.buy_building('factory', 2, 2) $$,
  $$ values (185::bigint) $$, 'factory placed on a 2x2 lot');
select throws_ok($$ select * from public.buy_building('cottage', 3, 3) $$,
  '23P01', 'lot_taken', 'the 2x2 building covers all four tiles');
select results_eq($$ select balance from public.buy_building('cottage', 4, 4) $$,
  $$ values (145::bigint) $$, 'cottage next to the factory');
select throws_ok($$ select * from public.buy_building('office', 6, 0) $$,
  '22023', 'not_enough_coins', 'cannot buy without enough coins');

-- Move and sell.
select throws_ok($$ select public.move_building((select id from public.placed_buildings where type_id = 'cottage'), 2, 2) $$,
  '23P01', 'lot_taken', 'cannot move onto another building');
select lives_ok($$ select public.move_building((select id from public.placed_buildings where type_id = 'cottage'), 7, 7) $$,
  'move to a free tile');
select results_eq($$ select x, y from public.placed_buildings where type_id = 'cottage' $$,
  $$ values (7, 7) $$, 'the building moved');
select results_eq($$ select refund, balance from public.sell_building((select id from public.placed_buildings where type_id = 'factory')) $$,
  $$ values (140::bigint, 285::bigint) $$, 'selling refunds half the price');

-- Land.
select is(array[public.land_price(0), public.land_price(1), public.land_price(2)], array[300, 410, 550]::bigint[],
  'land gets more expensive each time');
select throws_ok($$ select * from public.buy_land() $$, '22023', 'not_enough_coins', 'land costs coins');
reset role;
insert into public.coin_ledger (user_id, amount, kind, reason)
values ('11111111-1111-1111-1111-111111111111', 1000, 'bonus', 'Test bonus');
set local role authenticated;
select results_eq($$ select city_size, balance from public.buy_land() $$,
  $$ values (10, 985::bigint) $$, 'first expansion: 8 -> 10 for 300');
select results_eq($$ select city_size, balance from public.buy_land() $$,
  $$ values (12, 575::bigint) $$, 'second expansion: 10 -> 12 for 410');
select lives_ok($$ select * from public.buy_building('cottage', 11, 11) $$, 'can build on the new land');
select throws_ok($$ update public.profiles set city_size = 30 $$, '42501', null, 'cannot grow the city directly');
select throws_ok($$ insert into public.coin_ledger (user_id, amount, kind, reason) values (auth.uid(), 5000, 'bonus', 'cheat') $$,
  '42501', null, 'cannot write the ledger directly');
select throws_ok($$ insert into public.placed_buildings (user_id, type_id, x, y, price_paid) values (auth.uid(), 'office', 0, 5, 0) $$,
  '42501', null, 'cannot place buildings without buying them');

-- User B sees and touches nothing of A's.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select is((select count(*)::int from public.tasks), 0, 'B sees none of A''s tasks');
select is((select count(*)::int from public.my_tasks()), 0, 'my_tasks only returns your own');
select is((select count(*)::int from public.task_completions), 0, 'B sees none of A''s completions');
select is((select count(*)::int from public.placed_buildings), 0, 'B sees none of A''s buildings');
select is((select count(*)::int from public.coin_ledger), 1, 'B sees only their own welcome bonus');
select is((select count(*)::int from public.profiles), 1, 'B sees only their own profile');
select throws_ok($$ select * from public.complete_task('aaaaaaaa-0000-0000-0000-000000000001') $$,
  'P0002', 'task_not_found', 'B cannot complete A''s task');
select throws_ok($$ select * from public.sell_building((select id from public.placed_buildings limit 1)) $$,
  'P0002', 'building_not_found', 'B cannot sell A''s building');
update public.tasks set title = 'hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select throws_ok($$ insert into public.tasks (user_id, title, area) values ('11111111-1111-1111-1111-111111111111', 'x', 'work') $$,
  '42501', null, 'B cannot add tasks to A''s list');
reset role;
select is((select title from public.tasks where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'Go for a run',
  'B''s update of A''s task changed nothing');

-- Signed-out (anon) has no access at all.
set local role anon;
select throws_ok($$ select * from public.tasks $$, '42501', null, 'anon cannot read tasks');
select throws_ok($$ select * from public.complete_task('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'anon cannot call game functions');
reset role;

select * from finish();
rollback;
