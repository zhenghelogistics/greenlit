-- Seed the delivery addresses from the rate book.
--
-- Read out of `Book1 (1).xlsx`, one sheet per customer, from the column each
-- sheet heads "Locations". Nothing here was retyped; the sheet name is what
-- ties an address to a customer, which is the fact the PDF print of the same
-- book had lost.
--
-- ## What a row means
--
-- `label` and `address` are both the string the book wrote, because the book
-- writes one string. Operations name their sites on the phone ("the Tuas
-- warehouse") and those names are worth having, but they are not in this file
-- and inventing them would put words in somebody's mouth.
--
-- `company` is the company at the address — the customer's own customer. The
-- book names it in three places and nowhere else, so everywhere else this is
-- the customer's own name, which is exactly what migration 0020 backfilled
-- existing rows with and means the same thing: one company, its own sites.
-- Correct them on the Customer Master screen as they become known.
--
-- ## No default address
--
-- `is_default` is false on every row. The book lists addresses in the order
-- somebody typed them, which is not a statement about which one a new job
-- should assume. A default guessed wrong pre-fills the wrong delivery on every
-- booking, and it is quieter than a blank field, so it is worse.
--
-- ## Safe to run twice, and safe to run early
--
-- Rows are keyed on customer and address, so a second run changes nothing. The
-- insert selects from `customers`, so an address whose customer is not in the
-- master yet is skipped rather than failing the script — run
-- `seed-customers.sql` first, then run this again to pick them up.

insert into customer_locations (
  location_id, customer_code, label, address, company,
  is_default, double_mounting_permitted, standby_usual, active, created_by
)
select v.location_id, v.customer_code, v.label, v.address,
       coalesce(v.company, c.company_name),
       false, true, false, true, 'import:book1'
  from (values
    ('loc-cc-01', 'CC', '5A JOO KOON CIRCLE #04-03', '5A JOO KOON CIRCLE #04-03', null),  -- CHONG CHEONG
    ('loc-cc-02', 'CC', '2 BENOI CRESCENT', '2 BENOI CRESCENT', null),  -- CHONG CHEONG
    ('loc-cc-03', 'CC', '47 CHANGI NTH CRESCENT', '47 CHANGI NTH CRESCENT', null),  -- CHONG CHEONG
    ('loc-isl-01', 'ISL', '31 TUAS AVE 2', '31 TUAS AVE 2', null),  -- ISLAND LINE
    ('loc-isl-02', 'ISL', '31 JURONG PORT ROAD #03-06', '31 JURONG PORT ROAD #03-06', null),  -- ISLAND LINE
    ('loc-isl-03', 'ISL', '204 BEDOK SOUTH AVE 1', '204 BEDOK SOUTH AVE 1', null),  -- ISLAND LINE
    ('loc-amg-01', 'AMG', '9 TANJONG PENJURU CRESCENT', '9 TANJONG PENJURU CRESCENT', null),  -- AM Global
    ('loc-amg-02', 'AMG', '1 PIONEER PLACE', '1 PIONEER PLACE', null),  -- AM Global
    ('loc-amg-03', 'AMG', '8 GUL CIRCLE', '8 GUL CIRCLE', null),  -- AM Global
    ('loc-amg-04', 'AMG', '11 LOYANG WALK', '11 LOYANG WALK', null),  -- AM Global
    ('loc-nissin-01', 'NISSIN', '31 TUAS AVE 2', '31 TUAS AVE 2', null),  -- NISSIN TRANSPORT
    ('loc-nissin-02', 'NISSIN', '50 TUAS AVE 9', '50 TUAS AVE 9', null),  -- NISSIN TRANSPORT
    ('loc-nissin-03', 'NISSIN', '28 PENJURU LANE #5', '28 PENJURU LANE #5', null),  -- NISSIN TRANSPORT
    ('loc-nissin-04', 'NISSIN', '6 TUAS SOUTH DR', '6 TUAS SOUTH DR', null),  -- NISSIN TRANSPORT
    ('loc-nissin-05', 'NISSIN', '91 TUAS AVE 1', '91 TUAS AVE 1', null),  -- NISSIN TRANSPORT
    ('loc-nissin-06', 'NISSIN', '11A TUAS AVE 20', '11A TUAS AVE 20', 'DENKA'),  -- NISSIN TRANSPORT
    ('loc-jas-01', 'JAS', '20 Penjuru Lane PHASE 3 WHSE LVL2', '20 Penjuru Lane PHASE 3 WHSE LVL2', null),  -- JAS
    ('loc-jas-02', 'JAS', '2 TUAS STH LINK 1 #06-07/08', '2 TUAS STH LINK 1 #06-07/08', null),  -- JAS
    ('loc-jas-03', 'JAS', '6 CHIN BEE AVE, LVL 1', '6 CHIN BEE AVE, LVL 1', null),  -- JAS
    ('loc-jas-04', 'JAS', '24 JURONG PORT ROAD #03-09/10', '24 JURONG PORT ROAD #03-09/10', null),  -- JAS
    ('loc-jas-05', 'JAS', '52 TANJONG PENJURU #04-03', '52 TANJONG PENJURU #04-03', null),  -- JAS
    ('loc-jas-06', 'JAS', '6 FISHERY PORT ROAD LVL 5', '6 FISHERY PORT ROAD LVL 5', null),  -- JAS
    ('loc-jas-07', 'JAS', '60 PIONEER RD LVL 2', '60 PIONEER RD LVL 2', null),  -- JAS
    ('loc-jas-08', 'JAS', '30 TUAS WEST RD', '30 TUAS WEST RD', null),  -- JAS
    ('loc-jas-09', 'JAS', 'Bulim Ave', 'Bulim Ave', null),  -- JAS
    ('loc-jas-10', 'JAS', '2 SERANGOON NTH AVE 5 #07-01', '2 SERANGOON NTH AVE 5 #07-01', null),  -- JAS
    ('loc-jas-11', 'JAS', '28 KRANJI Loop #03-07', '28 KRANJI Loop #03-07', null),  -- JAS
    ('loc-trans-01', 'TRANS', 'No. 3 Chin Be Crescent', 'No. 3 Chin Be Crescent', null),  -- TRANSWAYS INT
    ('loc-oocll-01', 'OOCLL', '31 TUAS AVE 2', '31 TUAS AVE 2', null),  -- OOCL
    ('loc-oocll-02', 'OOCLL', '121 GENTING LANE', '121 GENTING LANE', null),  -- OOCL
    ('loc-oocll-03', 'OOCLL', '10 TAMPINES INDUSTRIAL AVE 5', '10 TAMPINES INDUSTRIAL AVE 5', null),  -- OOCL
    ('loc-hock-01', 'HOCK', '21 PANDAN AVE #05-05', '21 PANDAN AVE #05-05', 'INABATA'),  -- HOCK
    ('loc-hock-02', 'HOCK', '29 TUAS AVE 13 BAY 21-26', '29 TUAS AVE 13 BAY 21-26', 'NIPPON EXPRESS')  -- HOCK
  ) as v (location_id, customer_code, label, address, company)
  join customers c on c.code = v.customer_code
 where not exists (
   select 1 from customer_locations e
    where e.customer_code = v.customer_code and e.address = v.address
 );

-- ---- what landed, and what was skipped for want of a customer -------------
select c.code, c.short_name, count(l.location_id) as addresses
  from customers c
  left join customer_locations l on l.customer_code = c.code
 group by c.code, c.short_name
 order by addresses desc, c.code;
