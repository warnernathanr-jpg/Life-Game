-- Times of day: one check-off per listed time each day; undo per time; tasks without times unchanged.
begin;
select plan(12);

insert into auth.users (id, email) values ('f1111111-1111-1111-1111-111111111111', 'tod@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1111111-1111-1111-1111-111111111111"}', true);

insert into public.tasks (id, title, area, difficulty, repeat, times_of_day)
values ('f2000000-0000-0000-0000-000000000001', 'Eat a healthy meal', 'health', 'easy', 'daily', array['morning', 'afternoon', 'night']);
insert into public.tasks (id, title, area, difficulty, repeat) values ('f2000000-0000-0000-0000-000000000002', 'Walk', 'health', 'easy', 'daily');

select throws_ok($$ insert into public.tasks (title, area, repeat, times_of_day) values ('X', 'work', 'weekly', array['morning']) $$, '23514', null, 'times of day only for daily / certain-days tasks');
select throws_ok($$ select * from public.complete_task('f2000000-0000-0000-0000-000000000001') $$, '22023', 'pick_a_time', 'a time must be given');
select results_eq($$ select coins from public.complete_task('f2000000-0000-0000-0000-000000000001', 'morning') $$, $$ values (10) $$, 'morning pays');
select throws_ok($$ select * from public.complete_task('f2000000-0000-0000-0000-000000000001', 'morning') $$, '23505', 'already_done', 'morning only once');
select results_eq($$ select coins from public.complete_task('f2000000-0000-0000-0000-000000000001', 'night') $$, $$ values (10) $$, 'night pays too');
select is((select slots_done from public.my_tasks() where title = 'Eat a healthy meal'), array['morning', 'night'], 'my_tasks lists the times done');
select is((select (done, period_count, period_target) from public.my_tasks() where title = 'Eat a healthy meal'), (false, 2, 3), '2 of 3, not done yet');
select public.complete_task('f2000000-0000-0000-0000-000000000001', 'afternoon');
select is((select done from public.my_tasks() where title = 'Eat a healthy meal'), true, 'all three: done for today');
select results_eq($$ select coins from public.undo_task('f2000000-0000-0000-0000-000000000001', 'night') $$, $$ values (10) $$, 'undo one time (10 coins back off)');
select is((select slots_done from public.my_tasks() where title = 'Eat a healthy meal'), array['morning', 'afternoon'], 'night undone');

-- Without times: once a day as before.
select results_eq($$ select coins from public.complete_task('f2000000-0000-0000-0000-000000000002') $$, $$ values (10) $$, 'plain task still works');
select throws_ok($$ select * from public.complete_task('f2000000-0000-0000-0000-000000000002') $$, '23505', 'already_done', 'once a day');

select * from finish();
rollback;
