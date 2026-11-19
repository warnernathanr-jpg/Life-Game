-- Home upgrades and no daily coin caps.
begin;
select plan(13);

insert into auth.users (id, email) values ('91111111-1111-1111-1111-111111111111', 'up@example.com');
insert into public.coin_ledger (user_id, amount, kind, reason) values ('91111111-1111-1111-1111-111111111111', 1000, 'bonus', 'test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91111111-1111-1111-1111-111111111111"}', true);

-- No daily cap: 10 hard tasks pay 500 in one day.
insert into public.tasks (id, title, area, difficulty, repeat)
select ('d1000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'H' || g, 'personal', 'hard', 'once' from generate_series(1, 10) g;
select is((select sum(coins)::int from (select (public.complete_task(('d1000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid)).coins from generate_series(1, 10) g) x),
  500, 'no daily cap on task coins');
select is((select personal from public.my_progress()), 500::bigint, '500 personal points (unlocks the home ladder up to apartments)');

-- Starter House → Suburban House → Townhouse: pay the difference each time (70 - 40, then 90 - 70).
select results_eq($$ select balance from public.buy_building('cottage', 0, 0) $$, $$ values (1600::bigint - 40) $$, 'starter house bought');
create temporary table h as select id from public.placed_buildings where type_id = 'cottage';
select results_eq(format('select cost from public.upgrade_building(%L)', (select id from h)), $$ values (30::bigint) $$, 'starter → suburban costs the difference');
select is((select type_id from public.placed_buildings where id = (select id from h)), 'suburban', 'now a suburban house');
select is((select reason from public.coin_ledger order by id desc limit 1), 'Upgraded: Starter House → Suburban House', 'ledger row');
select results_eq(format('select cost from public.upgrade_building(%L)', (select id from h)), $$ values (20::bigint) $$, 'suburban → townhouse costs 90 - 70');

-- Townhouse → Apartment Building (2x2): needs room.
select public.buy_building('cottage', 1, 0);
select public.buy_building('cottage', 0, 1);
select throws_ok(format('select * from public.upgrade_building(%L)', (select id from h)), '23P01', 'no_room', 'apartments need a free 2x2');
select public.sell_buildings((select array_agg(id) from public.placed_buildings where id <> (select id from h)));
select results_eq(format('select cost from public.upgrade_building(%L)', (select id from h)), $$ values (230::bigint) $$, 'townhouse → apartments costs 320 - 90');
select results_eq($$ select type_id, x, y, price_paid from public.placed_buildings where id = (select id from h) $$,
  $$ values ('apartments'::text, 0, 0, 320::bigint) $$, 'apartments on the 2x2 at the old tile');
select throws_ok(format('select * from public.upgrade_building(%L)', (select id from h)), '42501', 'locked', 'high-rise needs 600 personal points');

-- An upgrade into a lot shifted left/up when needed.
select public.buy_building('cottage', 7, 7);
create temporary table c as select id from public.placed_buildings where type_id = 'cottage' and x = 7;
select public.upgrade_building((select id from c));
select public.upgrade_building((select id from c));
select results_eq(format('select x, y from public.placed_buildings where id = %L', (select id from c)), $$ values (7, 7) $$, 'townhouse stays at its tile');
select public.upgrade_building((select id from c));
select results_eq(format('select x, y from public.placed_buildings where id = %L', (select id from c)), $$ values (6, 6) $$, 'apartments at the corner shift up-left to fit');

select * from finish();
rollback;
