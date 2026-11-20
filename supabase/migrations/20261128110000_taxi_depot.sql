-- The Gas Station becomes a Taxi Depot (same id, so placed ones become depots): taxis take people around town, so fewer
-- drive themselves. Traffic relief and the moving taxis are worked out in the app (layers.ts, taxis.tsx).
update public.building_types
set name = 'Taxi Depot',
    description = 'Taxis take people around town, so fewer drive themselves.',
    happiness = 0
where id = 'gas_station';
