-- Clear every job, so the system can be tried on a clean slate.
--
-- ## What this removes, and what it keeps
--
-- It removes the work: jobs, their containers, movements, permits, documents,
-- discrepancies, exceptions, amendments and the audit trail that belongs to
-- them.
--
-- It keeps everything somebody set up rather than did — customers, their
-- delivery companies and addresses, users, chassis and vehicles, the
-- thresholds. A clean slate for testing is an empty board, not an empty
-- system: a tester who has to re-enter the customer master before they can
-- create one job is testing data entry, not the workflow.
--
-- ## Why this is a file you run and not a button
--
-- There is a `/api/reset`, and it deliberately will not do this. It rebuilds
-- the in-memory fixtures and refuses outright in production, because the same
-- call against a real database deletes a day's work. This does delete a day's
-- work. That is the point, and it is why it is a thing you read first and then
-- choose to run.
--
-- **There is no undo.** If anything in here matters, take a Supabase backup
-- before running it.
--
-- ## Order
--
-- The foreign keys are a mix: `permits` and `permit_containers` cascade,
-- while `containers` and `export_containers` are `on delete restrict` — a job
-- will refuse to delete while its containers exist. Several other tables carry
-- a `job_id` with no constraint at all, so nothing would stop them being left
-- behind as orphans pointing at jobs that no longer exist.
--
-- So: children first, parents last, explicitly, rather than relying on
-- cascades that only some of these have.

begin;

-- ---- things that hang off a container -----------------------------------
delete from permit_containers;
delete from chassis_changes;

-- ---- things that hang off a job -----------------------------------------
delete from movements;
delete from exceptions;
delete from discrepancies;
delete from documents;
delete from date_amendments;
delete from job_reopenings;
delete from permits;

-- ---- the containers themselves ------------------------------------------
-- Before their jobs: both are `on delete restrict`, so a job will not go
-- while a container still points at it.
delete from containers;
delete from export_containers;

-- ---- the jobs -----------------------------------------------------------
delete from import_jobs;
delete from export_jobs;

-- ---- the history of all of the above ------------------------------------
-- §13's audit is keyed by entity rather than by a foreign key, so it has to
-- be cleared by what it refers to rather than by a join.
--
-- Deleting by `entity_type` would be wrong, and quietly. The adapter's audit
-- helper defaults its entity type to 'job', so a customer's own events —
-- customer.created, customer.amended, location.added — are stored as 'job'
-- with the customer's *code* as the entity. Clearing entity_type = 'job'
-- would take the customer history with it, which is the one thing this file
-- promises to keep.
--
-- So: everything whose entity is not a customer. A customer that still exists
-- should still be able to say who created it and when.
delete from audit_events
 where entity_id not in (select code from customers);

-- ---- job numbering -------------------------------------------------------
-- Back to 1, so the first job created after this is ABC-001 rather than
-- ABC-014. ADR-0007 numbers per customer, and a tester who creates their
-- first job and sees 014 will reasonably wonder what the other thirteen were.
--
-- This is the one line to think twice about: if any job number from before
-- this has been written on a piece of paper, printed on a delivery order or
-- sent to a customer, reissuing it points two different jobs at one number.
-- Delete this statement and the numbering simply carries on.
delete from job_sequences;

commit;

-- ---- what is left --------------------------------------------------------
-- Run this after, to see that the master data survived.
select 'customers'          as kept, count(*) from customers
union all select 'addresses',              count(*) from customer_locations
union all select 'users',                  count(*) from principals
union all select 'chassis',                count(*) from chassis
union all select 'import jobs (cleared)',  count(*) from import_jobs
union all select 'export jobs (cleared)',  count(*) from export_jobs
union all select 'containers (cleared)',   count(*) from containers;
