-- Admin functions only answer admins.
begin;
select plan(6);
insert into auth.users (id, email) values ('ad111111-1111-1111-1111-111111111111', 'boss@example.com'), ('ad222222-2222-2222-2222-222222222222', 'player@example.com');
insert into private.admins (user_id) values ('ad111111-1111-1111-1111-111111111111');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ad222222-2222-2222-2222-222222222222"}', true);
select is(public.am_admin(), false, 'a player is not an admin');
select throws_ok($$ select * from public.admin_players() $$, '42501', 'not_admin', 'players can''t list players');
select throws_ok($$ select * from public.admin_signups(7) $$, '42501', 'not_admin', 'or see sign-ups');
select set_config('request.jwt.claims', '{"sub":"ad111111-1111-1111-1111-111111111111"}', true);
select is(public.am_admin(), true, 'the admin is');
select ok((select count(*) from public.admin_players()) >= 2, 'the admin sees players');
select is((select count(*)::int from public.admin_signups(7)), 7, 'one row per day');
select * from finish();
rollback;
