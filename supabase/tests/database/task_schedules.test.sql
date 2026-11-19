-- Task schedules: monthly / quarterly / yearly, certain weekdays, N times a week or month.
begin;
select plan(25);

insert into auth.users (id, email, raw_user_meta_data) values
  ('41111111-1111-1111-1111-111111111111', 's@example.com', '{"timezone":"UTC"}');

create temporary table t_today as select (now() at time zone 'UTC')::date as d;
grant select on t_today to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41111111-1111-1111-1111-111111111111"}', true);

-- Shape checks.
select throws_ok($$ insert into public.tasks (title, area, repeat) values ('x', 'work', 'days') $$,
  '23514', null, 'certain-days tasks need weekdays');
select throws_ok($$ insert into public.tasks (title, area, repeat, weekdays) values ('x', 'work', 'days', '{8}') $$,
  '23514', null, 'weekdays are 1 to 7');
select throws_ok($$ insert into public.tasks (title, area, repeat, weekdays) values ('x', 'work', 'daily', '{1}') $$,
  '23514', null, 'only certain-days tasks have weekdays');
select throws_ok($$ insert into public.tasks (title, area, repeat) values ('x', 'work', 'times_per_week') $$,
  '23514', null, 'N-times tasks need N');
select throws_ok($$ insert into public.tasks (title, area, repeat, times_per_period) values ('x', 'work', 'times_per_week', 8) $$,
  '23514', null, 'at most 7 times a week');
select lives_ok($$ insert into public.tasks (title, area, repeat, times_per_period) values ('x', 'work', 'times_per_month', 31) $$,
  'up to 31 times a month');
select throws_ok($$ insert into public.tasks (title, area, repeat, times_per_period) values ('x', 'work', 'daily', 3) $$,
  '23514', null, 'only N-times tasks have N');

insert into public.tasks (id, title, area, repeat, weekdays) values
  ('a0000000-0000-0000-0000-000000000001', 'Today task', 'health', 'days',
   array[extract(isodow from (select d from t_today))::smallint, extract(isodow from (select d from t_today))::smallint]),
  ('a0000000-0000-0000-0000-000000000002', 'Tomorrow task', 'health', 'days',
   array[(extract(isodow from (select d from t_today))::int % 7 + 1)::smallint]);
select is((select weekdays from public.tasks where id = 'a0000000-0000-0000-0000-000000000001'),
  array[extract(isodow from (select d from t_today))::smallint], 'weekdays are de-duplicated');

select lives_ok($$ select * from public.complete_task('a0000000-0000-0000-0000-000000000001') $$,
  'a certain-days task can be done on its day');
select throws_ok($$ select * from public.complete_task('a0000000-0000-0000-0000-000000000002') $$,
  '22023', 'not_scheduled_today', 'but not on other days');
select results_eq($$ select scheduled_today, done from public.my_tasks() where id = 'a0000000-0000-0000-0000-000000000002' $$,
  $$ values (false, false) $$, 'my_tasks says it isn''t on today');

-- Monthly / quarterly / yearly: once per period.
insert into public.tasks (id, title, area, repeat) values
  ('a0000000-0000-0000-0000-000000000003', 'Pay rent', 'personal', 'monthly'),
  ('a0000000-0000-0000-0000-000000000004', 'Change filters', 'personal', 'quarterly'),
  ('a0000000-0000-0000-0000-000000000005', 'Taxes', 'work', 'yearly');
select public.complete_task('a0000000-0000-0000-0000-000000000003');
select public.complete_task('a0000000-0000-0000-0000-000000000004');
select public.complete_task('a0000000-0000-0000-0000-000000000005');
select is((select period_start from public.task_completions where task_id = 'a0000000-0000-0000-0000-000000000003'),
  date_trunc('month', (select d from t_today))::date, 'monthly counts for the 1st of the month');
select is((select period_start from public.task_completions where task_id = 'a0000000-0000-0000-0000-000000000004'),
  date_trunc('quarter', (select d from t_today))::date, 'quarterly counts for the start of the quarter');
