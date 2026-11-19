-- More ways for tasks to repeat (new enum values must be committed before use, so they get their own migration).
alter type public.task_repeat add value if not exists 'monthly';
alter type public.task_repeat add value if not exists 'quarterly';
alter type public.task_repeat add value if not exists 'yearly';
alter type public.task_repeat add value if not exists 'days';            -- on certain weekdays
alter type public.task_repeat add value if not exists 'times_per_week';  -- up to N times a week
alter type public.task_repeat add value if not exists 'times_per_month'; -- up to N times a month
