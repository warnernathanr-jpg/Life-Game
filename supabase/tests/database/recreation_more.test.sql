-- Soccer Field, Beach (must touch water) and Amusement Park.
begin;
select plan(7);
update public.building_types set unlock_area = null, unlock_points = null;
insert into auth.users (id, email) values ('d0111111-1111-1111-1111-111111111111', 'rec@example.com');
insert into public.coin_ledger (user_id, amount, kind, reason) values ('d0111111-1111-1111-1111-111111111111', 10000, 'bonus', 'test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d0111111-1111-1111-1111-111111111111"}', true);
select is((select count(*)::int from public.building_types where id in ('soccer_field', 'beach', 'amusement_park')), 3, 'three new buildings');
select is((select row(w, d)::text from public.building_types where id = 'beach'), '(3,1)', 'the beach is 3x1');
select public.buy_tiles('water', '[[0,0],[1,0],[2,0]]');
select lives_ok($$ select public.buy_building('beach', 0, 1) $$, 'a beach beside the water');
set constraints all immediate;
set constraints all deferred;
select throws_ok($$ select public.buy_building('beach', 4, 5); set constraints all immediate $$, '22023', 'needs_water', 'not away from the water');
set constraints all deferred;
select throws_ok($$ select public.move_building((select id from public.placed_buildings where type_id = 'beach'), 4, 5, false); set constraints all immediate $$,
  '22023', 'needs_water', 'and it can''t be moved away from it');
set constraints all deferred;
select lives_ok($$ select public.buy_building('soccer_field', 0, 3) $$, 'a soccer field');
select lives_ok($$ select public.buy_building('amusement_park', 4, 0) $$, 'an amusement park');
select * from finish();
rollback;
