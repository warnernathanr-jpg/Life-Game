-- Homes follow the density ladder: House → Townhome → Apartments (more to come with city levels).
-- Display names only: the ids stay 'cottage' (House) and 'house' (Townhome) so placed buildings keep working.
update public.building_types
set name = 'House', description = 'A starter home for a few residents.'
where id = 'cottage';

update public.building_types
set name = 'Townhome', icon = '🏘️', description = 'Joined homes for growing families. Denser than a house.'
where id = 'house';
