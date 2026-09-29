-- 0034 — a new customer's jobs need a permit unless we are told otherwise
--
-- Operations, 28 September 2026: permit applicability defaults from the
-- Customer Master. HOCK defaults to Not required, because it does not give us
-- a permit number; every other customer defaults to Required.
--
-- 0021 made the opposite the default, so every customer created since reads
-- as Not required and a job for one of them can be handed over with no permit
-- asked for. New customers now start at Required.
--
-- Existing rows other than HOCK are left as they are. Some of them may have
-- been set to Not required on purpose, and nothing here can tell those apart
-- from the ones that only took the old default, so operations confirm them
-- in the Customer Master rather than a migration guessing.

alter table customers alter column requires_permit set default true;

update customers set requires_permit = false where upper(code) = 'HOCK';
