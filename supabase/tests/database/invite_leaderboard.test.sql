-- Sharing the invite earns a badge; the leaderboard lists the most populous cities and those can be visited.
begin;
select plan(8);
insert into auth.users (id, email) values
  ('cf111111-1111-1111-1111-111111111111', 'lb1@example.com'),
  ('cf222222-2222-2222-2222-222222222222', 'lb2@example.com'),
  ('cf333333-3333-3333-3333-333333333333', 'lb3@example.com');
set local role authenticated;
-- Player 1 builds a little town (a road and a home beside it).
select set_config('request.jwt.claims', '{"sub":"cf111111-1111-1111-1111-111111111111"}', true);
select public.buy_tiles('dirt_road', '[[0,1],[1,1]]');
select public.buy_building('small_cottage', 0, 0);
select public.record_invite_shared();
select public.record_invite_shared();
select ok(exists (select 1 from public.my_achievement_coins() where coins >= 50), 'sharing the invite earns coins');
select ok(exists (select 1 from public.achievements where id = 'invite_shared'), 'the Spread the word badge');
select is((select coins from public.claim_achievement('invite_shared')), 50, 'worth 50');
-- Player 2 has nothing built and isn't anyone's friend.
select set_config('request.jwt.claims', '{"sub":"cf222222-2222-2222-2222-222222222222"}', true);
select is((select count(*)::int from public.leaderboard()), 1, 'only cities with people are listed');
select is((select row(rank, city_name is not null, is_me)::text from public.leaderboard()), '(1,t,f)', 'player 1 is first, not me');
select ok((public.friend_city('cf111111-1111-1111-1111-111111111111') ->> 'city_size') is not null, 'a leaderboard city can be visited');
select throws_ok($$select public.friend_city('cf333333-3333-3333-3333-333333333333')$$, '42501', 'not_a_friend', 'others still need to be friends');
reset role;
select is(private.achievement_reward('first_friend'), 100, 'becoming friends pays 100');
select * from finish();
rollback;
