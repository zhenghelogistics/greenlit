# What the operations demo actually specifies

Written for: whoever builds the remaining screens, and the PM checking nothing
of his was dropped.

Read out of `pm-demo/ZHT_Operations_Demo_v12_135.html` — 17,753 lines, 11
screens, 9 modals, 112 distinct actions — rather than from memory of it. Where
a rule appears twice in that file under different versions, what is recorded
here is the **last** definition, because that is the one that runs.

Status is marked against this codebase, and re-checked against the code
rather than from memory on 24 September 2026 — most of what this file called a
gap had been built and the file had not been told.

- **built** — exists, tested, reachable from a screen
- **engine** — the rule exists and is tested; no screen reaches it yet
- **gap** — not built

---

## 1. The two roles, and the line between them

One dashboard, two views, switched by a control in the header.

**Operations Assistant** gathers a job until it is worth a controller's
attention. **Controller** plans and executes trucks. The important part is the
line between them, which nothing in our PRD had: a container becomes the
controller's by a deliberate act, not by reaching a status.

| | status |
|---|---|
| Two dashboard views, switched in place | **built** |
| Controller handover, per container | **built** |
| Handover requirements deliberately short | **built** |
| Handover survives later edits | **built** |

The requirements are the surprising part and they are worth restating because
every instinct says otherwise. To hand an import container over: **the
customer, the delivery address, and a permit where the job needs one.** Not the
vessel, the ETA, the bill of lading, the free time, the empty return yard — and
explicitly **not Portnet**, which is a hard gate on *planning* and no gate at
all on handover. A container waiting on Portnet is exactly the one a controller
wants to see, because seeing it is how the chasing starts.

---

## 2. The controller's board

Four piles. A container is in one of them and nobody puts it there.

```
PENDING     waiting on Portnet release, or discharge, or both
READY       released AND discharged — a truck can be sent
DELIVERED   at the customer, waiting for them to finish
EMPTY       finished with, ready to plan the empty back
```

This replaces a nine-step chain — Ready, Planned, Assigned, Collected,
Delivered, Empty Pending, Empty Ready, Empty Return Planned, Empty Returned —
that a controller advanced by hand. He deleted it deliberately. A hand-advanced
chain records what somebody remembered to click, and drifts from what happened
within a day.

Portnet is recorded per shipment and discharge per container. That asymmetry is
real: the release is granted against the bill of lading, while the boxes come
off the ship one at a time and sometimes days apart.

| | status |
|---|---|
| Four derived stages | **engine** |
| `dischargedAt` / `deliveredAt` per container | **engine** |
| Controller board with the four tabs | **built** |
| Per-job bulk Portnet / Discharge | **built** |
| Plan button only when READY | **engine** |
| Arrival brief grouped by vessel and day | **built** |
| Date-range filter: today / tomorrow / next 3 / next 7 | **built** |

His date ranges are worth copying exactly: **Next 3 Days means the three days
after today, not today plus two.** He corrected this specifically.

---

## 3. Document readiness

Before handover there is a second, job-level gate: operations marks the job
**Document Completed**. The button is disabled until nothing is outstanding,
and the outstanding list is computed live from the job record rather than
stored, so saving a field clears its line immediately.

| | status |
|---|---|
| Live outstanding list | **engine** |
| Mark Document Completed | **engine** |
| Jobs list filter: Required Information / Document Ready | **engine** |

---

## 4. The New Job module

His largest single piece, and the one this codebase has no equivalent for at
all: today a job can only be created by uploading a document.

It opens on a choice — **Import** or **Export** — and the two are different
workflows, not one form with a flag.

### Import, four tabs

**1. Customer & Delivery.** Customer, PIC, and then the decision that shapes
everything downstream: *Apply to Job Level* or *Prompt at Container Level*.
Job level means every container inherits one delivery address. Container level
means each one is asked separately. Addresses come from Customer Master only —
there is no free typing of a destination anywhere in his app.

