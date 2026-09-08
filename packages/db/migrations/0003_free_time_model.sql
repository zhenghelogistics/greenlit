-- §34. Free time has three shapes, and one of them is "we do not know yet".
--
-- free_time_model already distinguished SPLIT from COMBINED, but defaulted to
-- SPLIT — which asserts a carrier rule for every job created before anyone has
-- read its arrival notice. The system then shows two countdowns that may in
-- fact be one allowance, which §34.3 forbids precisely because it invents a
-- deadline that does not exist and hides the one that does.
--
-- NOT_CONFIRMED is the honest default. Existing rows keep SPLIT: they were
-- entered under the old default and silently rewriting them would discard a
-- controller's confirmation along with the guesses.

alter table import_containers
  drop constraint if exists import_containers_free_time_model_check;

alter table import_containers
  add constraint import_containers_free_time_model_check
  check (free_time_model in ('SPLIT', 'COMBINED', 'NOT_CONFIRMED'));

alter table import_containers
  alter column free_time_model set default 'NOT_CONFIRMED';

-- The allowance as the carrier worded it. "10 combined calendar days from
-- discharge" is a term no integer can carry, and the wording is what a
-- controller checks when the derived count looks wrong.
alter table import_containers
  add column if not exists free_time_remarks text;
