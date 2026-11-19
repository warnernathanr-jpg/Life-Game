-- Roads are their own building category (a new enum value must be committed before use,
-- so it gets its own migration).
alter type public.building_category add value if not exists 'road';
