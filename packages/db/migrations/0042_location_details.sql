-- 0042 — what a driver needs to know about a delivery site
--
-- The PM's demo keeps, for each saved address, a receiving window (from and
-- to, in half-hours), parking and access, and special remarks, beside its
-- standing instructions. Additive; existing addresses read as not recorded.

alter table customer_locations
  add column if not exists receiving_from text,
  add column if not exists receiving_to text,
  add column if not exists parking_access text,
  add column if not exists special_remarks text;

comment on column customer_locations.receiving_from is 'Earliest receiving time, a half-hour, when the site gives one.';
comment on column customer_locations.receiving_to is 'Latest receiving time, a half-hour.';
comment on column customer_locations.parking_access is 'Parking and access at the site.';
comment on column customer_locations.special_remarks is 'Anything else a driver must know about this site.';
