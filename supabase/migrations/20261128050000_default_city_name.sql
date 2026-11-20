-- New players start with a city name that invites them to tap it and choose their own.
alter table public.profiles alter column city_name set default 'Click Here to Name City';
