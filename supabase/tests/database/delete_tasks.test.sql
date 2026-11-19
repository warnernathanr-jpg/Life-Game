-- Deleting a task keeps its check-offs (title, points) for history and unlocks.
begin;
select plan(6);

insert into auth.users (id, email) values ('b1111111-1111-1111-1111-111111111111', 'del@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1111111-1111-1111-1111-111111111111"}', true);

insert into public.tasks (id, title, area, difficulty, repeat) values ('e1000000-0000-0000-0000-000000000001', 'Morning run', 'health', 'hard', 'daily');
select public.complete_task('e1000000-0000-0000-0000-000000000001');
select is((select title from public.task_completions), 'Morning run', 'check-offs keep the task title');
select lives_ok($$ delete from public.tasks where id = 'e1000000-0000-0000-0000-000000000001' $$, 'a completed task can be deleted');
select is((select count(*)::int from public.tasks), 0, 'the task is gone');
select results_eq($$ select title, task_id from public.task_completions $$, $$ values ('Morning run'::text, null::uuid) $$,
  'its check-off stays, detached from the task');
select is((select health from public.my_progress()), 50::bigint, 'area points are kept');
select is((select balance from public.my_progress()), 150::bigint, 'coins are kept');

select * from finish();
rollback;
