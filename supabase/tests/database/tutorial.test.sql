-- Getting started (task, check-off, road, home with residents, its colors, shop): steps follow what the player did; the 100-coin reward only once every step is done, and only once.
begin;
select plan(12);
insert into auth.users (id, email) values ('cc111111-1111-1111-1111-111111111111', 'tut@example.com');
-- (the test builds a second, out-of-the-way cottage, so it needs a little more than a new player's coins)
insert into public.coin_ledger (user_id, amount, kind, reason) values ('cc111111-1111-1111-1111-111111111111', 50, 'bonus', 'test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cc111111-1111-1111-1111-111111111111"}', true);
select is((select array[has_task, has_checkoff, has_road, has_home, has_resident, has_color, has_shop, hidden, claimed] from public.my_tutorial()),
  array[false, false, false, false, false, false, false, false, false], 'a new player starts at step one');
select throws_ok($$ select * from public.claim_reward('tutorial') $$, '22023', 'tutorial_not_done', 'no reward before the steps are done');
insert into public.tasks (title, area, difficulty, repeat) values ('Walk', 'health', 'easy', 'daily');
select public.complete_task((select id from public.tasks where title = 'Walk'));
select public.buy_tiles('dirt_road', '[[0,1],[1,1],[2,1]]');
select is((select array[has_task, has_checkoff, has_road, has_home] from public.my_tutorial()), array[true, true, true, false], 'task, check-off and road ticked');
select public.buy_building('small_cottage', 5, 5);
select is((select array[has_home, has_resident] from public.my_tutorial()), array[true, false], 'a home away from the road has nobody yet');
select public.buy_building('small_cottage', 1, 0);
select is((select has_resident from public.my_tutorial()), true, 'a home beside the road: residents move in');
select throws_ok($$ select * from public.claim_reward('tutorial') $$, '22023', 'tutorial_not_done', 'still needs a shop');
select public.buy_building('corner_shop', 2, 2);
select is((select has_shop from public.my_tutorial()), true, 'a shop beside the road');
select throws_ok($$ select * from public.claim_reward('tutorial') $$, '22023', 'tutorial_not_done', 'still needs a color');
select public.set_building_color((select id from public.placed_buildings where type_id = 'small_cottage' and x = 1), 4);
select is((select has_color from public.my_tutorial()), true, 'picked a color for the home');
select results_eq($$ select coins from public.claim_reward('tutorial') $$, $$ values (100) $$, 'finishing pays 100');
select results_eq($$ select coins from public.claim_reward('tutorial') $$, $$ values (0) $$, 'only once');
update public.profiles set tutorial_hidden = true where id = 'cc111111-1111-1111-1111-111111111111';
select is((select hidden from public.my_tutorial()), true, 'the player can hide it');
select * from finish();
rollback;
