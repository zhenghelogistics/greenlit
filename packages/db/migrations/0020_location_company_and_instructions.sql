-- 0020 — the company a delivery address belongs to, and its standing instructions
--
-- Two columns, both of which the screens already assume exist.
--
-- ## company
--
-- The customer master was one level deep: a customer, and a flat list of that
-- customer's addresses. Operations describe two levels, and the new-job form
-- was written against the second one before it existed — it renders a Delivery
-- company picker that reads `location.company`, which nothing has ever set. So
-- the picker is always empty, no address can be chosen, and no import job can
-- be created at all.
--
-- The real shape, in operations' own words: Chong Cheong is the customer we
-- hold the retainer with, and Company A and Company B are its customers, each
-- with their own delivery addresses. A driver goes to an address; the invoice
-- goes to Chong Cheong. Both facts have to be on the record.
--
-- Existing rows take the customer's own name, because that is what they have
-- meant until now: one company, its own addresses. That keeps every job
-- pointing at the address it already pointed at.
--
-- ## operational_instructions
--
-- What is always true about delivering to this site — the gate to use, who to
-- call, that the forklift is only there before noon. It belongs to the place
-- rather than to the trip, which is why it lives here and not on a movement,
-- and why a job may still override it for one delivery.

alter table customer_locations
  add column if not exists company                  text,
  add column if not exists operational_instructions text;

comment on column customer_locations.company is
  'The company at this address. Usually one of the customer''s own customers: '
  'the customer holds the retainer, this company receives the container.';

comment on column customer_locations.operational_instructions is
  'Standing instructions for delivering here. Always true of the site, not of '
  'one trip — a job can override it for a single delivery.';

-- Backfill before the not-null, so no existing row is orphaned.
update customer_locations l
   set company = c.company_name
  from customers c
 where c.code = l.customer_code
   and l.company is null;

alter table customer_locations
  alter column company set not null;

-- The picker groups by company within a customer, and that is the only way
-- these are ever read.
create index if not exists customer_locations_by_company
  on customer_locations (customer_code, company);
