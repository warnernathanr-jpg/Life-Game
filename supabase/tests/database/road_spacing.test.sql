-- Roads can't run side by side (no 2x2 block of road tiles); crossings and corners are fine.
begin;
select plan(5);

insert into auth.users (id, email) values ('c1111111-1111-1111-1111-111111111111', 'sp@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1111111-1111-1111-1111-111111111111"}', true);

select lives_ok($$ select * from public.buy_tiles('dirt_road', '[[0,3],[1,3],[2,3],[3,3],[4,3]]') $$, 'a straight road');
select throws_ok($$ select * from public.buy_tiles('dirt_road', '[[1,4],[2,4]]') $$, '23P01', 'roads_side_by_side', 'a parallel road right beside it is refused');
select lives_ok($$ select * from public.buy_tiles('dirt_road', '[[2,0],[2,1],[2,2],[2,4],[2,5]]') $$, 'a crossing is fine');
select lives_ok($$ select * from public.buy_tiles('dirt_road', '[[0,5],[1,5]]') $$, 'a parallel road one tile away is fine');
select throws_ok($$ select * from public.buy_tiles('dirt_road', '[[3,4]]') $$, '23P01', 'roads_side_by_side', 'a single tile filling a 2x2 corner is refused');

select * from finish();
rollback;
