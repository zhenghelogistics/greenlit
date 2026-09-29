-- 0037 — the delivery date the customer asked for
--
-- Operations, 29 September 2026: the customer provides the delivery date, so
-- it is entered when the job is created. Once Portnet release and discharge
-- are done the controller may arrange to send the box earlier than asked.
--
-- Two dates, then: what the customer requested, and what the controller
-- planned (planned_delivery_date, from 0018). Keeping both means an earlier
-- delivery does not erase what the customer asked for.
--
-- Additive. Existing containers read as not recorded.

alter table containers add column if not exists requested_delivery_date date;

comment on column containers.requested_delivery_date is
  'The delivery date the customer asked for, entered at job creation. '
  'planned_delivery_date is what the controller arranged, which may be earlier.';
