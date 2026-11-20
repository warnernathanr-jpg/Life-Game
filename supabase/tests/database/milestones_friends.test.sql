-- Land at ×1.35, population milestones and landmarks, city codes and friends.
begin;
select plan(18);

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'm1@example.com'),
  ('a2222222-2222-2222-2222-222222222222', 'm2@example.com'),
  ('a3333333-3333-3333-3333-333333333333', 'm3@example.com');
insert into public.coin_ledger (user_id, amount, kind, reason) values ('a1111111-1111-1111-1111-111111111111', 5000, 'bonus', 'test');

select is(array[public.land_price(0), public.land_price(1), public.land_price(10)], array[300, 300, 300]::bigint[], 'land: always 300');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111"}', true);

-- 13 starter houses (4 people each) on a road = 52 people.
select public.buy_tiles('road', '[[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1]]'::jsonb);
select public.buy_building('cottage', x, 0) from generate_series(0, 7) x;
select public.buy_building('cottage', x, 2) from generate_series(0, 4) x;
select is(public.my_city_population(), 52, 'homes beside a road count');
select throws_ok($$ select * from public.claim_city_milestone(100) $$, '22023', 'not_enough_people', 'not yet 100 people');
select results_eq($$ select coins from public.claim_city_milestone(50) $$, $$ values (100) $$, '50 people pays 100');
select throws_ok($$ select * from public.claim_city_milestone(50) $$, '23505', 'already_done', 'only once');
select throws_ok($$ select * from public.claim_city_milestone(77) $$, '22023', 'unknown_milestone', 'only the listed milestones');

-- Landmarks: free, one each, never from the shop.
select throws_ok($$ select * from public.buy_building('welcome_arch', 6, 2) $$, '42501', 'locked', 'landmarks are not for sale');
select lives_ok($$ select * from public.place_landmark('welcome_arch', 6, 2) $$, 'place the 50-people landmark');
select is((select price_paid from public.placed_buildings where type_id = 'welcome_arch'), 0::bigint, 'for free');
select throws_ok($$ select * from public.place_landmark('welcome_arch', 7, 2) $$, '23505', 'already_there', 'one of each');
select throws_ok($$ select * from public.place_landmark('fountain', 7, 2) $$, '22023', 'not_enough_people', 'the 100 landmark needs 100 people');
select throws_ok($$ insert into public.city_milestones (population, coins) values (100, 200) $$, '42501', null, 'no direct writes');

-- Friends.
create temporary table codes as select (select city_code from public.profiles where id = 'a1111111-1111-1111-1111-111111111111') as mine;
select is((select length(mine) from codes), 6, 'every city has a 6-character code');
-- (Player 1 is on the leaderboard, so anyone may visit it; player 2 has no people yet, so only friends may.)
select throws_ok($$ select * from public.friend_city('a2222222-2222-2222-2222-222222222222') $$, '42501', 'not_a_friend', 'not visible before adding');
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222"}', true);
select results_eq(format('select friend_id from public.add_friend(%L)', lower((select mine from codes))), $$ values ('a1111111-1111-1111-1111-111111111111'::uuid) $$, 'add a friend by code (any case)');
-- That sends a request; once the other player accepts, both can visit.
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111"}', true);
select public.accept_friend_request('a2222222-2222-2222-2222-222222222222');
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-2222-2222-222222222222"}', true);
select is((select jsonb_array_length(public.friend_city('a1111111-1111-1111-1111-111111111111') -> 'placed')), 22, 'see their city');
select is((select population from public.my_friends()), 52, 'friends list with population');
select throws_ok($$ select * from public.add_friend('ZZZZZZ') $$, 'P0002', 'unknown_city_code', 'unknown code');

select * from finish();
rollback;
