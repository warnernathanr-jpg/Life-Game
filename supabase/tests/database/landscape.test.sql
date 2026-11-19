-- Trees and water: painted in strokes, no road needed, can't go under buildings.
begin;
select plan(9);

insert into auth.users (id, email) values ('81111111-1111-1111-1111-111111111111', 'ls@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"81111111-1111-1111-1111-111111111111"}', true);

select results_eq($$ select built, cost, balance from public.buy_tiles('tree', '[[0,0],[1,0],[2,0]]') $$,
  $$ values (3, 9::bigint, 91::bigint) $$, 'three trees for 3 coins each');
select is((select reason from public.coin_ledger order by id desc limit 1), 'Planted 3 trees', 'ledger says planted');
select results_eq($$ select built, cost from public.buy_tiles('water', '[[0,1],[1,1]]') $$,
  $$ values (2, 12::bigint) $$, 'two water tiles for 6 each');
select results_eq($$ select built from public.buy_tiles('tree', '[[0,0],[3,0]]') $$,
  $$ values (1) $$, 'existing trees are skipped');
select throws_ok($$ select * from public.buy_tiles('tree', '[[0,1]]') $$, '23P01', 'lot_taken', 'no trees on water');
select throws_ok($$ select * from public.buy_tiles('cottage', '[[5,5]]') $$, 'P0002', 'unknown_building', 'only roads and landscape tiles paint');
select throws_ok($$ select * from public.buy_building('cottage', 1, 1) $$, '23P01', 'lot_taken', 'buildings cannot go on water');
select results_eq($$ select built from public.buy_roads('[[5,5],[6,5]]') $$, $$ values (2) $$, 'roads still work through buy_roads');
select is((select reason from public.coin_ledger order by id desc limit 1), 'Built 2 road tiles', 'road ledger text unchanged');

select * from finish();
rollback;
