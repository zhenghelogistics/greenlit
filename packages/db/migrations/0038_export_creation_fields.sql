-- 0038 — what the export form asks, kept
--
-- The PM's demo is the specification (29 September 2026). Its export form
-- asks for the stuffing company and address, CMS status, Class 2S / 2C, the
-- empty collection date and time, a reefer instruction and temperature, and
-- Heavy Duty / 32.5T / Tri-Axle. Ours asked for most of these and saved none:
-- the job came back without them.
--
-- The collection date, CMS status, stuffing location and reefer columns
-- already exist. What had nowhere to go is added here. Additive only.

alter table export_jobs
  add column if not exists stuffing_company text,
  add column if not exists class_2s boolean not null default false,
  add column if not exists class_2c boolean not null default false;

alter table export_containers
  add column if not exists stuffing_company text,
  add column if not exists tri_axle boolean not null default false;

comment on column export_jobs.stuffing_company is
  'The company at the stuffing address, when one address serves the whole job.';
comment on column export_containers.stuffing_company is
  'The company at this box''s stuffing address.';
