-- Phase A: four life areas, Epic tasks, area points, unlocks by points, habit milestones, focus areas.
begin;
select plan(20);

insert into auth.users (id, email, raw_user_meta_data) values
  ('61111111-1111-1111-1111-111111111111', 'p@example.com', '{"timezone":"UTC"}');
create temporary table t_today as select (now() at time zone 'UTC')::date as d;
grant select on t_today to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"61111111-1111-1111-1111-111111111111"}', true);

-- Areas.
select throws_ok($$ insert into public.tasks (title, area) values ('x', 'social') $$,
  '23514', null, 'social is merged into personal and can no longer be used');
select is((select count(*)::int from public.building_types where unlock_area = 'social'), 0, 'no building unlocks with social');
select is((select unlock_points from public.building_types where id = 'park'), 75, 'park unlocks at 75 health points');
select results_eq($$ select name from public.building_types where id in ('cottage', 'house', 'apartments') order by sort_order $$,
  $$ values ('Starter House'), ('Townhouse'), ('Apartment Building') $$, 'homes follow the density ladder');

-- Epic.
insert into public.tasks (id, title, area, difficulty) values ('b0000000-0000-0000-0000-000000000001', 'Ship the app', 'work', 'epic');
select results_eq($$ select coins from public.complete_task('b0000000-0000-0000-0000-000000000001') $$,
  $$ values (100) $$, 'epic tasks pay 100 coins');
select is((select work from public.my_progress()), 100::bigint, 'and 100 work points');

-- Unlock by points: park needs 75 health points.
insert into public.tasks (id, title, area, difficulty) values
  ('b0000000-0000-0000-0000-000000000002', 'Run', 'health', 'medium'),
  ('b0000000-0000-0000-0000-000000000003', 'Swim', 'health', 'medium'),
  ('b0000000-0000-0000-0000-000000000004', 'Bike', 'health', 'medium');
select public.complete_task('b0000000-0000-0000-0000-000000000002');
select public.complete_task('b0000000-0000-0000-0000-000000000003');
select throws_ok($$ select * from public.buy_building('park', 0, 0) $$, '42501', 'locked', 'park locked at 50 health points');
select public.complete_task('b0000000-0000-0000-0000-000000000004');
select lives_ok($$ select * from public.buy_building('park', 0, 0) $$, 'park unlocked at 75 health points');

-- Milestones on recurring tasks: 9 earlier check-offs (simulated), the 10th pays a 25-coin bonus.
insert into public.tasks (id, title, area, difficulty, repeat) values
  ('b0000000-0000-0000-0000-000000000005', 'Read', 'knowledge', 'easy', 'daily');
reset role;
insert into public.task_completions (task_id, user_id, area, period_start, local_day, coins, points)
select 'b0000000-0000-0000-0000-000000000005', '61111111-1111-1111-1111-111111111111', 'knowledge',
       (select d from t_today) - g, (select d from t_today) - g, 10, 10
from generate_series(1, 9) g;
set local role authenticated;
create temporary table before_bal as select balance from public.my_progress();
select results_eq($$ select coins from public.complete_task('b0000000-0000-0000-0000-000000000005') $$,
  $$ values (35) $$, '10th check-off: 10 coins + 25 milestone bonus');
select is((select reason from public.coin_ledger where kind = 'bonus' order by id desc limit 1),
  'Milestone: 10 check-offs of Read', 'bonus ledger row');
select is((select bonus from public.task_completions where task_id = 'b0000000-0000-0000-0000-000000000005' and local_day = (select d from t_today)),
  25, 'bonus recorded on the completion');
select results_eq($$ select coins from public.undo_task('b0000000-0000-0000-0000-000000000005') $$,
  $$ values (35) $$, 'undo takes back the coins and the bonus');
select is((select balance from public.my_progress()), (select balance from before_bal), 'balance back to before');
select is(array[public.milestone_bonus(9), public.milestone_bonus(10), public.milestone_bonus(30), public.milestone_bonus(100), public.milestone_bonus(365)],
  array[0, 25, 75, 250, 500], 'milestone amounts');

-- One-off tasks never pay milestones (even the 10th one-off is just a task).
insert into public.tasks (id, title, area, difficulty, repeat) values ('b0000000-0000-0000-0000-000000000006', 'Once', 'personal', 'easy', 'once');
select results_eq($$ select coins from public.complete_task('b0000000-0000-0000-0000-000000000006') $$,
  $$ values (10) $$, 'one-off: no milestone');

-- Focus toward an area.
select throws_ok($$ select * from public.start_focus(10, null, 'social') $$, '22023', 'bad_area', 'focus cannot count toward social');
create temporary table f as select * from public.start_focus(20, 'Study', 'knowledge');
reset role;
update public.focus_sessions set started_at = started_at - interval '20 minutes', ends_at = ends_at - interval '20 minutes'
where id = (select id from f);
set local role authenticated;
create temporary table k_before as select knowledge from public.my_progress();
select results_eq(format('select coins from public.complete_focus(%L)', (select id from f)), $$ values (20) $$, 'focus pays coins');
select is((select knowledge from public.my_progress()) - (select knowledge from k_before), 20::bigint, 'and 20 knowledge points');
create temporary table g as select * from public.start_focus(10);
reset role;
update public.focus_sessions set started_at = started_at - interval '10 minutes', ends_at = ends_at - interval '10 minutes'
where id = (select id from g);
set local role authenticated;
select public.complete_focus((select id from g));
select is((select points from public.focus_sessions where id = (select id from g)), 0, 'focus without an area earns no points');
select is((select health + work + knowledge + personal from public.my_progress()), 75::bigint + 100 + (90 + 20) + 10,
  'points add up across areas');

select * from finish();
rollback;
