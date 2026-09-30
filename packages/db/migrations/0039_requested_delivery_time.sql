-- 0039 — the delivery time the customer asked for
--
-- The PM's demo asks a delivery date and a delivery time per container at
-- creation. 0037 kept the date; this keeps the time, a half-hour, beside it.
-- Additive. Existing containers read as not recorded.

alter table containers add column if not exists requested_delivery_time text;

-- And the demo's "Job / Container-specific Delivery Instructions" per box,
-- asked whatever the delivery mode.
alter table containers add column if not exists delivery_instructions text;

comment on column containers.requested_delivery_time is
  'The delivery time the customer asked for, as a half-hour, when they gave one.';