**2. Shipment Details.** Vessel/Voyage, ETA date + time, Master Carrier,
MBL/OBL, HBL (optional), permit preference, job remarks. The NOA upload sits at
the top of this tab, because the intended order is: pick the customer, upload
the notice, and let it fill the rest.

**3. Container Details.** One row per container: number (checked as 4 letters +
7 digits), size, weight, delivery date + time, empty return depot, free-time
structure (combined, or separate demurrage and detention), free days, and
container-specific delivery instructions. Plus the per-row **distribution
control** — apply this value to *this container*, *all containers*, or
*selected containers* — which appears against the empty depot and against the
free-time block.

**4. Permit.** Shown only when the customer requires one. Permit files are
stored once at shipment level; containers receive only the permit *number*. One
permit can cover all containers, selected containers, or one.

### Export, three tabs

**1. Customer & Delivery.** Same two-mode address decision.

**2. Shipment Details.** Vessel/Voyage, booking reference, Portnet/export
clearance ref, shipper, ETA SIN, empty collection yard, **CMS status**, empty
collection date + time, Class 2S / Class 2C, remarks.

**3. Container Details.** Quantity × size, and that is all — export containers
are created as *empty slots*. Number, seal and tare stay blank and are filled
later by the controller after collection. Reefer sizes (20RF / 40RF / 40RQ)
additionally ask for Pre Cool or Pre Set At, and a temperature.

| | status |
|---|---|
| Import / Export chooser | **built** |
| Import four-tab wizard | **built** |
| Export three-tab wizard | **built** |
| Job-level vs container-level address mode | **built** |
| Container rows with per-row distribution | **built** |
| Export slots with blank identity | **built** |
| Create & Add Another | **built** |
| Job number preview before saving | **built** |

---

## 5. Rules that decide dates and money

| rule | status |
|---|---|
| **ETA is day one.** 7 free days end 6 days after arrival | **built** |
| Combined D&D vs separate demurrage/detention | **built** |
| Controller override beats the counted date | **built** |
| Free time classed: <10 short, >10 long, 10 threshold | **engine** |
| Permit vessel must match the shipment exactly | **built** |
| Permit expiry must be **strictly after** the ETA | **built** |
| Permit number shape `AA9A999999A` | **built** |
| Vessel amendment raises permit attention | **built** |
| Delivery date before ETA is flagged, not blocked | **engine** |
| **Export CMS is keyed to the empty collection date, not the vessel ETA** | **engine** |

The CMS one is easy to get wrong and he says it twice: an export job's
follow-up clock runs from when the empty is due to be collected, which can be
weeks before the vessel.

---

## 6. Everything the interface does the same way

Small, and worth listing because inconsistency here is what makes an app feel
unfinished.

| | status |
|---|---|
| Dates shown and typed as DD/MM/YYYY, tabular figures | **built** |
| A calendar button beside every date field | **built** |
| Times as a 30-minute dropdown, AM before PM | **built** |
| Business fields auto-uppercase; remarks stay sentence case | **built** |
| Container number checked 4 letters + 7 digits, warn not block | **built** |
| Back always returns to where you were, not to a fixed screen | **built** |
| Global search: job, container, customer, vessel, BL, driver, chassis | **built** |
| 40HQ / 40RF offer Heavy Duty, 32.5 TONS, Tri-Axle | **built** |

The warn-not-block principle runs through his whole app and is worth stating
plainly: a container number of the wrong shape, a permit whose number changed,
a delivery date before the ETA — all of them warn, none of them stop the save.
Operations can always proceed; the system's job is to make sure nobody
discovers the problem at the counter.

---

## 7. Where our extraction replaces his typing

He extracts the arrival notice in the browser with hand-written regular
expressions, one parser per carrier — OOCL, COSCO, RCL, MSC, Hapag-Lloyd, CMA
CGM/ANL. It is a genuinely impressive piece of work and it is the part of his
app we should least want to copy: a seventh carrier, or a sixth carrier
changing its template, means a new parser.

