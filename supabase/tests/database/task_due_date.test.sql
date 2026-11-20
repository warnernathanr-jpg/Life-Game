begin;
select plan(5);

insert into auth.users (id, email) values ('d0000000-0000-0000-0000-000000000001', 'due@example.com');
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001"}';

select lives_ok($$ insert into public.tasks (title, area, repeat, due_date) values ('Pay rent', 'personal', 'once', '2030-01-05') $$, 'a one-off can have a due date');
select throws_ok($$ insert into public.tasks (title, area, repeat, due_date) values ('Walk', 'health', 'daily', '2030-01-05') $$, '23514', null, 'a recurring task cannot');
select is((select due_date from public.my_tasks() where title = 'Pay rent'), '2030-01-05'::date, 'my_tasks returns the due date');
select lives_ok($$ update public.tasks set due_date = '2030-02-01' where title = 'Pay rent' $$, 'the owner can change it');
select is((select due_date from public.my_tasks() where title = 'Pay rent'), '2030-02-01'::date, 'changed');

select * from finish();
rollback;
