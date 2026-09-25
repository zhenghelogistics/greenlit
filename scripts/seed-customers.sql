-- Seed the customer master from the operations list.
--
-- ## Read the codes before you run this
--
-- A code is issued once and never changes, because every job number for that
-- customer is built from it — ZHL-26-000014-I is only meaningful while ZHL
-- still means what it meant when that number was printed. Changing one later
-- orphans every reference already on paper.
--
-- So the codes below are a **proposal**. Change any of them in this file
-- before running it; changing them afterwards is not a small job.
--
-- The rule the database enforces: two to six letters, A–Z, no digits, unique.
--
-- ## The four DKSH entities
--
-- Operations' list has four, and they are separate customers with separate
-- jobs: Marketing Services, Singapore Consumer, Singapore Healthcare, and
-- South East Asia. They cannot share a code.
--
-- Existing jobs already carry `DKSH-...` numbers, which means one DKSH
-- customer exists today under the plain code. That row is left alone by the
-- `on conflict` below. Decide which of the four it is and rename the others
-- around it, or leave it and let the four proposed codes stand beside it.
--
-- ## What this does not set
--
-- `requires_permit` defaults to false for everyone, because which customers
-- need permits is not on this list and guessing it wrong is the kind of
-- mistake that only shows up at a gate. Set it per customer on the Customer
-- Master screen, or add it here once it is known.
--
-- Email domains are left empty for the same reason: they are what a notice is
-- matched against automatically, and a wrong domain quietly routes one
-- customer's arrival notices to another.
--
-- ## Safe to run twice
--
-- `on conflict (code) do nothing` — a customer already in the master is left
-- exactly as it is, including any addresses already recorded against it.

insert into customers (customer_id, code, company_name, short_name, account_status)
values
  ('amg',    'AMG',    'AM GLOBAL PTE LTD',                       'AM Global',        'ACTIVE'),
  ('als',    'ALS',    'ANG LEE SENG CO PTE LTD',                 'Ang Lee Seng',     'ACTIVE'),
  ('boll',   'BOLL',   'BOLLORE LOGISTICS SINGAPORE PTE LTD',     'Bollore',          'ACTIVE'),
  ('cent',   'CENT',   'CENTURION MARKETING PTE LTD',             'Centurion',        'ACTIVE'),
  ('cheng',  'CHENG',  'CHENG HENG PAPER PRODUCTS CO PTE LTD',    'Cheng Heng',       'ACTIVE'),
  ('cts',    'CTS',    'CHIA TECK SOON PTE LTD',                  'Chia Teck Soon',   'ACTIVE'),
  -- Already in use: the screens show CC-001 against this customer.
  ('cc',     'CC',     'CHONG CHEONG FOUNDRY WORKS PTE LTD',      'Chong Cheong',     'ACTIVE'),
  ('dkshm',  'DKSHM',  'DKSH MARKETING SERVICES PTE LTD',         'DKSH Marketing',   'ACTIVE'),
  ('dkshc',  'DKSHC',  'DKSH SINGAPORE PTE LTD - CONSUMER',       'DKSH Consumer',    'ACTIVE'),
  ('dkshh',  'DKSHH',  'DKSH SINGAPORE PTE LTD - HEALTHCARE',     'DKSH Healthcare',  'ACTIVE'),
  ('dkshs',  'DKSHS',  'DKSH SOUTH EAST ASIA PTE LTD',            'DKSH SEA',         'ACTIVE'),
  ('driven', 'DRIVEN', 'DRIVEN ASIA-PACIFIC PTE LTD',             'Driven',           'ACTIVE'),
  ('fair',   'FAIR',   'FAIRTECK HOLDING PTE LTD',                'Fairteck',         'ACTIVE'),
  ('fga',    'FGA',    'FIRST GRADE AGENCY PTE LTD',              'First Grade',      'ACTIVE'),
  ('hock',   'HOCK',   'HOCK TPTN & CTNR WAREHOUSING PTE LTD',    'Hock',             'ACTIVE'),
  ('isl',    'ISL',    'ISLAND LINE PTE LTD',                     'Island Line',      'ACTIVE'),
  ('jas',    'JAS',    'JAS FORWARDING (SINGAPORE) PTE LTD',      'JAS',              'ACTIVE'),
  ('nissin', 'NISSIN', 'NISSIN TRANSPORT (S) PTE LTD',            'Nissin',           'ACTIVE'),
  ('nutri',  'NUTRI',  'NUTRI RAINBOW PTE LTD',                   'Nutri Rainbow',    'ACTIVE'),
  ('oocll',  'OOCLL',  'OOCL LOGISTICS (SINGAPORE) PTE LIMITED',  'OOCL Logistics',   'ACTIVE'),
  ('scj',    'SCJ',    'SC JOHNSON & SON PTE LTD',                'SC Johnson',       'ACTIVE'),
  ('tashi',  'TASHI',  'TASHI INTERNATIONAL PTE LTD',             'Tashi',            'ACTIVE'),
  ('trans',  'TRANS',  'TRANSWAYS INTERNATIONAL (S) PTE LTD',     'Transways',        'ACTIVE'),
  ('zhl',    'ZHL',    'ZHENGHE LOGISTICS PTE LTD',               'Zheng He',         'ACTIVE')
on conflict (code) do nothing;

-- ---- what landed ----------------------------------------------------------
select code, company_name, short_name, requires_permit
  from customers
 order by company_name;
