-- 0036 — who to call about the job
--
-- Job creation has asked for a point of contact since the start, and the save
-- dropped it. Operations, 29 September 2026: it should be kept.
--
-- Additive. Existing jobs read as not recorded.

alter table import_jobs add column if not exists point_of_contact text;
alter table export_jobs add column if not exists point_of_contact text;

comment on column import_jobs.point_of_contact is 'Who at the customer to call about this job.';
comment on column export_jobs.point_of_contact is 'Who at the customer to call about this job.';
