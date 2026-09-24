-- Operations saying they have finished gathering a job.
--
-- The outstanding list is computed from the record and always has been, so the
-- system already knows when nothing is missing. This records something the
-- system cannot work out: that a person has looked at the complete job and
-- agrees it is right.
--
-- Those are different claims. "No field is empty" is arithmetic. "I have
-- checked this against the paperwork" is a judgement, and it is the one the
-- controller is actually relying on when they plan against the free time.
--
-- The button is refused while anything is outstanding, so the mark can never
-- mean less than both.

alter table import_jobs
  add column if not exists documents_completed_at timestamptz,
  add column if not exists documents_completed_by text;

comment on column import_jobs.documents_completed_at is
  'When operations confirmed the job is fully gathered. Null until they do. '
  'Distinct from the computed outstanding list, which only knows whether a field is empty.';

create index if not exists import_jobs_documents_completed_idx
  on import_jobs (documents_completed_at) where documents_completed_at is not null;
