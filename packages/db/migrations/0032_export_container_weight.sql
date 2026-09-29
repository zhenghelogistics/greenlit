-- 0032 — the weight of an export container
--
-- Export handover asks for it — operations named the customer, the address,
-- the size and the weight as what a controller needs before they can plan —
-- and there was nowhere to put it. The gate shipped requiring a figure no
-- screen and no command could supply, so every export would have read as
-- short of a weight forever.
--
-- The same fault as truckInDate and truckOutDate, in the feature written to
-- fix that one. It was found by running the document's own acceptance
-- scenarios rather than by searching the code for the words in them.
--
-- `tare_weight_kg` already exists and is a different number: the empty
-- container's own weight, used with the VGM. This is the gross weight of the
-- box once it is stuffed.

alter table export_containers
  add column if not exists gross_weight_kg numeric;

comment on column export_containers.gross_weight_kg is
  'Gross weight once stuffed. Decides which chassis can take it, and is a '
  'condition of handing the job to the controller.';
