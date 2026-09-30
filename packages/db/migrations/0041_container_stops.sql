-- 0041 — more than one stop for a container
--
-- The PM's demo lets a container stop at several places, each chosen from the
-- customer's saved locations with a note: a box delivered to one warehouse and
-- then moved to a second. Greenlit held one address per container.
--
-- The first stop stays delivery_address, which handover and the delivery trip
-- read. The stops after it are kept here, in order. Additive; existing boxes
-- have none.

alter table containers
  add column if not exists extra_stops jsonb not null default '[]'::jsonb;

comment on column containers.extra_stops is
  'Stops after the delivery address, in order: [{company, address, note}]. '
  'The first stop is delivery_address.';
