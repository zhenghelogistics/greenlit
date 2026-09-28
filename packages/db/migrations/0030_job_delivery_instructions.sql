-- 0030 — delivery instructions for one job only
--
-- The customer master holds standing instructions for a site: the gate to use,
-- who to call, that the forklift is only there before noon. Those are true of
-- the place and they belong to it.
--
-- What had nowhere to go is the instruction true of one job. "They are closed
-- Thursday this week, deliver Friday." "Ask for Ravi, not the usual contact."
-- Operations were writing those into the job remarks or not at all, and a
-- controller planning the trip never saw them.
--
-- Deliberately separate from the site's own instructions rather than
-- overwriting them: a note meant for one delivery must not quietly become
-- permanent, and the next controller reading the site would have no way to
-- know it was not.

alter table import_jobs
  add column if not exists delivery_instructions text;
alter table export_jobs
  add column if not exists delivery_instructions text;

comment on column import_jobs.delivery_instructions is
  'Instructions for this job''s delivery only. Shown to operations and to the '
  'controller, and never written back to the customer master.';
