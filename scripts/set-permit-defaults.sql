-- Permit applicability, defaulted per customer.
--
-- Operations, 28 September 2026: a permit is required for every customer
-- except Hock, which does not give us a permit number at all.
--
-- The default here is deliberately the cautious one. A job that wrongly asks
-- for a permit is noticed by whoever cannot hand it over, and they switch it
-- off. A job that wrongly skips one reaches a gate without paperwork, and by
-- then a driver is sitting there. So the exception is listed and everything
-- else is required.
--
-- This is a default and not a rule: the setting is per job and a controller
-- can change it, with the change on the job log.
--
-- Safe to run twice.

update customers set requires_permit = true
 where code <> 'HOCK';

update customers set requires_permit = false
 where code = 'HOCK';

-- ---- what landed ----------------------------------------------------------
select code, short_name, requires_permit
  from customers
 order by requires_permit desc, code;
