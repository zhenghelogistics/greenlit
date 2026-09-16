-- §42. Recording that the customer was told the container's number.
--
-- The dead end this closes. `container_details_sent` has existed since the
-- first migration and is read in four places — it decides the container's
-- status, it feeds the "stuffing overdue" exception, and the engine raises
-- "Send container details to customer" as the next action from it. Nothing
-- ever wrote it. So an export job reached Awaiting Container Details
-- Notification and stayed there for good: the screen named the task and the
-- system had no way to record that anybody had done it.
--
-- §42 says what a send consists of: "The send is recorded: sent flag,
-- timestamp, sender, recipient address, and a stored copy or message
-- reference." The flag and the timestamp were already columns. The other three
-- were not, and without them the record cannot answer the question it exists
-- to answer — which is not "was it sent" but "who told whom, and where is it".
--
-- This is why §42 calls the delay silent: "the container is delivered, but the
-- customer does not know its number and therefore cannot begin stuffing."
-- Nobody is blocked, nothing errors, and the job simply stops.

alter table export_containers
  add column if not exists container_details_sent_to   text,
  add column if not exists container_details_sent_by   text,
  add column if not exists container_details_reference text;

-- Sent means the four facts are present together. A flag with no recipient is
-- a claim that somebody was told, with no way to check who — which is the
-- state this migration exists to make unreachable.
alter table export_containers
  drop constraint if exists export_containers_details_sent_complete;
alter table export_containers
  add constraint export_containers_details_sent_complete
  check (
    container_details_sent = false
    or (container_details_sent_at is not null
        and container_details_sent_to is not null
        and container_details_sent_by is not null)
  );
