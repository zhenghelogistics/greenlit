-- Two dates the workflow asks for and the schema had nowhere to put.
--
-- The import container has `delivered_at`, which is the instant it actually
-- reached the customer. That is a different fact from the date somebody agreed
-- with the customer in advance, and the agreed one is what operations enter at
-- job creation, what the controller plans the week around, and what makes a
-- delivery booked before the vessel arrives visible as the typing mistake it
-- almost always is. Comparing the actual arrival to the ETA answers a question
-- nobody asked.
--
-- The export job has `empty_collection_yard` but not the date the empty is
-- wanted, which is the clock the whole job runs on. CMS is chased against it
-- and never against the vessel: the empty is usually due weeks before the ship
-- sails, so a job measured against the sailing looks comfortable right up to
-- the morning the truck cannot go.
--
-- Dates rather than timestamps for the planned pair, with the time kept beside
-- them. A delivery agreed for "Thursday morning" is a real answer and storing
-- it as midnight would make it look like a precision nobody has.

alter table containers
  add column if not exists planned_delivery_date date,
  add column if not exists planned_delivery_time text;

comment on column containers.planned_delivery_date is
  'The date agreed with the customer, not the date it arrived. '
  'delivered_at records the second of those.';

comment on column containers.planned_delivery_time is
  'A half-hour, or null when the day is agreed and the hour is not.';

alter table export_jobs
  add column if not exists empty_collection_date date,
  add column if not exists empty_collection_time text;

comment on column export_jobs.empty_collection_date is
  'When the empty is wanted. CMS is chased against this and never the vessel: '
  'the empty is usually due weeks before the ship sails.';

-- Planned dates are read by date, in ranges, on every board.
create index if not exists containers_planned_delivery_idx
  on containers (planned_delivery_date) where planned_delivery_date is not null;
create index if not exists export_jobs_empty_collection_idx
  on export_jobs (empty_collection_date) where empty_collection_date is not null;
