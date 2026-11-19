-- Tasks are deleted instead of archived. Their check-offs stay (with a copy of the title) so area points and the
-- history calendar keep them.

alter table public.task_completions add column title text check (char_length(title) <= 120);
update public.task_completions c set title = t.title from public.tasks t where t.id = c.task_id;

alter table public.task_completions alter column task_id drop not null;
alter table public.task_completions drop constraint task_completions_task_id_fkey;
alter table public.task_completions add constraint task_completions_task_id_fkey
  foreign key (task_id) references public.tasks (id) on delete set null;

-- Archived tasks become deleted tasks (their check-offs are kept).
delete from public.tasks where archived_at is not null;

-- Record the title with each check-off.
create or replace function private.completion_title()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.title is null and new.task_id is not null then
    select t.title into new.title from public.tasks t where t.id = new.task_id;
  end if;
  return new;
end $$;
create trigger task_completions_title before insert on public.task_completions
  for each row execute function private.completion_title();
