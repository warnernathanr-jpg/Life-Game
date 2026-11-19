-- Landscaping (trees, water) is its own category (a new enum value must be committed before use).
alter type public.building_category add value if not exists 'landscape';
