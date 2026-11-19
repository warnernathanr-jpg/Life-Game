-- Roads cost 1 coin a tile (demolishing one refunds nothing: half of 1 rounds down).
update public.building_types set cost = 1 where id = 'road';
