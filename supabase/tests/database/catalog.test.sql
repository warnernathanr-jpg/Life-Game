-- The full catalog: rectangular footprints that can be turned, overlap with turned buildings, and the new buildings.
begin;
select plan(12);

insert into auth.users (id, email) values ('b1111111-1111-1111-1111-111111111111', 'cat@example.com');
insert into public.coin_ledger (user_id, amount, kind, reason) values ('b1111111-1111-1111-1111-111111111111', 5000, 'bonus', 'test');
-- Footprints, not unlocks, are tested here: unlock everything (rolled back at the end).
update public.building_types set unlock_area = null, unlock_points = null;
update public.profiles set city_size = 12 where id = 'b1111111-1111-1111-1111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1111111-1111-1111-1111-111111111111"}', true);

select ok((select count(*) from public.building_types where category not in ('road', 'landscape')) >= 45, 'about 45 buildings');
select results_eq($$ select w, d from public.building_types where id in ('duplex', 'museum', 'golf', 'stadium') order by id $$,
  $$ values (2, 1), (4, 3), (3, 1), (4, 4) $$, 'rectangular and square footprints');

-- A duplex (2x1) laid lengthwise covers (0,0)-(1,0); turned it covers (3,0)-(3,1).
select lives_ok($$ select * from public.buy_building('duplex', 0, 0) $$, 'duplex lengthwise');
select throws_ok($$ select * from public.buy_building('small_cottage', 1, 0) $$, '23P01', 'lot_taken', 'its second tile is taken');
select lives_ok($$ select * from public.buy_building('small_cottage', 0, 1) $$, 'the tile below is free');
select lives_ok($$ select * from public.buy_building('duplex', 3, 0, true) $$, 'duplex turned');
select is((select rotated from public.placed_buildings where x = 3 and y = 0), true, 'saved as turned');
select throws_ok($$ select * from public.buy_building('small_cottage', 3, 1) $$, '23P01', 'lot_taken', 'a turned duplex takes the tile below');
select lives_ok($$ select * from public.buy_building('small_cottage', 4, 0) $$, 'but not the one beside it');

-- Squares can't be turned (the flag is ignored); a 3x1 museum turned is 1 wide and 3 deep; the city edge counts.
select lives_ok($$ select * from public.buy_building('small_cottage', 6, 6, true) $$, 'square ignores turning');
select throws_ok($$ select * from public.buy_building('museum', 11, 10, true) $$, '23P01', 'lot_taken', 'turned museum would cross the bottom edge');

-- Moving can turn a building.
select lives_ok(format('select public.move_building(%L, 8, 0, true)', (select id from public.placed_buildings where type_id = 'duplex' and x = 0)), 'move and turn');

select * from finish();
rollback;
