-- Seed the yard charges from the rate book.
--
-- Read out of the workbook's YARD RATES sheet, one row per charge per yard,
-- with the date that sheet gives for it. Which yard each row belongs to was
-- resolved by the engine's own matcher rather than typed, so "ALLIED YARD
-- (A), (TBL)" and "CWT YARD" land where they belong.
--
-- ## These are start dates, not edit dates
--
-- The sheet heads its date columns "Last Updated Date". They are used here as
-- the day each amount took effect, which is what a rate needs. If one of them
-- is really the day somebody edited the spreadsheet rather than the day the
-- yard changed its price, correct it on the Yard Rates screen: the figure is
-- right either way, only the date it started from would be wrong.
--
-- ## The three GST rows
--
-- Eng Kong, HLA and PSA write their CDMS fee as "GST 5.50" and "GST 5.45".
-- The number is taken and the original wording kept in the remarks, because
-- that could mean a fee of 5.45 including GST or a GST component of 5.45, and
-- those are different amounts. Until somebody says which, the remark is on
-- screen where it will be seen.
--
-- Adtine and Pioneer have no CDMS fee in the book, so they have no row. That
-- reads as "nobody recorded one", which is true, rather than as a fee of zero.
--
-- ## Safe to run twice
--
-- Keyed on yard, charge and start date. A second run changes nothing, and a
-- later increase is a new row rather than an edit — which is the whole point.

insert into yard_rates
  (rate_id, yard_code, charge, amount, effective_from, remarks, recorded_by)
