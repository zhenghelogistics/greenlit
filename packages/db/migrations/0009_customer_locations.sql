-- §9.3. Where a customer receives and stuffs.
--
-- Delivery and stuffing addresses have been free text on the job, so every
-- booking retypes the same site, none of them match, and the two facts that
-- matter operationally — whether a double-mounted chassis can get in, and
-- whether the driver usually waits — had nowhere to live at all.
--
-- A customer may stuff at more than one site and the site is chosen per
-- booking, so this is a list per customer rather than a field on the customer.

create table if not exists customer_locations (
  location_id                text primary key,
  customer_code              text not null references customers(code) on delete cascade,
  -- What the customer calls it. "Tuas warehouse" is what someone says on the
  -- phone; the address is what the driver needs.
  label                      text not null,
  address                    text not null,
  is_default                 boolean not null default false,
  -- §19.1. Some sites cannot receive a double-mounted chassis.
  double_mounting_permitted  boolean not null default true,
  -- §21.3. This site usually keeps the driver waiting. A default, not an
  -- instruction: the movement still records what actually happened.
  standby_usual              boolean not null default false,
  active                     boolean not null default true,
  created_at                 timestamptz not null default now(),
  created_by                 text not null
);

create index if not exists customer_locations_customer_idx
  on customer_locations (customer_code);

-- One default per customer, enforced here rather than by everyone who writes.
-- A partial unique index says it exactly: at most one row per customer may be
-- the default, and only while it is active.
create unique index if not exists customer_locations_one_default
  on customer_locations (customer_code)
  where is_default and active;
