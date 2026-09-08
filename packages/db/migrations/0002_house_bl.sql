-- House bill of lading on an import job.
--
-- Separate from bl_number rather than overloading it: the master bill is the
-- contract between the carrier and the forwarder, the house bill the one
-- between the forwarder and the shipper. A forwarded shipment carries both,
-- and they identify different parties.
--
-- Nullable with no default. Most direct carrier bookings have no house bill,
-- and an empty string would be indistinguishable from one that was never
-- looked for.

alter table import_jobs
  add column if not exists house_bl_number text;

-- Searchable alongside the master bill: an operator given a house number by a
-- forwarder has no way to know the master, and looking it up is the point.
create index if not exists import_jobs_house_bl_number_idx
  on import_jobs (house_bl_number)
  where house_bl_number is not null;
