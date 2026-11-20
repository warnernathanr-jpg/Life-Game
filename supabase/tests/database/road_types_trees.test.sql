-- Road types (dirt 1, 2-lane 5, 4-lane 10, upgrading by drawing over) and building over trees clears them.
begin;
select plan(13);

insert into auth.users (id, email) values ('a1111111-1111-1111-1111-111111111111', 'rt@example.com');
insert into public.coin_ledger (user_id, amount, kind, reason) values ('a1111111-1111-1111-1111-111111111111', 500, 'bonus', 'test coins');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111"}', true);

select results_eq($$ select cost::int from public.building_types where id in ('dirt_road', 'road', 'avenue') order by cost $$,
  $$ values (1), (5), (10) $$, 'dirt 1, 2-lane 5, 4-lane 10');
select results_eq($$ select built, cost, balance from public.buy_tiles('dirt_road', '[[0,0],[1,0],[2,0]]') $$,
  $$ values (3, 3::bigint, 597::bigint) $$, 'three dirt road tiles for 1 each');
select is((select reason from public.coin_ledger order by id desc limit 1), 'Built 3 dirt road tiles', 'ledger names dirt road');
select results_eq($$ select built, cost from public.buy_tiles('avenue', '[[1,0],[2,0],[3,0]]') $$,
  $$ values (3, 30::bigint) $$, 'drawing a 4-lane road over dirt upgrades it (2 replaced + 1 new, 10 each)');
select results_eq($$ select type_id, count(*)::int from public.placed_buildings group by type_id order by type_id $$,
  $$ values ('avenue'::text, 3), ('dirt_road', 1) $$, 'the replaced tiles are avenue now');
select results_eq($$ select built from public.buy_tiles('avenue', '[[1,0]]') $$, $$ values (0) $$, 'same type is skipped');

-- Trees: plant some, then build over them.
select results_eq($$ select built from public.buy_tiles('tree', '[[0,1],[1,1],[2,1],[0,2],[1,2],[5,5]]') $$, $$ values (6) $$, 'six trees');
select lives_ok($$ select * from public.buy_building('cottage', 0, 1) $$, 'a house can go on a tree tile');
select is((select count(*)::int from public.placed_buildings where type_id = 'tree' and x = 0 and y = 1), 0, 'the tree under the house is gone');
select results_eq($$ select built, cost from public.buy_tiles('road', '[[1,2],[2,2]]') $$, $$ values (2, 10::bigint) $$, 'a road over trees: 5 each');
select is((select count(*)::int from public.placed_buildings where type_id = 'tree' and y = 2 and x = 1), 0, 'the tree under the road is gone');
select lives_ok($$ select public.move_building((select id from public.placed_buildings where type_id = 'cottage'), 0, 2) $$, 'moving onto a tree works');
select is((select count(*)::int from public.placed_buildings where type_id = 'tree'), 3, 'only the untouched trees are left (1,1, 2,1 and 5,5)');

select * from finish();
rollback;
