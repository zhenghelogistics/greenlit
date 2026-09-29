-- 0035 — the terminal belongs to the shipment, and the delivery company stays
--        with the delivery address
--
-- Operations, 29 September 2026: Terminal belongs to the shipment, beside the
-- vessel, voyage and ETA, not to the customer section. It was held on each
-- container (containers.port_terminal) and never asked for at creation, while
-- the job screen offered to edit it as a job field that had no column — so a
-- correction was either lost or refused.
--
-- The delivery company is chosen with the address from the customer's saved
-- locations, and was dropped at save, so the saved job could not show the
-- pair the creation form asked for.
--
-- Additive only. containers.port_terminal is left in place and still read as
-- the fallback for any job with no terminal of its own.

alter table import_jobs
  add column if not exists terminal text,
  add column if not exists delivery_company text;

comment on column import_jobs.terminal is
  'The terminal the vessel discharges at, for the whole shipment. Null falls '
  'back to the first container''s port_terminal, which is where it used to live.';
comment on column import_jobs.delivery_company is
  'The company at delivery_address, as chosen from the customer''s saved locations.';

-- Every existing job takes the terminal its containers already carry. One
-- sailing lands at one terminal, so the first non-empty value is the job's.
update import_jobs j
   set terminal = (
     select c.port_terminal from containers c
      where c.job_id = j.job_id and nullif(trim(c.port_terminal), '') is not null
      order by c.container_id limit 1)
 where j.terminal is null;

-- The company behind an address already chosen from the saved locations.
update import_jobs j
   set delivery_company = l.company
  from customer_locations l
  join customers cu on cu.code = l.customer_code
 where j.delivery_company is null
   and cu.customer_id = j.customer_id
   and l.address = j.delivery_address
   and l.company is not null;
