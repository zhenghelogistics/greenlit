-- 0023 — customer codes up to ten letters
--
-- Six was the limit, and three customers arrived that do not fit one: Kianlip,
-- Sealand International, and DKSH's healthcare warehouse, which bills under a
-- different invoice name from its consumer warehouse and so is a separate
-- customer with a separate code.
--
-- Operations wanted those written out rather than abbreviated into codes
-- nobody says aloud. That is the cheaper mistake to avoid: a code is immutable
-- once issued, because every job reference already printed is built from it
-- (ADR-0007), so an abbreviation regretted in a year cannot be taken back. Four
-- more characters cost a slightly wider column.
--
-- Still letters only. A digit would make a job number ambiguous to read at a
-- glance, which is the one thing it has to be.
--
-- Widening a check constraint cannot invalidate an existing row: every code
-- that satisfied two-to-six satisfies two-to-ten.

alter table customers
  drop constraint if exists customers_code_check;

alter table customers
  add constraint customers_code_check check (code ~ '^[A-Z]{2,10}$');
