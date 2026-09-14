-- §7. Two roles run the book, and one exists for whoever maintains the system.
--
-- OPERATIONS works a job start to finish: create it, amend it while it runs,
-- close it when it is done.
--
-- MANAGEMENT is everything operations can do and one thing more — reopening a
-- job that has been closed. That is the line, and it is drawn there because
-- closing is what makes a job billable. Amending a running job changes what
-- will be invoiced; amending a closed one changes what already has been.
--
-- The previous model had MANAGER read-only, so a manager could not create a
-- job or close one. That described a reporting line rather than a role anyone
-- at this company holds.

alter table principals
  drop constraint if exists principals_role_check;

update principals set role = 'OPERATIONS' where role = 'CONTROLLER';
update principals set role = 'MANAGEMENT' where role = 'MANAGER';

alter table principals
  add constraint principals_role_check
  check (role in ('ADMINISTRATOR', 'MANAGEMENT', 'OPERATIONS'));

select role, count(*), string_agg(display_name, ', ' order by display_name)
from principals group by role order by role;
