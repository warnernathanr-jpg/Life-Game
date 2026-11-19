-- Phase A: four life areas and Epic tasks.
-- Renames keep existing rows: learning → knowledge, home → personal ('work' stays: it suits students and adults).
-- 'social' is merged into 'personal' in the next migration (an enum value can't be dropped in place;
-- it stays in the type but constraints stop it being used).
alter type public.life_area rename value 'learning' to 'knowledge';
alter type public.life_area rename value 'home' to 'personal';
alter type public.task_difficulty add value if not exists 'epic';
