-- 0025 — where each container goes
--
-- The creation form offers two delivery models: one address for the whole job,
-- or an address per container. The second has never worked. The form asks for
-- it, validates that every container has one, and then posts a payload with no
-- address in it — containers had nowhere to keep one.
--
-- So a job with three boxes going to three sites was saved as three boxes with
-- no destination, and the controller planning them had nothing to plan from.
--
-- Null means this container uses the job's address, which is the ordinary case
-- and what every existing row means.

alter table containers
  add column if not exists delivery_company text,
  add column if not exists delivery_address text;

comment on column containers.delivery_address is
  'Where this container goes, when the job delivers to more than one place. '
  'Null means it uses the job''s own delivery address.';
