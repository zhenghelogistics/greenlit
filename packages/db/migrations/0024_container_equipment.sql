-- 0024 — the equipment a container needs
--
-- Three things the creation form has always asked for and nothing has ever
-- stored: tri-axle on imports, heavy duty and 32.5 tonnes on exports. A
-- controller ticked them, saved, and they were gone — not dropped by a bug in
-- one layer, but absent from every layer below the form. No column, no field
-- on the record, no route that would have carried them.
--
-- They decide which chassis goes out. Getting it wrong sends a truck that
-- cannot legally or physically take the box, which is a wasted trip and a
-- second one to arrange.
--
-- Booleans defaulting false: the question was asked and the answer was lost,
-- so every existing row means "nobody recorded this", which false is the
-- honest reading of. Operations set them as the jobs come round again.

alter table containers
  add column if not exists tri_axle boolean not null default false;

comment on column containers.tri_axle is
  'Needs a tri-axle chassis. Decides which unit is assigned.';

alter table export_containers
  add column if not exists heavy_duty  boolean not null default false,
  add column if not exists rated_32_5  boolean not null default false;

comment on column export_containers.heavy_duty is
  'Needs a heavy-duty chassis.';
comment on column export_containers.rated_32_5 is
  'Rated to 32.5 tonnes.';
