-- §34.0, §34.2. The rate, so the third number can be computed.
--
-- §34.0 names three numbers: our internal count, the carrier's count, and the
-- charge estimate, which is "carrier count multiplied by their rate". The
-- first two were stored and counted from the beginning. The third could not be
-- computed, because the rate had nowhere to live — so the screen could say a
-- container was four days over and not what four days costs.
--
-- §34.2 lists the rate and the currency among the values stored per container,
-- and immediately allows them to be absent: "the MVP may leave rates blank
-- where commercial rates are unavailable. The countdowns do not depend on
-- them." Both columns are therefore nullable, and the engine returns no figure
-- rather than a zero when they are.
--
-- The estimate itself is not stored. It is carrier days times rate, both of
-- which are here, and a stored copy would be a derived value somebody could
-- write — which §54 does not allow and §56 explains why.

alter table containers
  add column if not exists daily_rate numeric(12, 2),
  add column if not exists currency  text;

-- A rate without a currency is an amount nobody can quote, and a currency
-- without a rate is a label on nothing. Either both or neither.
alter table containers
  drop constraint if exists containers_rate_has_currency;
alter table containers
  add constraint containers_rate_has_currency
  check ((daily_rate is null) = (currency is null));

-- Three letters, as ISO 4217 writes them, so 'SGD' and 'sgd' and 'Sing$'
-- cannot all appear in the same column and be sorted as three currencies.
alter table containers
  drop constraint if exists containers_currency_code;
alter table containers
  add constraint containers_currency_code
  check (currency is null or currency ~ '^[A-Z]{3}$');