values
  ('a-dhc-2026-06-15', 'A', 'DHC', 90.00, '2026-06-15', null, 'import:book1'),  -- ALLIED YARD (A), (TBL)
  ('a-cdms_admin_fee-2026-05-06', 'A', 'CDMS_ADMIN_FEE', 10.00, '2026-05-06', null, 'import:book1'),  -- ALLIED YARD (A), (TBL)
  ('a-depot_surcharge-2026-05-06', 'A', 'DEPOT_SURCHARGE', 10.00, '2026-05-06', null, 'import:book1'),  -- ALLIED YARD (A), (TBL)
  ('cc-dhc-2026-05-06', 'CC', 'DHC', 90.00, '2026-05-06', null, 'import:book1'),  -- CONTAINER CONNECTION (CC)
  ('cc-cdms_admin_fee-2026-05-06', 'CC', 'CDMS_ADMIN_FEE', 5.00, '2026-05-06', null, 'import:book1'),  -- CONTAINER CONNECTION (CC)
  ('cc-depot_surcharge-2026-05-06', 'CC', 'DEPOT_SURCHARGE', 15.00, '2026-05-06', null, 'import:book1'),  -- CONTAINER CONNECTION (CC)
  ('cwt-dhc-2026-05-01', 'CWT', 'DHC', 85.00, '2026-05-01', null, 'import:book1'),  -- CWT YARD
  ('cwt-cdms_admin_fee-2026-07-01', 'CWT', 'CDMS_ADMIN_FEE', 10.00, '2026-07-01', 'Book1 note: if CDMS is charged at cost, charge $5.', 'import:book1'),  -- CWT YARD
  ('cwt-depot_surcharge-2026-05-06', 'CWT', 'DEPOT_SURCHARGE', 15.00, '2026-05-06', null, 'import:book1'),  -- CWT YARD
  ('tong-dhc-2026-05-06', 'TONG', 'DHC', 95.00, '2026-05-06', null, 'import:book1'),  -- TONG CONTAINER
  ('tong-cdms_admin_fee-2026-05-06', 'TONG', 'CDMS_ADMIN_FEE', 10.00, '2026-05-06', null, 'import:book1'),  -- TONG CONTAINER
  ('tong-depot_surcharge-2026-05-06', 'TONG', 'DEPOT_SURCHARGE', 20.00, '2026-05-06', null, 'import:book1'),  -- TONG CONTAINER
  ('cua-dhc-2026-05-06', 'CUA', 'DHC', 80.00, '2026-05-06', null, 'import:book1'),  -- CHUAN LI YARD (CUA) (CL2)
  ('cua-cdms_admin_fee-2026-05-06', 'CUA', 'CDMS_ADMIN_FEE', 5.00, '2026-05-06', null, 'import:book1'),  -- CHUAN LI YARD (CUA) (CL2)
  ('cua-depot_surcharge-2026-05-06', 'CUA', 'DEPOT_SURCHARGE', 15.00, '2026-05-06', null, 'import:book1'),  -- CHUAN LI YARD (CUA) (CL2)
  ('ek-dhc-2026-05-06', 'EK', 'DHC', 80.00, '2026-05-06', null, 'import:book1'),  -- ENG KONG YARD (EK)
  ('ek-cdms_admin_fee-2026-05-06', 'EK', 'CDMS_ADMIN_FEE', 5.50, '2026-05-06', 'Book1 writes this as "GST 5.50". Confirm whether 5.5 is the fee inclusive of GST or the GST alone, and correct it here.', 'import:book1'),  -- ENG KONG YARD (EK)
  ('ek-depot_surcharge-2026-05-06', 'EK', 'DEPOT_SURCHARGE', 15.00, '2026-05-06', null, 'import:book1'),  -- ENG KONG YARD (EK)
  ('hla-dhc-2026-05-06', 'HLA', 'DHC', 80.00, '2026-05-06', null, 'import:book1'),  -- HLA YARD
  ('hla-cdms_admin_fee-2026-05-06', 'HLA', 'CDMS_ADMIN_FEE', 5.45, '2026-05-06', 'Book1 writes this as "GST 5.45". Confirm whether 5.45 is the fee inclusive of GST or the GST alone, and correct it here.', 'import:book1'),  -- HLA YARD
  ('hla-depot_surcharge-2026-05-06', 'HLA', 'DEPOT_SURCHARGE', 12.00, '2026-05-06', null, 'import:book1'),  -- HLA YARD
  ('psa-dhc-2026-05-06', 'PSA', 'DHC', 65.00, '2026-05-06', null, 'import:book1'),  -- PSA
  ('psa-cdms_admin_fee-2026-05-06', 'PSA', 'CDMS_ADMIN_FEE', 5.45, '2026-05-06', 'Book1 writes this as "GST 5.45". Confirm whether 5.45 is the fee inclusive of GST or the GST alone, and correct it here.', 'import:book1'),  -- PSA
  ('psa-depot_surcharge-2026-05-06', 'PSA', 'DEPOT_SURCHARGE', 15.00, '2026-05-06', null, 'import:book1'),  -- PSA
  ('cgc-dhc-2026-05-06', 'CGC', 'DHC', 78.00, '2026-05-06', null, 'import:book1'),  -- COGENT YARD (CGC)
  ('cgc-cdms_admin_fee-2026-05-06', 'CGC', 'CDMS_ADMIN_FEE', 6.00, '2026-05-06', null, 'import:book1'),  -- COGENT YARD (CGC)
  ('cgc-depot_surcharge-2026-05-06', 'CGC', 'DEPOT_SURCHARGE', 15.00, '2026-05-06', null, 'import:book1'),  -- COGENT YARD (CGC)
  ('wsm-dhc-2026-05-06', 'WSM', 'DHC', 85.00, '2026-05-06', null, 'import:book1'),  -- WING SENG YARD (WSM)
  ('wsm-cdms_admin_fee-2026-06-15', 'WSM', 'CDMS_ADMIN_FEE', 10.00, '2026-06-15', null, 'import:book1'),  -- WING SENG YARD (WSM)
  ('wsm-depot_surcharge-2026-05-06', 'WSM', 'DEPOT_SURCHARGE', 15.00, '2026-05-06', null, 'import:book1'),  -- WING SENG YARD (WSM)
  ('tbc-dhc-2026-05-15', 'TBC', 'DHC', 90.00, '2026-05-15', null, 'import:book1'),  -- TBC YARD
  ('tbc-cdms_admin_fee-2026-05-06', 'TBC', 'CDMS_ADMIN_FEE', 5.00, '2026-05-06', null, 'import:book1'),  -- TBC YARD
  ('tbc-depot_surcharge-2026-05-06', 'TBC', 'DEPOT_SURCHARGE', 15.00, '2026-05-06', null, 'import:book1'),  -- TBC YARD
  ('masterfaith-dhc-2026-05-06', 'MASTERFAITH', 'DHC', 85.00, '2026-05-06', null, 'import:book1'),  -- MASTER FAITH YARD
  ('masterfaith-cdms_admin_fee-2026-05-06', 'MASTERFAITH', 'CDMS_ADMIN_FEE', 5.00, '2026-05-06', null, 'import:book1'),  -- MASTER FAITH YARD
  ('masterfaith-depot_surcharge-2026-05-06', 'MASTERFAITH', 'DEPOT_SURCHARGE', 15.00, '2026-05-06', null, 'import:book1'),  -- MASTER FAITH YARD
  ('azon-dhc-2026-05-06', 'AZON', 'DHC', 90.00, '2026-05-06', null, 'import:book1'),  -- AZON CONTAINER
  ('azon-cdms_admin_fee-2026-05-06', 'AZON', 'CDMS_ADMIN_FEE', 5.00, '2026-05-06', null, 'import:book1'),  -- AZON CONTAINER
  ('azon-depot_surcharge-2026-05-06', 'AZON', 'DEPOT_SURCHARGE', 20.00, '2026-05-06', null, 'import:book1'),  -- AZON CONTAINER
  ('adtine-dhc-2026-05-06', 'ADTINE', 'DHC', 90.00, '2026-05-06', null, 'import:book1'),  -- ADTINE CONTAINER
  ('adtine-depot_surcharge-2026-05-06', 'ADTINE', 'DEPOT_SURCHARGE', 15.00, '2026-05-06', null, 'import:book1'),  -- ADTINE CONTAINER
  ('pioneer-dhc-2026-05-06', 'PIONEER', 'DHC', 80.00, '2026-05-06', null, 'import:book1'),  -- PIONEER CONTAINER
  ('pioneer-depot_surcharge-2026-05-06', 'PIONEER', 'DEPOT_SURCHARGE', 15.00, '2026-05-06', null, 'import:book1')  -- PIONEER CONTAINER
on conflict (yard_code, charge, effective_from) do nothing;

-- ---- what landed ----------------------------------------------------------
select yard_code, charge, amount, effective_from, remarks
  from yard_rates
 order by yard_code, charge, effective_from;
