-- §33. Closing a job.
--
-- "Completed" has been unreachable: the derivation passed closureSatisfied as
-- a hardcoded false, so a job that was finished in every respect stayed open
-- forever and the board filled with work that was actually done.
--
-- Closing is a person's act, so it is stored: the engine can see every
-- container is back, but only a controller knows the paperwork is out. The
-- status stays derived and reads Completed *because* this is set.

alter table import_jobs
  add column if not exists closed_at   timestamptz,
  add column if not exists closed_by   text;

alter table export_jobs
  add column if not exists closed_at   timestamptz,
  add column if not exists closed_by   text;

-- Why a billed job was opened again. §33.2 requires it, and this is the only
-- record of why an invoice moved.
create table if not exists job_reopenings (
  reopening_id text primary key,
  job_id       text not null,
  reason       text not null,
  reopened_by  text not null,
  reopened_at  timestamptz not null default now()
);

create index if not exists job_reopenings_job_idx on job_reopenings (job_id);
