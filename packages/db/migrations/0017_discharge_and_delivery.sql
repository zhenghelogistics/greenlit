-- The two facts the controller's board is built on.
--
-- A container is ready to collect when the shipment's Portnet release has come
-- through AND the box itself is off the vessel. Neither of those is a decision
-- anybody makes; both are things that happen, and the board follows from them.
--
-- What this replaces is a nine-step status chain -- Ready, Planned, Assigned,
-- Collected, Delivered, Empty Pending, Empty Ready, Empty Return Planned,
-- Empty Returned -- which a controller advanced by hand. A chain advanced by
-- hand records what somebody remembered to click, and drifts from what
-- actually happened within about a day.
--
-- Per container rather than per job. Portnet is granted against the bill of
-- lading and so belongs to the shipment; discharge happens to one box at a
-- time, and boxes on one bill come off the ship days apart. A job-level
-- discharge date would be right for one container and wrong for the rest.
--
-- Timestamps rather than flags, for the same reason as the handover: the
-- question asked afterwards is when, not whether.

alter table containers
  add column if not exists discharged_at timestamptz,
  add column if not exists delivered_at  timestamptz;

comment on column containers.discharged_at is
  'When this container came off the vessel. With Portnet released, this is what '
  'makes it collectable.';

comment on column containers.delivered_at is
  'When this container reached the customer.';

-- A container cannot have reached the customer before it left the ship.
alter table containers
  drop constraint if exists containers_delivery_follows_discharge;
alter table containers
  add constraint containers_delivery_follows_discharge
  check (delivered_at is null or discharged_at is null or delivered_at >= discharged_at);

-- The board reads these constantly and they are null for most of the table's
-- life, so both indexes are partial.
create index if not exists containers_discharged_idx
  on containers (discharged_at) where discharged_at is not null;
create index if not exists containers_delivered_idx
  on containers (delivered_at) where delivered_at is not null;
