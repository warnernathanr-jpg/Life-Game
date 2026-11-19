-- Bridges: a road drawn across water turns those tiles into bridges; demolishing gives the water back.
begin;
select plan(12);

insert into auth.users (id, email) values ('91111111-1111-1111-1111-111111111111', 'br@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91111111-1111-1111-1111-111111111111"}', true);

-- Water at (1,0) and (2,0): 12 coins, balance 88.
select results_eq($$ select built, cost, balance from public.buy_tiles('water', '[[1,0],[2,0]]') $$,
  $$ values (2, 12::bigint, 88::bigint) $$, 'dig two water tiles');
-- Road from (0,0) to (3,0): 2 road tiles (1 each) + 2 bridge tiles (10 each) = 22.
select results_eq($$ select built, cost, balance from public.buy_tiles('road', '[[0,0],[1,0],[2,0],[3,0]]') $$,
  $$ values (4, 22::bigint, 66::bigint) $$, 'road across water: 2 road + 2 bridge tiles');
select is((select reason from public.coin_ledger order by id desc limit 1), 'Built 2 road tiles and built 2 bridge tiles', 'ledger names both');
select is((select count(*)::int from public.placed_buildings where type_id = 'bridge'), 2, 'two bridge tiles');
select is((select count(*)::int from public.placed_buildings where type_id = 'water'), 0, 'water turned into bridges');
select results_eq($$ select built, cost from public.buy_tiles('road', '[[1,0],[2,0]]') $$,
  $$ values (0, 0::bigint) $$, 'bridges already count as road');
select results_eq($$ select built from public.buy_tiles('water', '[[1,0]]') $$, $$ values (0) $$, 'a bridge already has water');
select throws_ok($$ select * from public.buy_tiles('bridge', '[[5,5]]') $$, 'P0002', 'unknown_building', 'bridges only come from roads');
select throws_ok($$ select * from public.move_building((select id from public.placed_buildings where type_id = 'bridge' limit 1), 6, 6) $$,
  '22023', 'cant_move', 'bridges cannot be moved');
select results_eq(
  $$ select sold, refund from public.sell_buildings(array(select id from public.placed_buildings where x in (0, 1) and y = 0)) $$,
  $$ values (2, 0::bigint) $$, 'demolish a road and a bridge: road refunds 0, bridge goes back to water');
select is((select type_id from public.placed_buildings where x = 1 and y = 0), 'water', 'the bridge tile is water again');
select results_eq($$ select refund from public.sell_building((select id from public.placed_buildings where x = 2 and y = 0)) $$,
  $$ values (0::bigint) $$, 'single demolish of a bridge leaves water');

select * from finish();
rollback;
