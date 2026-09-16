-- §7. The controller comes back, as a role about work rather than seniority.
--
-- Migration 0006 cut the roles to two, MANAGEMENT and OPERATIONS, because the
-- old three had MANAGER read-only — a manager who could not create or close a
-- job, which is not what a manager does. That was right about the old model
-- and wrong about this one.
--
-- The split that matters is not seniority, it is the work. An operations
-- assistant prepares a job until its information is complete and hands it
-- over. A controller moves boxes: plans the trip, schedules it, assigns a
-- driver, chains it onto the one before. They are two halves of one operation
-- and each is senior in their own half, so CONTROLLER is a role and not a
-- rank between the other two.
--
-- MANAGEMENT keeps everything both of them can do, plus reopening a billed
-- job. ADMINISTRATOR keeps everything, and is now the only role that sees
-- error references and failure detail: a director reading "Cannot read
-- properties of undefined" learns nothing they can act on.

alter table principals
  drop constraint if exists principals_role_check;

alter table principals
  add constraint principals_role_check
  check (role in ('ADMINISTRATOR', 'MANAGEMENT', 'CONTROLLER', 'OPERATIONS'));
