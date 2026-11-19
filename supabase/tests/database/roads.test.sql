-- Roads bought in strokes, and bulk demolition.
begin;
select plan(17);

insert into auth.users (id, email) values
  ('31111111-1111-1111-1111-111111111111', 'r1@example.com'),
  ('32222222-2222-2222-2222-222222222222', 'r2@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"31111111-1111-1111-1111-111111111111"}', true);

-- 100 welcome coins. Road tiles cost 5.
select results_eq($$ select built, cost, balance from public.buy_roads('[[0,0],[1,0],[2,0],[2,0]]') $$,
  $$ values (3, 15::bigint, 85::bigint) $$, 'a stroke buys each distinct tile once');
select results_eq($$ select built, cost, balance from public.buy_roads('[[2,0],[3,0]]') $$,
  $$ values (1, 5::bigint, 80::bigint) $$, 'tiles that are already road are skipped and free');
select results_eq($$ select built, cost from public.buy_roads('[[0,0]]') $$,
  $$ values (0, 0::bigint) $$, 'a stroke over existing road only costs nothing');
select is((select count(*)::int from public.placed_buildings where type_id = 'road'), 4, 'four road tiles placed');
select is((select reason from public.coin_ledger order by id desc limit 1), 'Built 1 road tile',
  'one ledger row per stroke');

select public.buy_building('cottage', 0, 1); -- 40 -> balance 40
select throws_ok($$ select * from public.buy_roads('[[0,1],[1,1]]') $$,
  '23P01', 'lot_taken', 'a stroke across a building is refused as a whole');
select is((select count(*)::int from public.placed_buildings where type_id = 'road' and y = 1), 0,
  'nothing from the refused stroke was built');
select throws_ok($$ select * from public.buy_roads('[[7,7],[8,7]]') $$,
  '23P01', 'lot_taken', 'a stroke leaving the city is refused');
select throws_ok($$ select * from public.buy_roads('[]') $$, '22023', 'no_tiles', 'empty stroke');
select throws_ok($$ select * from public.buy_roads('[["a",1]]') $$, '22023', 'bad_tiles', 'malformed tiles');
select throws_ok($$ select * from public.buy_roads((select jsonb_agg(jsonb_build_array(g % 8, g / 8)) from generate_series(0, 200) g)) $$,
  '22023', 'too_many_tiles', 'strokes are limited to 200 tiles');
select throws_ok($$ select * from public.buy_roads((select jsonb_agg(jsonb_build_array(g, 5)) from generate_series(0, 7) g) || (select jsonb_agg(jsonb_build_array(g, 6)) from generate_series(0, 7) g)) $$,
  '22023', 'not_enough_coins', 'cannot buy more road than you can afford (16 tiles = 80)');

-- Bulk demolition: 4 roads (2 back each) + cottage (20 back).
select results_eq($$ select sold, refund, balance from public.sell_buildings((select array_agg(id) from public.placed_buildings)) $$,
  $$ values (5, 28::bigint, 68::bigint) $$, 'bulk demolish refunds half of each');
select is((select reason from public.coin_ledger order by id desc limit 1), 'Demolished 5 items', 'one ledger row');
insert into public.tasks (title, area) values ('t', 'work');

-- Another user can't demolish or see these.
select public.buy_roads('[[4,4]]');
select set_config('request.jwt.claims', '{"sub":"32222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ select * from public.sell_buildings(array['00000000-0000-0000-0000-000000000000'::uuid]) $$,
  'P0002', 'building_not_found', 'nothing to demolish');
reset role;
select is((select count(*)::int from public.placed_buildings where user_id = '31111111-1111-1111-1111-111111111111'), 1,
  'the first user''s road is untouched');
set local role anon;
select throws_ok($$ select * from public.buy_roads('[[0,0]]') $$, '42501', null, 'anon cannot build roads');
reset role;

select * from finish();
rollback;
