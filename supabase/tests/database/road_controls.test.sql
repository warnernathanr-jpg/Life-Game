-- Stop signs and traffic lights: only on crossings, paid, half back, gone with the road, private.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('e1111111-1111-1111-1111-111111111111', 'rc1@example.com'),
  ('e2222222-2222-2222-2222-222222222222', 'rc2@example.com');
insert into public.coin_ledger (user_id, amount, kind, reason) values ('e1111111-1111-1111-1111-111111111111', 500, 'bonus', 'test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1111111-1111-1111-1111-111111111111"}', true);
-- A plus-shaped crossing at (2,2) and a straight bit at (2,0).
select public.buy_tiles('road', '[[1,2],[2,2],[3,2],[2,1],[2,3],[2,0]]'::jsonb);
create temporary table b0 as select (select sum(amount) from public.coin_ledger) as v;

select results_eq($$ select cost from public.place_road_control(2, 2, 'stop') $$, $$ values (10) $$, 'a stop sign costs 10');
select is((select sum(amount) from public.coin_ledger), (select v - 10 from b0), 'paid');
select throws_ok($$ select * from public.place_road_control(2, 2, 'stop') $$, '23505', 'already_there', 'not twice');
select results_eq($$ select cost from public.place_road_control(2, 2, 'light') $$, $$ values (40) $$, 'upgrade to a light for 40');
select is((select kind from public.road_controls where x = 2 and y = 2), 'light', 'now a light');
select throws_ok($$ select * from public.place_road_control(2, 0, 'stop') $$, '22023', 'not_a_crossing', 'only where 3+ roads meet');
select throws_ok($$ select * from public.place_road_control(5, 5, 'stop') $$, '22023', 'not_a_crossing', 'only on a road');
select throws_ok($$ insert into public.road_controls (x, y, kind, price_paid) values (1, 2, 'stop', 0) $$, '42501', null, 'no direct writes');
select results_eq($$ select refund from public.remove_road_control(2, 2) $$, $$ values (20) $$, 'half back when removed');

select public.place_road_control(2, 2, 'stop');
select public.sell_buildings(array(select id from public.placed_buildings where x = 2 and y = 2));
select is((select count(*)::int from public.road_controls), 0, 'gone with the road');

select set_config('request.jwt.claims', '{"sub":"e2222222-2222-2222-2222-222222222222"}', true);
select public.buy_tiles('road', '[[1,2],[2,2],[3,2],[2,1]]'::jsonb);
select is((select count(*)::int from public.road_controls), 0, 'others see none');

select * from finish();
rollback;