select is((select period_start from public.task_completions where task_id = 'a0000000-0000-0000-0000-000000000005'),
  date_trunc('year', (select d from t_today))::date, 'yearly counts for January 1');

-- A monthly task done earlier this month (simulated) can't be done again today.
insert into public.tasks (id, title, area, repeat) values ('a0000000-0000-0000-0000-000000000006', 'Budget', 'work', 'monthly');
reset role;
insert into public.task_completions (task_id, user_id, area, period_start, local_day, coins)
values ('a0000000-0000-0000-0000-000000000006', '41111111-1111-1111-1111-111111111111', 'work',
        date_trunc('month', (select d from t_today))::date, (select d from t_today) + 40, 25);
set local role authenticated;
select throws_ok($$ select * from public.complete_task('a0000000-0000-0000-0000-000000000006') $$,
  '23505', 'already_done', 'a monthly task done earlier this month is done for the month');
select results_eq($$ select done, done_today, period_count, period_target from public.my_tasks() where id = 'a0000000-0000-0000-0000-000000000006' $$,
  $$ values (true, false, 1, 1) $$, 'my_tasks: done this month, not today');

-- N times a week: one per day, up to N per week.
insert into public.tasks (id, title, area, difficulty, repeat, times_per_period) values
  ('a0000000-0000-0000-0000-000000000007', 'Gym', 'health', 'hard', 'times_per_week', 3);
select results_eq($$ select coins from public.complete_task('a0000000-0000-0000-0000-000000000007') $$,
  $$ values (50) $$, 'each time earns coins');
select throws_ok($$ select * from public.complete_task('a0000000-0000-0000-0000-000000000007') $$,
  '23505', 'already_done', 'at most once a day');
select results_eq($$ select done, done_today, period_count, period_target from public.my_tasks() where id = 'a0000000-0000-0000-0000-000000000007' $$,
  $$ values (false, true, 1, 3) $$, '1 of 3 this week');
-- Two more this week on other (simulated) days reach the target.
reset role;
insert into public.task_completions (task_id, user_id, area, period_start, local_day, coins)
select 'a0000000-0000-0000-0000-000000000007', '41111111-1111-1111-1111-111111111111', 'health',
       (select d from t_today) - (extract(isodow from (select d from t_today))::int - 1), (select d from t_today) + g * 100, 50
from generate_series(1, 2) g;
set local role authenticated;
select results_eq($$ select done, period_count from public.my_tasks() where id = 'a0000000-0000-0000-0000-000000000007' $$,
  $$ values (true, 3) $$, '3 of 3: done for the week');
select results_eq($$ select coins from public.undo_task('a0000000-0000-0000-0000-000000000007') $$,
  $$ values (50) $$, 'undo takes back the latest check-off this week');

-- N times a month.
insert into public.tasks (id, title, area, repeat, times_per_period) values
  ('a0000000-0000-0000-0000-000000000008', 'Call mom', 'personal', 'times_per_month', 2);
select public.complete_task('a0000000-0000-0000-0000-000000000008');
select is((select period_start from public.task_completions where task_id = 'a0000000-0000-0000-0000-000000000008'),
  date_trunc('month', (select d from t_today))::date, 'N times a month counts per calendar month');
select results_eq($$ select period_count, period_target, done from public.my_tasks() where id = 'a0000000-0000-0000-0000-000000000008' $$,
  $$ values (1, 2, false) $$, '1 of 2 this month');

-- Daily still once a day, one-off still once ever.
insert into public.tasks (id, title, area, repeat) values ('a0000000-0000-0000-0000-000000000009', 'Walk', 'health', 'daily');
select public.complete_task('a0000000-0000-0000-0000-000000000009');
select throws_ok($$ select * from public.complete_task('a0000000-0000-0000-0000-000000000009') $$,
  '23505', 'already_done', 'daily: once a day');
select results_eq($$ select done, scheduled_today from public.my_tasks() where id = 'a0000000-0000-0000-0000-000000000009' $$,
  $$ values (true, true) $$, 'daily shows done today');

select * from finish();
rollback;
