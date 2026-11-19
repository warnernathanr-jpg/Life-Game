-- Bigger parks, 2x2 industry (with the migration's keep/shift/refund rule), saved facing.
begin;
select plan(12);

select results_eq($$ select id, size from public.building_types where id in ('park', 'court', 'garden', 'central_park', 'workshop', 'warehouse') order by sort_order $$,
  $$ values ('workshop', 2), ('warehouse', 2), ('park', 1), ('court', 2), ('garden', 3), ('central_park', 4) $$,
  'industry is 2x2; parks come in 1x1 to 4x4');
select is((select name from public.building_types where id = 'park'), 'Neighborhood Park', 'the 1x1 park is the Neighborhood Park');

insert into auth.users (id, email) values
  ('71111111-1111-1111-1111-111111111111', 'pk@example.com'),
  ('72222222-2222-2222-2222-222222222222', 'pk2@example.com');
-- Plenty of coins and health points for the test.
insert into public.coin_ledger (user_id, amount, kind, reason) values ('71111111-1111-1111-1111-111111111111', 5000, 'bonus', 'test');
insert into public.tasks (id, user_id, title, area, difficulty) values
  ('c1000000-0000-0000-0000-000000000001', '71111111-1111-1111-1111-111111111111', 't', 'health', 'epic');
insert into public.task_completions (task_id, user_id, area, period_start, local_day, coins, points)
values ('c1000000-0000-0000-0000-000000000001', '71111111-1111-1111-1111-111111111111', 'health', current_date - 1, current_date - 1, 0, 600);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"71111111-1111-1111-1111-111111111111"}', true);

select lives_ok($$ select * from public.buy_building('central_park', 0, 0) $$, 'a 4x4 park fits at the corner of an 8x8 city');
select throws_ok($$ select * from public.buy_building('garden', 2, 2) $$, '23P01', 'lot_taken', 'parks cannot overlap');
select throws_ok($$ select * from public.buy_building('garden', 6, 0) $$, '23P01', 'lot_taken', 'a 3x3 must fit inside the city');
select lives_ok($$ select * from public.buy_building('garden', 4, 0) $$, 'garden on a free 3x3 lot');
select lives_ok($$ select * from public.buy_building('workshop', 4, 4) $$, 'workshop on a free 2x2 lot');
select throws_ok($$ select * from public.buy_building('cottage', 5, 5) $$, '23P01', 'lot_taken', 'the 2x2 workshop covers (5,5)');

-- Facing.
select lives_ok(format('select public.set_building_facing(%L, %L)', (select id from public.placed_buildings where type_id = 'workshop'), 'east'),
  'turn a building to face east');
select is((select facing from public.placed_buildings where type_id = 'workshop'), 'east', 'facing saved');
select throws_ok(format('select public.set_building_facing(%L, %L)', (select id from public.placed_buildings where type_id = 'workshop'), 'up'),
  '22023', 'bad_facing', 'only the four sides');
select set_config('request.jwt.claims', '{"sub":"72222222-2222-2222-2222-222222222222"}', true);
select throws_ok(format('select public.set_building_facing(%L, %L)', (select id from public.placed_buildings where type_id = 'workshop' limit 1), 'north'),
  'P0002', 'building_not_found', 'cannot turn someone else''s building');

select * from finish();
rollback;
