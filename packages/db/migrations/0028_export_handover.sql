-- 0028 — handing an export to the controller
--
-- Imports have had this since the start: operations gather the paperwork, then
-- say explicitly that the job is the controller's. Exports had no such moment.
-- They appeared on the controller's board from creation, whether or not
-- anybody had finished with them.
--
-- Operations asked for the same explicit action on 28 September 2026, gated on
-- the core details: customer, delivery address, container size and weight, and
-- whether heavy duty, tri-axle or 32.5 tonnes apply.
--
-- Job level rather than per container, because an export has no per-box
-- paperwork gate the way an import has permits. What holds an export back
-- holds all of it back.
--
-- CMS is deliberately not a condition. It often cannot be done until the day
-- of collection, and blocking handover on it would keep the job off the
-- controller's board precisely while the controller needs to plan around it.
-- It blocks the collection instead.

alter table export_jobs
  add column if not exists handed_over_at timestamptz,
  add column if not exists handed_over_by text;

comment on column export_jobs.handed_over_at is
  'When operations passed this job to the controller. Null until they do. '
  'CMS may still be pending: that blocks the empty collection, not handover.';
