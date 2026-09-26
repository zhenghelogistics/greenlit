-- 0022 — what a yard charges, and when it started charging it
--
-- ## A rate is a series, not a value
--
-- A yard raises its depot handling charge in June, and the figure that was
-- right in May is still the right figure *for May*. An invoice raised then was
-- correct; a question asked in October about a container returned in April
-- needs April's number.
--
-- So rows are never updated in place. Recording a new rate inserts a row with
-- the date it takes effect, and "the rate" is the latest row that had already
-- started. Overwriting would answer today's question and silently destroy
-- every other one, at exactly the moment somebody changes a price.
--
-- ## One row per charge, not per yard
--
-- The rate book dates its three columns independently, because a yard raises
-- one charge without touching the others. A row per yard per date would force
-- a fiction about the two that did not move.
--
-- ## No foreign key to a yard
--
-- The yard master lives in `@greenlit/engine` as code, not in a table — see
-- `packages/engine/src/yards.ts` for why. `yard_code` is checked against it on
-- write rather than by the database. If the master becomes a table, this gains
-- a foreign key and nothing else changes.

create table if not exists yard_rates (
  rate_id        text primary key,
  yard_code      text not null,
  charge         text not null
                   check (charge in ('DHC','CDMS_ADMIN_FEE','DEPOT_SURCHARGE')),
  amount         numeric(10,2) not null check (amount >= 0),
  -- The first day this amount applies. A date in the past is legitimate: a
  -- yard that raised its charge three weeks ago and told nobody is ordinary.
  effective_from date not null,
  -- Anything the figure alone cannot say.
  remarks        text,
  recorded_at    timestamptz not null default now(),
  recorded_by    text not null,

  -- One amount per charge per start date. Correcting a mistake replaces that
  -- row; changing a price adds one with a later date.
  unique (yard_code, charge, effective_from)
);

-- Every read is "this yard's charges, in date order".
create index if not exists yard_rates_lookup
  on yard_rates (yard_code, charge, effective_from desc);

comment on table yard_rates is
  'What a yard charges, versioned by the date each amount took effect. Rows '
  'are inserted, never updated: the rate that applied in April is still the '
  'answer to a question about April.';

alter table yard_rates enable row level security;
