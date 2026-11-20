-- The Monument becomes a population reward too (no longer for sale), and the landmarks follow a new order:
-- 50 Welcome Arch, 100 Fountain Plaza, 250 Clock Tower, 500 Monument, 1,000 Founders' Statue, 2,500 Observation Tower,
-- 5,000 Crystal Spire (a new milestone, 6,000 coins). Monuments already built stay where they are.
update public.building_types set milestone_population = 100, description = 'A paved plaza around a splashing fountain. Reach 100 people.' where id = 'fountain';
update public.building_types set milestone_population = 250, description = 'A brick clock tower everyone sets their watch by. Reach 250 people.' where id = 'clock_tower';
update public.building_types set milestone_population = 500, cost = 1, unlock_points = 1000000000,
  description = 'A landmark statue on a plaza. Reach 500 people.' where id = 'monument';
update public.building_types set milestone_population = 1000, description = 'A golden statue honouring the town''s founders. Reach 1,000 people.' where id = 'founders_statue';
update public.building_types set milestone_population = 2500, description = 'A slender tower with a view over the whole city. Reach 2,500 people.' where id = 'observation_tower';
update public.building_types set milestone_population = 5000, description = 'A shining glass spire, the pride of a great city. Reach 5,000 people.' where id = 'crystal_spire';

create or replace function public.city_milestone_bonus(p_population integer) returns integer
language sql immutable set search_path = '' as $$
  select case p_population when 50 then 100 when 100 then 200 when 250 then 400 when 500 then 750
    when 1000 then 1500 when 2500 then 3000 when 5000 then 6000 end
$$;
