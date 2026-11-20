-- Picking a building's color scheme: free, own buildings only, not roads or landscaping.
begin;
select plan(6);

insert into auth.users (id, email) values
  ('c1111111-1111-1111-1111-111111111111', 'c1@example.com'),
  ('c2222222-2222-2222-2222-222222222222', 'c2@example.com');
insert into public.coin_ledger (user_id, amount, kind, reason) values ('c1111111-1111-1111-1111-111111111111', 500, 'bonus', 'test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-1111-1111-111111111111"}', true);
select public.buy_building('cottage', 0, 0);
select public.buy_tiles('road', '[[0,1]]'::jsonb);
create temporary table ids as select (select id from public.placed_buildings where type_id = 'cottage') as house, (select id from public.placed_buildings where type_id = 'road') as road;

select lives_ok(format('select public.set_building_color(%L, 42)', (select house from ids)), 'set a color');
select is((select color_seed from public.placed_buildings where id = (select house from ids)), 42::bigint, 'saved');
select throws_ok(format('select public.set_building_color(%L, 7)', (select road from ids)), 'P0002', 'building_not_found', 'not for roads');
select lives_ok(format('select public.set_building_color(%L, null)', (select house from ids)), 'back to automatic');
select throws_ok($$ update public.placed_buildings set color_seed = 1 $$, '42501', null, 'no direct writes');

select set_config('request.jwt.claims', '{"sub":"c2222222-2222-2222-2222-222222222222"}', true);
select throws_ok(format('select public.set_building_color(%L, 5)', (select house from ids)), 'P0002', 'building_not_found', 'not someone else''s');

select * from finish();
rollback;
