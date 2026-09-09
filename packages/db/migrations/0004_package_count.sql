-- §11. What the arrival notice counted, and in what unit.
--
-- Two columns rather than one text field: the count is comparable across
-- documents and the unit is not a number. Recording "300 CASE (CS)" as a
-- single string means it can be shown and never checked.
--
-- Both nullable. Plenty of notices state a weight and no package count, and a
-- zero would be a claim the document did not make.

alter table containers
  add column if not exists package_count integer,
  add column if not exists package_type  text;
