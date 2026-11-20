-- Goals and steps: private to their owner; steps only on your own goals; task icons.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('d1111111-1111-1111-1111-111111111111', 'g1@example.com'),
  ('d2222222-2222-2222-2222-222222222222', 'g2@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1111111-1111-1111-1111-111111111111"}', true);

select lives_ok($$ insert into public.goals (id, title, area, icon, target_date) values ('e1111111-1111-1111-1111-111111111111', 'Run a 5K', 'health', 'footprints', current_date + 60) $$, 'add a goal');
select lives_ok($$ insert into public.goal_steps (goal_id, title, position) values ('e1111111-1111-1111-1111-111111111111', 'Run 1 km', 0), ('e1111111-1111-1111-1111-111111111111', 'Run 3 km', 1) $$, 'add steps');
select lives_ok($$ update public.goal_steps set done_at = now() where title = 'Run 1 km' $$, 'check off a step');
select throws_ok($$ insert into public.goals (title, target_date, icon) values ('Bad', current_date, 'Not An Icon!') $$, '23514', null, 'icons must be icon names');
select lives_ok($$ insert into public.tasks (title, area, difficulty, repeat, icon) values ('Stretch', 'health', 'easy', 'daily', 'dumbbell') $$, 'tasks take an icon');
select is((select icon from public.my_tasks() where title = 'Stretch'), 'dumbbell', 'my_tasks returns the icon');

-- Another user sees nothing and can't add steps to the first user's goal.
select set_config('request.jwt.claims', '{"sub":"d2222222-2222-2222-2222-222222222222"}', true);
select is((select count(*)::int from public.goals), 0, 'other users see no goals');
select is((select count(*)::int from public.goal_steps), 0, 'or steps');
select throws_ok($$ insert into public.goal_steps (goal_id, title) values ('e1111111-1111-1111-1111-111111111111', 'Sneaky') $$, '42501', null, 'no steps on someone else''s goal');

select * from finish();
rollback;
