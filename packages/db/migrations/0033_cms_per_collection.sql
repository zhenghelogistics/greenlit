-- 0033 — CMS belongs to the collection it books
--
-- CMS has been one status on the export job. A job that collects from two
-- yards has two bookings and one field, so completing either cleared both —
-- and the second yard, which nobody had booked, read as ready to dispatch.
--
-- Operations were explicit: completing CMS for one empty collection must never
-- clear the blocker for another.
--
-- A booking covers a trip to a yard, not a container: one truck collecting two
-- boxes from Allied is one booking. So the status lives on the empty-collection
-- movement, which is exactly that trip.
--
-- The job-level column stays. It is what every existing job means — one
-- collection, one booking — and it is the fallback for any collection with no
-- status of its own, so nothing recorded before this changes meaning.

alter table movements
  add column if not exists cms_status text
    check (cms_status is null or cms_status in ('PENDING','COMPLETED','NOT_REQUIRED')),
  add column if not exists cms_completed_at timestamptz,
  add column if not exists cms_completed_by text;

comment on column movements.cms_status is
  'CMS for this empty collection. Null means it follows the job''s own status, '
  'which is what a job with a single collection has always meant.';
