-- Friend requests: adding sends a request, accepting makes friends both ways, declining clears it.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('fa111111-1111-1111-1111-111111111111', 'fr1@example.com'),
  ('fa222222-2222-2222-2222-222222222222', 'fr2@example.com'),
  ('fa333333-3333-3333-3333-333333333333', 'fr3@example.com');
update public.profiles set city_code = 'AAAAA1' where id = 'fa111111-1111-1111-1111-111111111111';
update public.profiles set city_code = 'BBBBB2', display_name = 'Bea' where id = 'fa222222-2222-2222-2222-222222222222';
update public.profiles set city_code = 'CCCCC3' where id = 'fa333333-3333-3333-3333-333333333333';
set local role authenticated;

-- 1 adds 2: a request, not a friendship yet.
select set_config('request.jwt.claims', '{"sub":"fa111111-1111-1111-1111-111111111111"}', true);
select is((select status from public.add_friend('BBBBB2')), 'requested', 'adding sends a request');
select is((select count(*)::int from public.my_friends()), 0, 'not friends yet');
select is((select direction from public.my_friend_requests()), 'out', 'the sender sees it as sent');
select throws_ok($$ select public.friend_city('fa222222-2222-2222-2222-222222222222') $$, '42501', 'not_a_friend', 'no visiting before they accept');

-- 2 sees it and accepts.
select set_config('request.jwt.claims', '{"sub":"fa222222-2222-2222-2222-222222222222"}', true);
select is((select direction from public.my_friend_requests()), 'in', 'the other person sees a request');
select throws_ok($$ select public.accept_friend_request('fa333333-3333-3333-3333-333333333333') $$, 'P0002', 'no_request', 'cannot accept a request nobody sent');
select lives_ok($$ select public.accept_friend_request('fa111111-1111-1111-1111-111111111111') $$, 'accept');
select is((select count(*)::int from public.my_friends()), 1, 'friends now');
select is((select count(*)::int from public.my_friend_requests()), 0, 'request gone');

-- 3 asks 2, 2 declines.
select set_config('request.jwt.claims', '{"sub":"fa333333-3333-3333-3333-333333333333"}', true);
select public.add_friend('BBBBB2');
select set_config('request.jwt.claims', '{"sub":"fa222222-2222-2222-2222-222222222222"}', true);
select public.drop_friend_request('fa333333-3333-3333-3333-333333333333');
select is((select count(*)::int from public.my_friend_requests()), 0, 'declined');
-- 1 can visit 2 (friends both ways).
select set_config('request.jwt.claims', '{"sub":"fa111111-1111-1111-1111-111111111111"}', true);
select is((public.friend_city('fa222222-2222-2222-2222-222222222222') ->> 'city_name') is not null, true, 'both can visit after accepting');

select * from finish();
rollback;