Ours reads the document with Claude and does not care whose template it is.
That difference is worth spending, because it turns typing into checking.

**Already extracted, already ours:** vessel and voyage, ETA, master bill,
house bill, carrier, container numbers, sizes, weights, seal numbers, package
counts, shipper, consignee.

**Extractable and not yet taken.** Each of these is on the arrival notice or
the permit and is currently typed:

| field | where it is | today |
|---|---|---|
| Demurrage / detention free days | stated on most notices | typed per container |
| Empty return depot | named on the notice | typed per container |
| Permit number, expiry, vessel | on the permit PDF | typed, then checked by hand |
| Terminal | on the notice | typed |

**Defaultable rather than extractable.** These are not on any document but are
almost never a surprise, and a wrong default that is visible beats an empty box
that is not:

| field | sensible default |
|---|---|
| Empty return depot | the depot this carrier used last time |
| Free days | this carrier's contract terms for this customer |
| Delivery date | ETA plus this customer's usual lead time |
| Delivery address | the customer's default location |

**Computable, and currently typed.** VGM is tare plus cargo weight, and the
tare is knowable from the container number.

**Not extractable, and should stay a decision.** Portnet release, discharge,
delivery, empty — these are the four facts the controller's board is built on,
and each is somebody confirming something happened. Portnet could in principle
be polled from the terminal rather than clicked, which would be the single
largest saving in the app: it is currently two clicks per container, and a
thirty-container job is sixty clicks to say one thing about one bill of lading.

---

## 8. What he built that we should not copy

**Fleet chaining suggestions.** His controller board suggests the next job for
a driver based on where their last movement ended. Ours already does this in
`routing.ts`, and deliberately only matches locations exactly rather than
fuzzily — a suggestion that is wrong is worse than no suggestion.

**The demo's seeded example job.** `ZHT-26-009900-I` exists to demonstrate the
five controller states. It is scaffolding.

**Backup / restore to a JSON file.** A browser-storage demo needs it. We have a
database.

**The 70 patch layers.** Each version in his file patches the last by
reassigning a global function. `renderJobDetail` is wrapped twenty times. Most
of the JavaScript in that file is unreachable. Where he patched the same thing
repeatedly is where the *rule* was unclear, and those passages are worth
reading closely — but the structure is a record of how the thinking arrived,
not a design to reproduce.


---

## 9. What is left

Checked against the source, not this file's own history.

Nothing in his demo is unbuilt. What remains is the other half of the
sentence: nine rules are written and tested in `@greenlit/engine` and no
screen calls them. Each is marked **engine** above. They are, in the order
they would be worth wiring:

| rule | what it would show, and where |
|---|---|
| `documentGaps` / `documentsComplete` | the live outstanding list, and the Mark Document Completed button that stays disabled until it is empty |
| `canHandOver` / `isHandedOver` | the per-container handover to a controller, which is the line his whole workflow is built on |
| `deliveryDateWarning`, `cmsWarning`, `staleEtaWarning` | the three plausibility warnings — a delivery before the ETA, an export CMS clock, an ETA nobody has confirmed in a week |
| `freeTimeTerm` | short / threshold / long, against the carrier's allowance |
| `movementGaps` | a trip with no driver, named rather than called incomplete |
| `wouldOverwrite` | which containers a bulk change would overwrite, by name |
| `permitNumberChanged` | a permit number that changed under an existing job |

A rule nothing calls is not worthless — it is proven, and wiring it is an
afternoon rather than a design — but it is also invisible, and invisible is
indistinguishable from absent to anybody using the system.

Two things beyond the demo are open and are decisions rather than work:

- **Which containers a permit covers.** One permit can cover all of a job,
  some of it, or one box, and nothing models that yet. It blocks the separate
  permit flow.
- **PRD §41 and §40.2 still disagree** on whether a CMS of `NOT_REQUIRED`
  satisfies the empty collection gate. Implemented toward §40.2. Operations
  have not confirmed.
