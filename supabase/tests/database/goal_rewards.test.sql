-- Goal and step coins: paid through functions, taken back on undo / reopen / delete; no direct check-offs.
begin;
select plan(12);

insert into auth.users (id, email) values ('f1111111-1111-1111-1111-111111111111', 'gr@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1111111-1111-1111-1111-111111111111"}', true);

insert into public.goals (id, title, target_date, difficulty) values ('f2222222-2222-2222-2222-222222222222', 'Learn guitar', current_date + 30, 'epic');
insert into public.goal_steps (id, goal_id, title, position, difficulty) values
  ('f3333333-3333-3333-3333-333333333333', 'f2222222-2222-2222-2222-222222222222', 'Three chords', 0, 'medium'),
  ('f4444444-4444-4444-4444-444444444444', 'f2222222-2222-2222-2222-222222222222', 'One song', 1, 'hard');

select results_eq($$ select coins, balance from public.complete_goal_step('f3333333-3333-3333-3333-333333333333') $$, $$ values (25, 125::bigint) $$, 'a medium step pays 25 (like a medium task)');
select throws_ok($$ select * from public.complete_goal_step('f3333333-3333-3333-3333-333333333333') $$, '23505', 'already_done', 'only once');
select results_eq($$ select coins, balance from public.undo_goal_step('f3333333-3333-3333-3333-333333333333') $$, $$ values (-25, 100::bigint) $$, 'unchecking takes it back');
select public.complete_goal_step('f3333333-3333-3333-3333-333333333333');
select results_eq($$ select coins, balance from public.delete_goal_step('f3333333-3333-3333-3333-333333333333') $$, $$ values (-25, 100::bigint) $$, 'deleting a checked step takes it back');

-- No direct check-offs or coin edits.
select throws_ok($$ update public.goal_steps set done_at = now() where id = 'f4444444-4444-4444-4444-444444444444' $$, '42501', null, 'no direct check-off');
select throws_ok($$ update public.goals set completed_at = now() $$, '42501', null, 'no direct goal completion');
select throws_ok($$ delete from public.goal_steps $$, '42501', null, 'no direct step delete');

-- A brand-new goal pays nothing when reached (goals should take real time)…
select results_eq($$ select coins from public.complete_goal('f2222222-2222-2222-2222-222222222222') $$, $$ values (0) $$, 'too new: no bonus');
select results_eq($$ select coins from public.reopen_goal('f2222222-2222-2222-2222-222222222222') $$, $$ values (0) $$, 'reopen');
-- …one set 4 days ago pays ten times its tier (epic: 1000), and reopening takes it back.
reset role;
update public.goals set created_at = now() - interval '4 days' where id = 'f2222222-2222-2222-2222-222222222222';
set local role authenticated;
select results_eq($$ select coins, balance from public.complete_goal('f2222222-2222-2222-2222-222222222222') $$, $$ values (1000, 1100::bigint) $$, 'epic goal reached: +1000');
select throws_ok($$ select * from public.complete_goal_step('f4444444-4444-4444-4444-444444444444') $$, '22023', 'goal_done', 'steps of a reached goal are closed');
select results_eq($$ select coins, balance from public.reopen_goal('f2222222-2222-2222-2222-222222222222') $$, $$ values (-1000, 100::bigint) $$, 'reopening takes the bonus back');

select * from finish();
rollback;
