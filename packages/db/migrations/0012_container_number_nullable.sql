-- §29, §39. A container's number can arrive after the job does.
--
-- A job is created before its arrival notice more often than not: the customer
-- calls, the job is opened, the notice follows. The container row exists from
-- the start so there is somewhere to put the number when it comes — which is
-- what the in-memory adapter does and what a test has asserted from the
-- beginning.
--
-- The column said NOT NULL, so on Supabase that path failed with a constraint
-- violation while in memory it worked. Creating any job without container
-- details was broken, and only on the store that matters.
--
-- The database was the odd one out, not the design.

alter table containers
  alter column container_number drop not null;

-- Still unique where it exists: two containers may both be waiting for their
-- number, but no two may claim the same one.
drop index if exists containers_container_number_key;
create unique index if not exists containers_number_unique
  on containers (container_number)
  where container_number is not null;
