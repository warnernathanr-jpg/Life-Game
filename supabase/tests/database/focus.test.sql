-- Focus timer: start, complete only after the time, claim window, daily cap, fail, isolation.
begin;
select plan(19);

insert into auth.users (id, email) values
  ('51111111-1111-1111-1111-111111111111', 'f1@example.com'),
  ('52222222-2222-2222-2222-222222222222', 'f2@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51111111-1111-1111-1111-111111111111"}', true);

select throws_ok($$ select * from public.start_focus(4) $$, '22023', 'bad_minutes', 'at least 5 minutes');
select throws_ok($$ select * from public.start_focus(61) $$, '22023', 'bad_minutes', 'at most 60 minutes');

create temporary table s1 as select * from public.start_focus(25, '  Write report  ');
select is((select minutes from public.focus_sessions), 25, 'session saved');
select is((select label from public.focus_sessions), 'Write report', 'label trimmed');
select is((select ends_at - started_at from s1), interval '25 minutes', 'ends 25 minutes after the start');
select throws_ok(format('select * from public.complete_focus(%L)', (select id from s1)),
  '22023', 'focus_too_early', 'coins only after the full time');

-- Starting another abandons the first.
create temporary table s2 as select * from public.start_focus(10);
select is((select status from public.focus_sessions where id = (select id from s1)), 'abandoned', 'a new session abandons the old one');
select is((select count(*)::int from public.focus_sessions where status = 'running'), 1, 'only one running session');

-- Pretend the session started 10 minutes ago (as the owner; users can't edit sessions).
reset role;
update public.focus_sessions set started_at = started_at - interval '10 minutes', ends_at = ends_at - interval '10 minutes'
where id = (select id from s2);
set local role authenticated;
select results_eq(format('select coins, balance from public.complete_focus(%L)', (select id from s2)),
  $$ values (10, 110::bigint) $$, '10 minutes = 10 coins');
select is((select reason from public.coin_ledger where kind = 'focus'), 'Focused 10 min', 'ledger row');
select throws_ok(format('select * from public.complete_focus(%L)', (select id from s2)),
  '22023', 'focus_over', 'cannot claim twice');

-- Too late to claim: abandoned, no coins.
create temporary table s3 as select * from public.start_focus(30);
reset role;
update public.focus_sessions set started_at = started_at - interval '45 minutes', ends_at = ends_at - interval '45 minutes'
where id = (select id from s3);
set local role authenticated;
select results_eq(format('select coins from public.complete_focus(%L)', (select id from s3)),
  $$ values (0) $$, 'claiming long after the end pays nothing');
select is((select status from public.focus_sessions where id = (select id from s3)), 'abandoned', 'and abandons it');

-- Fail.
create temporary table s4 as select * from public.start_focus(15);
select lives_ok(format('select public.fail_focus(%L)', (select id from s4)), 'give up');
select is((select status from public.focus_sessions where id = (select id from s4)), 'failed', 'marked failed');

-- No daily cap: a third 60-minute session in a day still pays 60.
reset role;
insert into public.focus_sessions (user_id, minutes, started_at, ends_at, local_day, status, coins)
values ('51111111-1111-1111-1111-111111111111', 60, now() - interval '3 hours', now() - interval '2 hours',
        (now() at time zone 'UTC')::date, 'completed', 60),
       ('51111111-1111-1111-1111-111111111111', 60, now() - interval '2 hours', now() - interval '1 hour',
        (now() at time zone 'UTC')::date, 'completed', 60);
set local role authenticated;
create temporary table s5 as select * from public.start_focus(60);
reset role;
update public.focus_sessions set started_at = started_at - interval '60 minutes', ends_at = ends_at - interval '60 minutes'
where id = (select id from s5);
set local role authenticated;
select results_eq(format('select coins from public.complete_focus(%L)', (select id from s5)),
  $$ values (60) $$, 'focus pays in full (no daily cap)');

-- Users can't write sessions directly; others can't see or touch them.
select throws_ok($$ insert into public.focus_sessions (user_id, minutes, ends_at, local_day) values (auth.uid(), 5, now(), current_date) $$,
  '42501', null, 'no direct inserts');
select set_config('request.jwt.claims', '{"sub":"52222222-2222-2222-2222-222222222222"}', true);
select is((select count(*)::int from public.focus_sessions), 0, 'other users see nothing');
select throws_ok(format('select * from public.complete_focus(%L)', (select id from s5)),
  'P0002', 'focus_not_found', 'other users cannot claim');
reset role;

select * from finish();
rollback;
