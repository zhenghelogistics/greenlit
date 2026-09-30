# Demo parity checklist

The PM's demo (`pm-demo/ZHT_Operations_Demo_v12_135.html`) is the single source
of truth from 29 September 2026. Where the demo and anything else disagree, the
demo wins. Where the demo says nothing, what is built stays until he says
otherwise. New changes go into the demo first.

Compared screen by screen against the demo's last definition of each function.
**H** = a user cannot do what the demo lets them, a rule differs, or typed data
is lost. **M** = a visible field, label or layout difference.

## Done

- [x] Import handover rule: customer, delivery address, permit number per box. Vessel, voyage, ETA not required.
- [x] Movements card offers "Hand over to Controller" before handover, Plan only once a box can be planned.
- [x] Free time is edited inside "Edit container details", opened with what is on file, for the container being viewed.
- [x] Removed the required "Container last free day" box and the "Operational state" dropdown from container edit; neither saved.

## Conflicts to settle with the PM

Where the demo differs from something operations, the brief or the handover
document decided. Not changed until the PM rules.

- Screens per role (ours) vs one set of screens with an Operations / Controller toggle (demo).
- Separate Vessel and Voyage fields (brief) vs one Vessel / Voyage field (demo).
- Tri-axle only, on every size, for imports (operations) vs Heavy Duty, 32.5T, Tri-Axle on 40HQ / 40RF only (demo).
- Remarks removed from creation (meeting) vs Job Remarks (demo).
- Portnet released at creation (handover document) vs boxes start Portnet Pending (demo).
- Discharge independent of release (brief) vs discharge only after release on the job screen (demo).
- ETA moved with a reason on Date changes (ours) vs ETA edited in Edit Shipment (demo).
- Customer fixed after creation (you) vs customer can be changed (demo).
- Export send-details step and carpark (T/T) branch (PRD) vs neither (demo).
- Exports: paused until the export walk-through.

## Controller

- [x] **H** Plan opens a plan form on the row: driver, vehicle, chassis (all required), date, 30-min time, from, to. View / Replan once planned.
- [x] **H** Delivered tab: EMPTY button moves the box to Empty Returns.
- [x] **H** Empty Returns: PLAN RETURN (from the stop to the container's return yard).
- [x] **H** Delivered only after a plan exists, and it completes the delivery trip.
- [x] **M** Pending: per-row PORTNET RELEASE and DISCHARGE, "Portnet · Selected / All in Job", "Discharge · Selected / All in Job", select-all box, confirm, count chips.
- [x] **M** Remove the arrival brief and "Today's fleet plan" (removed in the demo).
- [ ] **M** Page cards: Import Operations / Export Collection / Empty Returns / Planned Movements.
- [x] **M** Delivered and Empty Returns columns (location, chassis, return yard).

## Import job creation

- [x] **H** Empty return depot is typed and then dropped on save.
- [x] **H** Permits entered by hand at creation: number, expiry, vessel/voyage, file, "+ Add Permit", copy to all / selected, linked permits per container.
- [x] **H** Warn on create when a required permit is missing or failed a check, or a delivery date is before ETA.
- [x] **H** Container number required per row.
- [ ] **H** ETA optional; Vessel / Voyage as one field.
- [x] **H** Delivery date and delivery time per container (with the check against ETA).
- [x] **H** Create & Add Another resets the whole form (today it carries permits and the document into the next job).
- [ ] **M** Job remarks box; per-container delivery instructions; 40ft options (Heavy Duty, 32.5T, Tri-Axle) only on 40HQ/40RF.
- [x] **M** Default delivery address picked when the customer is chosen.
- [ ] **M** NOA review step before applying; master carrier free text.
- [ ] **M** Remove "Portnet released" at creation (demo creates boxes Portnet Pending).

## Import job screen

- [x] **H** Edit Customer & Delivery: customer selectable, job level / container level toggle, per-container company and address from Customer Master.
- [x] **H** Edit existing permits (number, expiry, vessel, file); refuse save on vessel mismatch or expiry not after ETA.
- [x] **H** Add Container keeps what is typed (yard, address, tri-axle, dates).
- [x] **H** Empty return depot and free time: apply to this / all / selected containers.
- [x] **H** Document readiness list as the demo's (adds master carrier, delivery company; drops ETA, free-time terms).
- [x] **H** "+ Add Job Note" on the activity log.
- [ ] **M** Edit Shipment: carrier select, one Vessel/Voyage, ETA date and time.
- [ ] **M** Container detail fields: delivery time, delivery summary, LFD basis, permit expiry.
- [x] **M** "Mark Job as Document Completed" with confirm; "DOCUMENT READY · date/time".
- [ ] **M** Discharge on the job screen only after Portnet release.

## Export

- [x] **H** Creation drops stuffing address, CMS status, Class 2S/2C, empty collection date/time, reefer settings. ETA SIN missing and overwritten by the collection date.
- [x] **H** Container-level stuffing addresses at creation.
- [x] **H** Edit Container drops size, number, seal, tare.
- [ ] **H** Handover gate: customer, vessel/voyage, shipper/stuffing company, stuffing address, booking, empty collection yard. No weight. Per container button.
- [ ] **H** Customer & Delivery and Shipment tabs and edits as the demo's.
- [ ] **H** Per-container next actions (Plan Empty Collection … Mark Entered PSA / Complete). Currently paused.
- [ ] **M** Empty collection yard optional; quantity validation; 40ft options only on 40HQ/40RF.
- [ ] **M** Export board shows CMS-done exports in the date range.
- [ ] **M** No send-details step and no carpark (T/T) branch in the demo — decide with the PM.

## Dashboard, jobs list, search

- [x] **H** "Active" count and Status column are broken (reads a field that does not exist).
- [x] **H** Requires Information uses the handover gaps; Ready for Controller card; per-job handover state and x/y column.
- [x] **H** Jobs list Document Status reads the "Document Completed" button, not the gap list.
- [x] **H** Global search covers HBL, seal, depot, driver, vehicle, chassis, delivery company and address; one match opens that container.
- [x] **M** Panel tabs All / Import / Export / Requires Information / Ready for Controller; no 12-row cut-off; "View all jobs" opens Jobs.
- [x] **M** Jobs list search box, status filter, columns.

## Planning, fleet, customers, roles

- [x] **H** Operations cannot save Customer Master (only administrators can). Demo: anyone.
- [ ] **H** Navigation: demo gives everyone the same screens with an Operations / Controller toggle on the dashboard. Ours splits by role.
- [x] **H** Renaming a customer carries to its jobs and locations; duplicate names refused.
- [x] **H** Empty Returns screen lists delivered and empty boxes waiting for a return, not only planned returns.
- [x] **H** Drivers & Vehicles lists every driver with planned work and availability (needs a driver master).
- [x] **H** A chassis on a planned trip shows PLANNED.
- [x] **M** Planning board: one row per driver, completed trips out, sorted by date.
- [ ] **M** Customer Master: Operational Instructions tab; receiving window, parking, remarks per address; companies as groups; list columns and search.
