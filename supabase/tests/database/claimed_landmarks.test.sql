-- A claimed milestone keeps its landmark unlocked even when the population is below it; unclaimed ones still need the people.
begin;
select plan(3);
insert into auth.users (id, email) values ('cb111111-1111-1111-1111-111111111111', 'cl1@example.com');
insert into public.city_milestones (user_id, population, coins) values ('cb111111-1111-1111-1111-111111111111', 100, 0);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cb111111-1111-1111-1111-111111111111"}', true);
select is(public.my_city_population(), 0, 'nobody lives here');
select lives_ok($$ select * from public.place_landmark('fountain', 0, 0) $$, 'the claimed 100-people landmark can still be placed');
select throws_ok($$ select * from public.place_landmark('clock_tower', 4, 4) $$, '22023', 'not_enough_people', 'an unclaimed one still needs the people');
select * from finish();
rollback;
