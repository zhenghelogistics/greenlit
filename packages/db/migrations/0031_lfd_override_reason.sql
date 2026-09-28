-- 0031 — why a last free day was set by hand
--
-- The override already works: a stored date beats the counted one, because
-- somebody decided that deadline by hand and the agreement is the deadline.
-- What was never recorded is why.
--
-- It matters because the counted date is reproducible and the override is not.
-- "The last free day is the 14th" is checkable against the ETA and the
-- allowance. "The last free day is the 20th" is only explicable by whoever
-- agreed it with the carrier, and six weeks later, when the demurrage invoice
-- is queried, that person is the only record of the conversation.
--
-- Who and when are already on the audit trail. This is the sentence.

alter table containers
  add column if not exists lfd_override_reason text;

comment on column containers.lfd_override_reason is
  'Why the last free day was set by hand rather than counted. Required when '
  'a date is stored; the counted date needs no explanation.';
