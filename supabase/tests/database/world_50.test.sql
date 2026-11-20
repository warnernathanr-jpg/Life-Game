-- A 50×50 world: land grows a ring on every side, so the city shifts one tile to stay centred.
begin;
select plan(14);

insert into auth.users (id, email) values ('f5111111-1111-1111-1111-111111111111', 'w50@example.com');
insert into public.coin_ledger (user_id, amount, kind, reason) values ('f5111111-1111-1111-1111-111111111111', 5000, 'bonus', 'test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f5111111-1111-1111-1111-111111111111"}', true);

select is(public.max_city_size(), 50, 'the largest city is 50×50');
-- A crossing at (2,2) with a stop sign, plus a house beside it.
select public.buy_tiles('road', '[[1,2],[2,2],[3,2],[2,1],[2,3]]'::jsonb);
select public.place_road_control(2, 2, 'stop');
select public.buy_building('small_cottage', 3, 3);
select results_eq($$ select city_size from public.buy_land() $$, $$ values (10) $$, 'land grows 8 -> 10');
select is((select array[x, y] from public.placed_buildings b where b.type_id = 'small_cottage'), array[4, 4], 'buildings move one tile right and down');
select is((select count(*)::int from public.placed_buildings b where b.type_id = 'road_2' or b.type_id = 'road'), 5, 'roads kept');
select is((select array[x, y] from public.placed_buildings b where (b.type_id = 'road_2' or b.type_id = 'road') order by x, y limit 1), array[2, 3], 'roads move too');
select is((select array[x, y] from public.road_controls), array[3, 3], 'the stop sign moves with its crossing');

select throws_ok($$ select * from public.buy_building('monument', 0, 0) $$, '42501', 'locked', 'the monument is no longer for sale');
select is((select milestone_population from public.building_types where id = 'monument'), 500, 'it is the 500-people landmark');
select is(public.city_milestone_bonus(5000), 6000, 'a 5,000-people milestone pays 6,000');
-- Slide the city: everything moves together, but never past the edge of the land (now 10×10; the road reaches x = 1..3).
select lives_ok($$ select public.shift_city(-1, 0) $$, 'slide the city left');
select is((select array[x, y] from public.placed_buildings b where b.type_id = 'small_cottage'), array[3, 4], 'buildings moved left');
select is((select array[x, y] from public.road_controls), array[2, 3], 'the stop sign moved too');
select lives_ok($$ select public.shift_city(-1, 0) $$, 'once more, to the edge');
select throws_ok($$ select public.shift_city(-1, 0) $$, '22023', 'off_the_edge', 'not past the edge');
select * from finish();
rollback;
