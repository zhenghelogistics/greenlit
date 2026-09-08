# Project Greenlit
## Transportation Control Tower: Product Requirements Document

**Owner** Zhenghe Logistics Pte Ltd
**Version** Unified edition 2.1d
**Supersedes** Unified edition 2.0, 19 August 2026, which superseded Complete edition 1.0 (Parts I, II and III)
**Status** Development handover

---

### How to read this document

This is one document with one continuous section numbering. A reference to Section 41 means Section 41. There are no parts to disambiguate and no reconciliation section that outranks the body text. Every conflict that existed between the old Parts I, II and III has been resolved in place, and the resolutions are listed in Appendix A.

The document is organised by **what the system is**, not by **when it was written**:

| Chapter | Sections | Covers |
|---|---|---|
| A. Platform | 1 to 15 | Everything shared by both trade directions |
| B. Movement and status engine | 16 to 27 | The engine that drives both domains |
| C. Import domain | 28 to 37 | Rules specific to import |
| D. Export domain | 38 to 47 | Rules specific to export |
| E. Screens | 48 to 53 | What the controller sees |
| F. Delivery | 54 to 61 | API, schema, acceptance, build order |

Anything stated in Chapter A or B applies to both domains and is not restated in Chapter C or D. If a behaviour is not described in the domain chapter, the platform chapter is the specification.

Appendix C maps every section of the old edition to its location here.

---

## 0. What changed in this edition

Edition 1.0 was three documents bound together. Part III opened with a reconciliation table resolving eight conflicts with Part II, and declared itself the authority where the two disagreed. That table was correct, but it was incomplete: it covered the conflicts between Parts II and III and not those between Part I and the rest, and it left a document in which a developer reading a rule could not know whether a later section overrode it.

This edition removes the reconciliation mechanism entirely by applying every resolution to the text.

**Twenty-seven conflicts, gaps and duplications were resolved.** Eight were the ones Part III already identified. Nineteen were not previously flagged, and five of those are structural rather than cosmetic:

- **Two competing movement models.** Part I tracked physical movement as a status on the container. Part III tracked it as a first-class movement record. Both existed in the same specification for the same platform. Resolved in Section 17: one movement model, both domains.
- **Two competing next-action engines.** Part I Section 56 produced a `next_action` string. Part III Sections 16 to 19 produced `next_action_required`, `blocking_reason` and `waiting_on` under a precedence ladder. Resolved in Section 25: one engine, two rule tables.
- **Two exception shapes and two audit shapes.** Import and export were each given their own. Resolved in Sections 13 and 27: one of each, serving both.
- **Mandatory fields and gate conditions were double-counted.** Permit and Portnet status were listed as mandatory fields *and* as separate conditions of the collection gate; CMS had the same problem on the export side. Resolved in Sections 30 and 40: mandatory fields describe data completeness, gates describe milestones, and nothing appears in both.

The full register is Appendix A. Every entry names the conflict, the resolution and the section where it now lives.

Three things did **not** change: the domain logic, the operational philosophy, and the gates. This is the same product.

### 0.1 What changed in edition 2.1

Edition 2.0 was reviewed by the operations team. Nine questions went out; the answers established that **six things in edition 2.0 were factually wrong about how the operation runs**, and added three capabilities that were not specified at all. This edition applies all of it.

Nothing here is a preference or a refinement. Each item below is a correction to a statement of fact.

| # | Edition 2.0 said | The operation actually does | Now in |
|---|---|---|---|
| 1 | An export job concerns one container | One booking can cover several containers, on one job | §38, §39 |
| 2 | A container is stuffed at one customer location | Stuffing can run across two or more locations, as separate journeys | §19, §46.3 |
| 3 | A 20ft container requires a 20ft chassis; the system validates this | Two 20ft containers may ride one 40ft chassis, subject to weight and site | §19.1, §35.2 |
| 4 | Import has no company-held storage | Laden imports are held at the company carpark | §6, §19, §36.2 |
| 5 | Import rarely waits on the customer | The customer tells us the container is empty before we collect it | §36.3 |
| 6 | Demurrage and detention are two clocks with two last free days | Carriers differ; some issue a combined D&D allowance. We count from vessel ETA as an internal standard, and warn on both figures separately | §34, §48.4 |
| 7 | *Not specified* | Portnet can fail to process a container that is genuinely ready. It must not block the laden movement | §44.2 |
| 8 | *Not specified* | Reefer cargo carries a temperature mode and setpoint | §9.2, §38.2 |
| 9 | *Not specified* | Truck-in and truck-out dates are fixed by the yard booking | §38.1, §40.1 |
| 10 | *Not specified* | Customers can require the truck and driver to stand by while they stuff or unstuff | §21.3 |
| 11 | Date changes are covered by the audit log | Dates move day to day. The reason is the useful part, and the audit stream cannot hold it | §13.1 |

**The two that change the schema** are items 1 and 3. Multi-container export means export gains a container table and its job status must aggregate, exactly as import already does. Double mounting means a movement may carry two containers, which no previous edition allowed.

**The one that changes a rule most people believe** is item 6. Edition 2.0 stated that demurrage and detention must never be conflated. For a carrier issuing a combined allowance, that instruction is wrong, and §34 now models both shapes.

Where this edition makes an assumption rather than recording an answer, it is marked **ASSUMPTION** in the text and listed in Appendix A.5.

---

# Chapter A: Platform

## 1. Product Overview

Greenlit is an internal web application that manages container transportation jobs from the point an operational email arrives until the container has completed its final movement and the job is closed. It covers both trade directions.

It replaces fragmented tracking across email, Excel, WhatsApp, shared folders, manual document checking and verbal handovers.

Two rules define the product:

> **Import.** No container may be released for collection unless all mandatory operational information is complete, the required permit has been received, and Portnet release has been confirmed.

> **Export.** No empty container may be collected until all mandatory job information is complete and CMS has been completed. No laden movement may begin until the customer has confirmed the container is ready and VGM has been received.

Both are the same rule in different clothing: a physical movement may not begin until its operational prerequisites are demonstrably satisfied, and the system, not a person's memory, decides whether they are.

## 2. Business Problem

Both trade directions suffer the same underlying cause: information lives in email rather than in a system. The risk profiles differ.

**Shared problems**

1. Shipment information arriving across multiple emails from different parties.
2. Controllers manually re-keying information into spreadsheets.
3. Documents stored separately from job records.
4. Missing information discovered only when transportation is being arranged.
5. No single view showing whether a container can proceed.
6. Repeated data entry between departments.
7. Limited audit trail of who changed operational information.
8. Poor handover visibility between controllers and between shifts.
9. No real-time management view of workload and exceptions.

**Import-specific**

10. Permit and Portnet release status requiring manual checking.
11. Difficulty tracking free time and demurrage/detention exposure.

**Export-specific**

12. CMS completion tracked informally, so empty collections are arranged before CMS is done.
13. Container number, seal and tare recorded on paper or in chat after collection, then not reliably sent to the customer, delaying stuffing.
14. No visible record of whether the customer has confirmed the container is ready.
15. VGM chased manually by email.
16. Transhipment availability checked ad hoc, with no record of when it was checked.
17. Carpark movements untracked, so containers sit at the carpark unnoticed at company cost.
18. Multiple movements for one shipment forced into a single job record, or split across several job numbers.

Item 18 is the reason the movement model in Chapter B exists.

## 3. Objective and Success Definition

The system must create a controlled operational workflow in which the machine holds the state and the human resolves the exceptions.

**Success is defined behaviourally.** A controller opening the system must be able to answer, without opening individual jobs:

- What jobs are active, and which are blocked?
- What information is missing, on which job, and who must supply it?
- Where is each container physically, right now?
- What is the next action on each job, and who is it waiting on, us, the customer, or the carrier?
- What is at deadline risk?
- What requires human intervention?

Three derived values carry the whole product:

```
current_location          Where is the container right now?
next_action_required      What must happen next?
blocking_reason           What is preventing it?
```

None of the three may ever be typed by a user. All three are computed server-side from stored milestones and movement records. This is specified in Sections 24 and 25.

## 4. Scope

### 4.1 MVP scope

**Platform**

1. Authentication and role-based access
2. Master data
3. Document repository with versioning
4. Email ingestion, classification and extraction
5. Email-to-job matching with a review queue
6. Audit and event log
7. Search, filtering, sorting and export
8. Manual override controls

**Engine**

9. Movement records and the movement state machine
10. Job status derivation
11. Container location derivation
12. Next action engine
13. Incomplete, Action Required and Exception queues
14. Automatic movement creation

**Import domain**

15. Import job and container entities
16. Mandatory field validation
17. Permit and Portnet tracking
18. Collection eligibility engine
19. Demurrage and detention tracking with countdown and alerts

**Export domain**

20. Export job entity
21. CMS tracking
22. Empty collection gate and laden gate
23. Container identity capture and customer notification
24. Container ready and VGM capture
25. Transhipment availability check and the carpark path

**Screens**

26. Dashboard with action required panel
27. Job trackers, container tracker, transport schedule
28. Job detail screens
29. Completed job archive

### 4.2 Out of scope for MVP

- Direct Portnet API integration
- Direct carrier booking API integration
- Automated VGM submission to the carrier
- Automated vessel closing time ingestion
- GPS tracking and driver mobile application
- Route optimisation and automated truck allocation
- Carpark yard management, such as slot allocation
- Costing, billing, invoicing and profitability
- Payroll and accounting integration
- Customer-facing portal
- Full CRM functionality
- Predictive exception detection

The architecture must allow these to be added without restructuring the movement model or the job entities.

## 5. Build Approach

Greenlit is not built from scratch, and it is not a fork. It is a new application assembled from two production applications the company already owns, plus one genuinely new piece in the middle.

**From Motus, the shape of the application.** How a user logs in, navigates, scans a tracker table, opens a detail record, filters and exports. Motus already answers the question "what does an operations screen at this company look like," and staff are familiar with it. Reusing that shape is an adoption decision as much as a technical one.

**From Pluckd, the extraction engine.** The code that turns a PDF into structured, validated fields. This is the hardest part of the system to get right, it is production-proven, and it must not be rewritten.

**Genuinely new: the operational rules.** Neither source application contains a collection eligibility engine, a mandatory-field engine, a movement state machine, a status derivation engine, a next-action engine or exception queues. That is where the build effort goes, and it is what Chapters B, C and D specify.

### 5.1 Two reuse mechanisms, which must not be confused

Getting this wrong is the most likely early architectural mistake.

| | Pluckd → extraction | Motus → shell |
|---|---|---|
| Mechanism | Shared package | Copy and adapt |
| Destination | `packages/extraction` | `apps/greenlit` |
| Relationship | One codebase, consumed by both Pluckd and Greenlit | Independent code. Motus is a reference, not a dependency |
| If it changes | Both applications receive the change | No effect on the other |

The extraction engine becomes genuinely shared code, lifted into `packages/extraction` and imported by both `apps/pluckd` and `apps/greenlit`. Fix a bug once, both benefit.

The Motus UI is not shared this way at the start. Greenlit copies the patterns and adapts them, because the underlying data models differ. Motus is billing-shaped; Greenlit is movement-shaped. Forcing premature shared components between two applications with different domain models creates coupling that is painful to unwind.

Generic pieces, status badges, table shells, filter bars, layout primitives, may be promoted into `packages/ui` once they have proven generic in both applications, and not before.

### 5.2 What this explicitly does not mean

- Greenlit is not a fork of Motus. Motus continues to serve its current users.
- Nothing in Motus is deleted or repurposed. Quoting and billing stay where they are.
- Greenlit does not read Motus's data. Separate domain, separate tables. Any future cross-application view belongs in the unified dashboard shell, not inside either application.
- Copying UI patterns does not mean copying the data model. Take the shape of the tracker table; do not take the fields inside it.

### 5.3 Where the code lives

```
apps/
    dashboard       shell, links tools
    greenlit        this project
    motus           existing, untouched
    pluckd          existing
    hive            pending assessment

packages/
    extraction      lifted from Pluckd, imported by greenlit and pluckd
    ui              only once proven generic
    auth            shared auth client
    db              schema, migrations, types
```

Sequencing: stand up the skeleton, build `apps/greenlit` inside it, then migrate the other apps. Do not block the Greenlit MVP on completing the full migration.

### 5.4 From Pluckd → packages/extraction

| File | Role in Greenlit |
|---|---|
| `api/extract.ts` | Server-side model call. Keeps the API key server-side. Uses `jsonrepair` for malformed JSON. Port from serverless function to a normal API route. |
| `services/claudeService.ts` | Chunking and orchestration for multi-page documents |
| `services/completeness.ts` | The single most valuable file in either repository. Self-check that detects incomplete extraction and triggers a re-fetch. It has tests; port them with it. |
| `services/crossCheck.ts` | Cross-document validation. Feeds the discrepancy behaviour in Section 12. |
| `services/pdfText.ts` | PDF text-layer extraction |
| `prompts/buildPrompt.ts`, `prompts/base.ts`, `prompts/logistics.ts` | Role-based prompt construction. The existing logistics role is the starting point for the document roles in Section 10. |
| `tests/` | Port the extraction tests with the code |

**Do not lift:** invoice and accounts-specific prompts, the voucher PDF service, packing-list merge logic, the billing tab.

**Two capabilities must be added**, because Pluckd does not have them today:

1. **Per-field provenance.** Every extracted field must carry `value / source / confidence / timestamp`, per Section 11.
2. **The discrepancy path.** Extracted values must never silently overwrite critical operational fields. Section 12 defines the required behaviour.

Export requires no new extraction code. It adds new document and email types as new prompt roles.

### 5.5 From Motus → apps/greenlit

| Motus pattern to lift | Greenlit equivalent |
|---|---|
| Authentication and role gating | Section 7 |
| App shell and sidebar navigation | Section 15 |
| Dashboard card and panel layout | Section 48 |
| Tracker table: columns, filters, sorting, pagination | Sections 49, 50 |
| Detail page layout: header, tabs, side panel | Section 51 |
| Search and filter bar | Section 15 |
| Export to Excel / CSV | Section 15 |
| Activity and audit display | Section 13 |

**Do not lift:** the quote calculator, rate cards, leads module, and the rate-calculation and lead-conversion backend. This application is movement-shaped, not billing-shaped. Leaving billing out is intentional and is not an omission.

These files are JavaScript written against a billing-oriented data model. Treat them as design reference, not as code to port line by line.

### 5.6 Stack conflict, to resolve on day one

| | Motus | Pluckd |
|---|---|---|
| Language | JavaScript (`.jsx`) | TypeScript (`.ts` / `.tsx`) |
| React | 18 | 19 |
| Backend | Express | Serverless functions |
| Anthropic SDK | older major | newer major |

**Recommendation: standardise on TypeScript and React 19.** Greenlit should be TypeScript from the first commit. The data model in Section 55 is precise enough, and the status derivation in Sections 32 and 45 conditional enough, that static typing pays for itself immediately.

Pluckd's serverless functions need porting to normal API routes on the self-hosted backend. Small change, but do it deliberately rather than discovering it at deployment.

### 5.7 Where the build effort actually goes

Stated explicitly so that estimation is not distorted by the amount of reuse.

```
REUSED, low risk
    Application shell, navigation, tables        from Motus
    Document extraction pipeline                 from Pluckd

NEW, where the risk and the effort are
    Movement model and state machine             §17 to 23
    Status derivation, both domains              §32, §45
    Location engine                              §24
    Next action engine                           §25
    Three queues                                 §26
    Collection eligibility engine                §31
    Empty collection and laden gates             §41, §44
    Mandatory field engine                       §30, §40
    Demurrage / detention countdown              §34
    Email to job matching                        §11
    Audit trail                                  §13
```

The reuse reduces the cost of the surface. It does not reduce the cost of the rules.

**The rules are the product.**

## 6. Structural Difference Between the Domains

One asymmetry drives most of the design, and building either domain as "the other one with renamed fields" will fail.

| | Import | Export |
|---|---|---|
| A job branches into | **Containers, then movements.** One job holds one or many containers. | **Containers, then movements.** Same shape. One booking may cover several containers. |
| Container number known | At job creation | Only after each empty is collected |
| Status aggregates over | Containers, hence *Partially Collected* | Containers, same mechanism |
| Progression gate | Permit and Portnet release | CMS and mandatory information, then ready + VGM + transhipment |
| Free time exposure | Demurrage and detention, per §34 | None |
| Time pressure | Last free day | Vessel closing and transhipment availability |
| Waiting on the customer | At empty return, per §36.3 | Central: stuffing, ready confirmation, VGM |
| Company-held storage | Carpark, laden, per §36.2 | Carpark, laden, per §44.4 |
| Movements per container | Two normally, three where the carpark is used | Two normally, three or more with carpark or multi-stop stuffing |

> **Changed in 2.1.** Edition 2.0 stated that an export job normally holds one container, that import has no company-held storage, and that import rarely waits on the customer. All three were wrong. The two domains are structurally more alike than the previous edition claimed.

**Both branch into containers, and both branch into movements.** That is the unification in Chapter B. The remaining asymmetry is timing: an import container number is known when the job is created, an export container number is not known until the empty is collected, which is why export container records are created before they are identified.

Section 33 specifies aggregation for import. **Section 45.4 applies the same mechanism to export.**

Everything not in this table is shared, and is specified in Chapters A and B.

## 7. User Roles

Three roles. Permissions are enforced server-side; never rely solely on frontend checks.

### 7.1 Administrator

Create and disable users. Configure master data, mandatory field sets, document requirements, D&D rules, CMS requirement per customer or job type, and all thresholds in Section 27. Manage the company carpark as a location. Edit any job. Override any gate. Reopen completed jobs. View audit logs.

### 7.2 Transportation Controller

Create and edit jobs. Upload documents. Review extracted information. Confirm permit receipt and Portnet release. Record CMS completion. Create, schedule, assign, update and cancel movements. Capture container, seal and tare. Send container details to customers. Record container ready and VGM. Record transhipment availability. Manage exceptions. Close eligible jobs.

Controllers should not normally bypass a gate. Where an override is permitted at all, Section 27.4 applies.

### 7.3 Manager / Viewer

Primarily read-only. Dashboard, trackers, queues, exceptions, D&D exposure, carpark occupancy, operational performance, and report export.

An optional permission may allow managers to override blocked jobs.

## 8. Core Data Architecture

Nine concepts, kept separate. Keeping them separate is what prevents the application becoming one unmaintainable table.

```
CUSTOMER
    └── JOB                 import_jobs or export_jobs
            ├── CONTAINER   import only; export holds identity on the job
            ├── MOVEMENT    one physical truck journey
            ├── DOCUMENT    optionally linked to a container or movement
            ├── EMAIL
            ├── EXCEPTION   optionally linked to a movement
            ├── NOTE
            └── AUDIT EVENT
```

**Derived, never stored as a settable value:** job status, container status, collection eligibility, current location, next action, blocking reason, waiting on. Everything else on this diagram is stored state.

### 8.1 Job numbers

System generated, unique across both domains, immutable after creation.

```
JOB-YYMMDD-XXX        import        JOB-260817-001
EXP-YYMMDD-XXX        export        EXP-260817-001
```

`XXX` is the sequence for that day. The two sequences are independent.

### 8.2 Referential integrity

```
Container       must belong to an import job
Movement        must belong to a job, either domain
                may reference a container
Document        must belong to a job
                may additionally belong to a container or a movement
Exception       belongs to a job
                may belong to a container or a movement
Email           may reference a job once matched
Audit event     references the affected entity
```

Hard deletion of operational records is prohibited. Use soft delete or archive.

## 9. Master Data

```
Customers          Carriers           Ports
Terminals          Yards              Locations, including the company carpark
Container types    Job types          Document types
Exception types    D&D rules          Threshold configuration
Users              Trucks             Chassis
```

### 9.1 Chassis register

The chassis fleet is company owned, fixed in size, and every unit carries its own permanent chassis number. It is master data, not something created on the fly.

| Field | Notes |
|---|---|
| `chassis_id` | UUID |
| `chassis_no` | Permanent fleet number, unique, e.g. 2038 or 4029 |
| `plate_no` | Vehicle registration, e.g. TRA7727Y |
| `size` | `20FT` or `40FT` |
| `unladen_weight_kg` | From the fleet register |
| `max_gross_weight_kg` | Rated maximum |
| `inspection_due_date` | Next statutory inspection |
| `status` | `AVAILABLE` / `IN_USE` / `MAINTENANCE` / `INSPECTION` / `RETIRED` |
| `active` | Boolean |

As at the current register the fleet is 89 units: 47 twenty-foot and 42 forty-foot. Chassis numbers and plates are unique across the fleet and reconcile exactly against the inspection schedule.

**Two data quality items to resolve before loading.** The maximum weight column in the current register is filled for 12 of 47 twenty-foot units and 39 of 42 forty-foot units, and is entered inconsistently, some as text such as "41 TONS" and some as a bare number. It must be loaded as numeric kilograms. Second, inspection due dates cluster heavily, with 22 units due in a single month and 14 and 12 in the two months before it. That is roughly a quarter of the fleet unavailable in one month, and Section 35 treats it as a planned availability event rather than a surprise.

Users must not be able to repeatedly enter slightly different names by hand. `Ocean Network Express`, `ONE`, `O.N.E` and `ONE Line` must map to one carrier master record.

**Customer master fields:** customer ID, company name, short name, billing name, default consignee, default delivery address, default contact, email domains, account status, notes. Email domain assists automated customer detection during matching.

### 9.2 Carrier free time rules

> **New in 2.1.** Edition 2.0 assumed every carrier issues separate demurrage and detention allowances. Some issue a single combined pool covering both. The rule shape is therefore carrier master data, not a constant.

| Field | Notes |
|---|---|
| `carrier_id` | FK |
| `free_time_model` | `SPLIT` or `COMBINED` |
| `demurrage_free_days` | Used when `SPLIT` |
| `detention_free_days` | Used when `SPLIT` |
| `combined_free_days` | Used when `COMBINED` |
| `counts_from` | `VESSEL_ETA` / `DISCHARGE` / `GATE_OUT`, as the carrier contracts it |
| `daily_rate` / `currency` | Optional, may be blank in MVP |
| `effective_from` / `effective_to` | Rules change at contract renewal |

Rules may be overridden per customer where a customer holds its own contract with the carrier. §34 specifies how both models are counted.

### 9.3 Customer stuffing locations

> **New in 2.1.** A customer may stuff at more than one site, and the site is chosen per booking rather than fixed on the customer record.

| Field | Notes |
|---|---|
| `location_id` | FK to `locations` |
| `customer_id` | FK |
| `label` | What the customer calls it |
| `address` | Full address |
| `is_default` | One per customer |
| `double_mounting_permitted` | Boolean. Some sites cannot receive a double-mounted chassis. See §19.1 |
| `standby_usual` | Boolean. This site usually requires the driver to wait. A default, not an instruction. See §21.3 |
| `active` | Boolean |

The empty delivery address on an export job is **selected from this list**, not typed. Where a customer supplies a new site, it is added to their record rather than entered as free text on the job, so that the next booking can reuse it.

Multi-location stuffing is uncommon but not rare, and is specified in §46.3.

### 9.4 Container type and temperature

Reefer cargo requires a temperature instruction that arrives on the booking and must be carried to the driver.

| Field | Notes |
|---|---|
| `is_reefer` | Boolean, derived from container type |
| `temperature_mode` | `PRE_COOL` or `PRE_SET` |
| `temperature_setpoint_c` | Decimal, e.g. `-15.0` |
| `temperature_tolerance_c` | Decimal, optional |

> **Changed in 2.1.** Edition 2.0 carried reefer only as free text inside special instructions. A setpoint that lives in a free-text field cannot be validated, cannot be shown on a schedule, and cannot be checked against what the driver actually set.

All thresholds referenced anywhere in this document are configurable per customer or globally, and must not be hard-coded.

## 10. Documents

Documents are not generic attachments. Every file carries metadata.

| Field | Description |
|---|---|
| `document_id` | Internal unique ID |
| `job_id` | Parent job, required |
| `container_id` | Optional, import |
| `movement_id` | Optional |
| `document_type` | See below |
| `filename` | Original filename |
| `file_url` | Secure storage location |
| `source` | Email / manual upload / API |
| `received_at` | Timestamp |
| `received_from` | Sender |
| `version` | Integer |
| `is_current_version` | Boolean |
| `extraction_status` | Parsed / pending / failed |
| `uploaded_by` | User or system |

**Document types.** Shared: Commercial Invoice, Packing List, VGM, Shipping Instruction, Proof of Delivery, Other. Import: Notice of Arrival, Bill of Lading, House Bill of Lading, Permit, Portnet Release, Delivery Order, Empty Return Confirmation. Export: Booking Confirmation, Export Clearance / Portnet Export, Container Details Notification (the outbound message), Carpark Receipt or Gate Record.

Administrators must eventually be able to configure additional types.

**Version control.** A revised document never replaces its predecessor. The old version is marked superseded and retained.

```
Permit v1    Superseded
Permit v2    Current
```

**Document checklist.** Every job detail screen shows a checklist of expected documents against those received, with received items opening a preview.

## 11. Email Ingestion, Extraction and Matching

The application connects to the designated operations inbox. On each new email the system stores metadata, reads subject and body, detects attachments, classifies the email and each attachment, extracts shipment information, and attempts to match it to an existing job.

**Email record:** email ID, external message ID, sender, recipient, CC, subject, body, received at, detected customer, detected BL, detected containers, classification, linked job, processing status.

### 11.1 Extracted field envelope

Every extracted field carries four values, not one:

```
Container Number
    value:        ABCU1234567
    source:       NOA.pdf
    confidence:   99%
    timestamp:    2026-08-17T09:03:12Z
```

### 11.2 Matching priority

**Import**

```
1  Job Number
2  Container Number
3  BL Number
4  House BL
5  Customer Reference
6  Customer + Vessel + ETA
```

**Export**

```
1  Job Number
2  Container Number
3  Booking Reference
4  Export Clearance Reference
5  Customer + Vessel + ETA
```

### 11.3 Outcomes

```
AUTO-MATCH         exactly one strong match, attached automatically
REVIEW REQUIRED    several candidates, or confidence below threshold
UNMATCHED          no match, held in the Inbox, never guessed onto a job
```

Automation must not force uncertain matches. An unmatched email beyond a configured age raises an exception.

### 11.4 Export-specific safety rules

1. **VGM and container-ready confirmations may be matched on container number or job number only.** A booking reference is shared across jobs often enough that a customer reference alone is not sufficient evidence to record a VGM.
2. **An extracted VGM never overwrites an existing VGM.** A conflicting value raises a discrepancy, per Section 12.

### 11.5 Idempotency

Email automation must be idempotent. Processing the same email twice must not create duplicate jobs, documents, containers, movements or events. Use the external message ID and attachment hashes.

## 12. Extraction Safety and Discrepancies

**Extracted information must never silently overwrite critical operational information.**

Critical fields: container number, BL number, permit number, ETA, delivery address, carrier, empty return yard, free time, VGM, booking reference, export clearance reference.

Where an extracted value conflicts with a stored one, the system raises a discrepancy and leaves the stored value in place:

```
Existing ETA        17 Aug 2026
New NOA ETA         18 Aug 2026
Status              REVIEW REQUIRED
```

The controller decides which value becomes current, and that decision is audited.

## 13. Audit and Events

Every material change is auditable. One audit stream serves both domains.

| Field | Notes |
|---|---|
| `event` | Event type |
| `entity_type` | Job, container, movement, document, exception |
| `entity_id` | The record affected |
| `field` | Where a field changed |
| `previous_value` | Prior value |
| `new_value` | New value |
| `actor` | Named user, or `System` with the triggering rule named |
| `source` | `USER` / `EMAIL_AUTOMATION` / `AI_EXTRACTION` / `SYSTEM_RULE` / `API` |
| `created_at` | Immutable timestamp |

**System-generated changes must name the rule that produced them.** "System set status to Awaiting T/T" is not sufficient. "System set status to Awaiting T/T. Rule 13, VGM received and transhipment pending" is auditable.

**Minimum recorded events**

Job created · job completed · job reopened · mandatory field changed · permit received · Portnet released · CMS completed · movement created, manual or automatic with its trigger · movement scheduled · movement assigned · movement collected · movement delivered · movement completed · movement cancelled with reason · container number, seal number, tare weight entered · container details emailed to customer · customer confirmed container ready · VGM received · transhipment status changed · carpark requested · empty returned · document attached · document superseded · discrepancy raised · discrepancy resolved · exception raised · exception resolved · manual status override · gate override

Critical audit events cannot be deleted or edited by standard users.

**Activity timeline.** Each job renders its audit stream as a chronological narrative on the detail screen. The audit log answers *who* and *when*. The movement history in Section 51 answers *what*.

**Notes.** Users may add operational notes, each carrying author, timestamp and message. Notes cannot be silently edited; where editing is permitted, revision history remains available.

### 13.1 The date amendment log

> **New in 2.1d.** Operations asked for a log sheet on date changes. The audit stream above already records that a date changed and who changed it. It has nowhere to record **why**, and why is the entire content of the conversation a controller has when the customer calls.

Dates move constantly. A delivery date shifts because the vessel is late, because Portnet now shows a different ETA, because the customer asked, or because we rescheduled. Date amendments are therefore a **first-class, visible log on the record**, not a filtered view of the audit stream.

| Field | Notes |
|---|---|
| `amendment_id` | UUID |
| `entity_type` / `entity_id` | The job, container or movement affected |
| `date_field` | Which date. See below |
| `previous_value` | The date before |
| `new_value` | The date after |
| `reason_code` | Mandatory, from the list below |
| `reason_note` | Free text. Mandatory where `reason_code` is `OTHER` |
| `amended_by` | Named user, never a shared account |
| `amended_at` | Immutable timestamp |
| `sequence` | 1, 2, 3, within the same date field |

**Dates covered**

```
planned_date, planned_time      any movement
delivery_date                   the date promised to the customer
vessel_eta                      as reflected in Portnet
truck_in_date, truck_out_date   the yard window, per §38.1
empty_return_due_date
```

**Reason codes**

| Code | Meaning |
|---|---|
| `CUSTOMER_REQUEST` | The customer asked |
| `VESSEL_DELAY` | Vessel or voyage running late |
| `VESSEL_EARLY` | Vessel or voyage running early |
| `PORTNET_ETA_CHANGE` | Portnet now shows a different ETA |
| `YARD_WINDOW_CHANGE` | The truck-in or truck-out window moved |
| `CUSTOMER_NO_SPACE` | The customer cannot receive on the original date |
| `EQUIPMENT` | No chassis, truck or driver available |
| `INTERNAL_RESCHEDULE` | Our own operational decision |
| `OTHER` | Requires `reason_note` |

#### 13.1.1 How it renders

Plainly, in the order it happened, on the job and container detail screens.

```
DELIVERY DATE HISTORY               EXP-260818-004    C1

Original                            28 Aug 2026

27 Aug    Winnie       to 29 Aug    Customer request
28 Aug    Brandon      to 31 Aug    Vessel delay
                                    ONE Splendour v.114E pushed 2 days
30 Aug    Winnie       to 01 Sep    Portnet ETA change

Current                             1 Sep 2026        3 amendments
```

A controller picking the job up mid-week reads that in five seconds. The same history reconstructed from the audit stream takes several minutes and loses every reason, because the audit stream has nowhere to put them.

#### 13.1.2 Rules

1. **A date field cannot be changed without a `reason_code`.** Enforced server-side, not by the form.
2. **Amendments are never edited or deleted.** A wrong entry is corrected by a further amendment.
3. The original value stays visible alongside the current one.
4. `amendment_count` is stored per date field and is available to the queues and reports.
5. Every amendment also writes an ordinary audit event per §13. The two are not alternatives; the audit stream is the legal record and the amendment log is the operational one.

#### 13.1.3 Churn is a signal, not noise

A container rescheduled five times is telling the operation something, whether about a customer, a carrier or a lane. Where `amendment_count` on a single date field passes the configured threshold, the system raises a *Date churn* exception at Low severity.

The point is not to stop the amendments. Amendments are normal and the operation runs on them. The point is to make visible a pattern that currently lives only in a controller's memory.

Reported per customer and per carrier, `amendment_count` is one of the few measures in this system that quantifies **disruption** rather than delay. A customer who moves every date twice is more expensive to serve than one who never does, and nothing in the operation currently says so.

## 14. Non-functional Requirements

### 14.1 Security

Role-based access. Secure session management. Encrypted traffic. Private document storage with signed, authorised URLs. Audit logging. User access revocation. **Server-side permission validation. Never rely solely on frontend checks.**

### 14.2 File security

Files not publicly accessible. Authenticated access required. Randomised storage IDs. File type and size validation. Malware scanning where practical. Download events optionally auditable.

### 14.3 Performance

```
Dashboard initial load        < 3 seconds
Container search              < 1 second preferred
Job search                    < 1 second preferred
Page navigation               < 2 seconds
Table filtering               near-instant once data is loaded
```

Large tables use pagination or virtualisation.

### 14.4 Reliability and error handling

Automation failures must never disappear silently. Failed processing creates an observable event and an exception record:

```
Email Processing Failed
Email      NOA Customer ABC
Reason     Unable to extract PDF text
Action     Manual review required
```

**Logged events:** email received, email processed, extraction started, extraction completed, extraction failed, job created, job matched, document attached, status changed, movement created, movement status changed, release changed, override performed, exception created, exception resolved. Logs must carry IDs sufficient for debugging.

### 14.5 Time and dates

Store timestamps in UTC. Display in the local operational timezone, defaulting to `Asia/Singapore`. Timezone must eventually be configurable.

## 15. Navigation, Search and UI Conventions

### 15.1 Navigation

```
Dashboard

Inbox                        Import Jobs           Export Jobs
Container Tracker            Incomplete Queue      Action Required
Exception Queue              Transport Schedule    Documents
Completed Jobs

Reports
Master Data                  Settings
```

Navigation shows counters where relevant:

```
Incomplete Queue      7
Action Required      19
Exception Queue       4
Inbox Review          3
```

Every screen answers exactly one question. Dashboard: what needs attention right now. Inbox: what arrived and did not process cleanly. Incomplete: what information is missing. Action Required: what must someone do next. Exception: what needs human intervention. Trackers: what are we handling, and where is each container. Schedule: what moves today. Documents: what evidence do we hold.

### 15.2 Search

Global search accepts a job number, container number, seal number, BL, house BL, booking reference, export clearance reference, permit number, customer, shipper, vessel or voyage, and returns matching jobs, containers, movements, documents and emails.

**Search results span both domains, with the domain indicated on each row.** A controller searching a container number does not know, and should not need to know, which module it belongs to.

Exact container searches must return instantly.

### 15.3 Filters and sorting

Trackers support multiple simultaneous filters, customer, controller, carrier, domain, job status, movement status, CMS status, transhipment status, movement type, yard, terminal, carpark presence, priority, ETA, and date ranges, with a single action to clear all.

Sortable: ETA, LFD, created date, priority, customer, status, collection time, delivery time, days remaining, condition age, required-by date.

### 15.4 Export

Filtered table views export to CSV and Excel. Export respects active filters. PDF reporting may be added later.

### 15.5 Responsive targets

```
Desktop      1440px+      primary
Laptop       1280px+      primary
Tablet                    usable
Mobile                    read-only status access initially
```

### 15.6 UI principles

Operational clarity, speed, dense but readable information, minimal clicks, clear exception visibility, searchability, consistent statuses, strong visual hierarchy.

Avoid decorative UI. This is an operations control system.

**Colour is never the sole signal.** Risk colours always accompany a text status.

**Every count is a filter.** A number that cannot be clicked through to its underlying records is not useful to a controller.

---

# Chapter B: Movement and Status Engine

This chapter specifies the engine that drives both trade directions. It adds no business domain. It adds the behaviour that turns stored records into the three derived values in Section 3.

Nothing in this chapter is import-specific or export-specific. Where a domain needs a different rule table, the domain chapter supplies it and references back here.

## 16. The Operating Model

The system operates on a derivation chain, not as a static job tracker.

```
JOB            What shipment, and for whom                          STORED
CONTAINER      Which box, seal, tare, VGM                           STORED
MOVEMENT       Which journey, from where to where, in what state    STORED
MILESTONE      What has demonstrably happened                       DERIVED
EXCEPTION      What is wrong or overdue                             DERIVED
NEXT ACTION    What a human must now do                             DERIVED
```

Each layer derives from the one above it. A tracker that stores only the job and lets users type a status has no way to compute the bottom three layers, which is the entire value of the system.

**The bottom three are the product. They are also the three things no user may ever type.**

## 17. Movement Record

> **This section resolves the largest conflict in the previous edition.** Edition 1.0 carried two competing models: import tracked physical movement as a status on the container, while export tracked it as a first-class movement record. One platform cannot hold two movement models. This edition uses the movement record for both domains. Import gains movements; the container keeps identity, cargo detail and free-time exposure, and its status becomes derived rather than stored.

Each physical truck journey exists as its own record.

| Field | Type | Notes |
|---|---|---|
| `movement_id` | UUID | Primary key |
| `movement_ref` | Text | Display reference, `MOV-NNN`, scoped to the job |
| `job_id` | FK | Parent job, required |
| `job_domain` | Enum | `IMPORT` or `EXPORT` |
| `job_number` | Text | Denormalised for display and search |
| `container_id` | FK, nullable | The container on this movement. Both domains. Null on `EMPTY_COLLECTION` until identity is captured |
| `container_number` | Text, nullable | Denormalised copy for display and search |
| `secondary_container_id` | FK, nullable | **Double mounting only.** The second container on the same chassis. See §19.1 |
| `is_double_mounted` | Boolean | True where `secondary_container_id` is set |
| `movement_type` | Enum | Section 19 |
| `cargo_state` | Enum | `EMPTY` / `PART_LADEN` / `LADEN`, derived from movement type. `PART_LADEN` applies only to multi-stop stuffing, §46.3 |
| `origin_type` | Enum | `YARD` / `CUSTOMER` / `CARPARK` / `PORT` / `TERMINAL` |
| `origin` | FK or address | Required |
| `destination_type` | Enum | As above |
| `destination` | FK or address | Required |
| `planned_date` | Date | Required before `SCHEDULED` |
| `planned_time` | Time | Optional |
| `truck` | FK, nullable | Required before `ASSIGNED` |
| `driver` | FK, nullable | Required before `ASSIGNED` |
| `chassis_id` | FK, nullable | Inherited from the job, not chosen per trip. See §35 |
| `movement_status` | Enum | Section 20 |
| `actual_collection_at` | Timestamp | Set on `COLLECTED` |
| `actual_delivery_at` | Timestamp | Set on `DELIVERED` |
| `standby_required` | Boolean | Copied from the job. See §21.3 |
| `standby_started_at` / `standby_ended_at` | Timestamp | Set on entering and leaving `ON_STANDBY` |
| `standby_minutes` | Derived | Never typed |
| `auto_created` | Boolean | True when created by the engine in Section 22 |
| `cancelled_reason` | Text, nullable | Mandatory on cancellation |
| `remarks` | Text | Optional |
| `created_by` / `created_at` | System | Records whether system or user created it |
| `updated_by` / `updated_at` | System | |

**`container_number` on the movement is a reference, not the source of truth.** The authoritative container identity lives on the container record, in `containers` for import and `export_containers` for export, per §38.2. When a container number is captured, the system backfills it onto every movement carrying that `container_id` and not already holding one.

> **Changed in 2.1.** Edition 2.0 said `container_id` applied to import only, because an export job was assumed to hold one container. Export now has containers too, so the field serves both domains identically. This is the change edition 2.0 anticipated in its own forward-compatibility note; no movement migration is required, exactly as predicted.

### 17.1 A movement may carry two containers

> **New in 2.1.** Double mounting was not specified in any previous edition.

Where two twenty-foot containers travel on one forty-foot chassis, that is **one movement carrying two containers**, not two movements. One truck, one driver, one chassis, one journey, two boxes.

`container_id` holds the first, `secondary_container_id` holds the second, and `is_double_mounted` is set. Both containers must belong to the same job and share the same origin and destination. §19.1 states the constraints.

The alternative, two movements sharing a truck, was rejected: it would double the trip count on the transport schedule, double-count chassis engagement, and make the driver appear to be in two places at once.

**Truck and driver belong to the trip. Chassis does not.** A prime mover hitches, moves, unhitches and goes elsewhere, so it is assigned per movement. The chassis stays under the container for the entire job, so it is assigned once at the job level and every movement inherits it. Section 35 specifies this, and it is the reason `chassis_id` on the movement is a copy for reporting rather than an independent assignment.

## 18. Movement Identity

Two identifiers, for two audiences.

```
movement_id     UUID        machine identity, primary key, immutable
movement_ref    MOV-001     human identity, unique within the job
```

`movement_ref` restarts at `MOV-001` for each job. A controller says "MOV-002 is late," not a UUID.

**`movement_ref` is assigned at creation and is never reused within a job, including after cancellation.** A cancelled `MOV-002` means the next movement is `MOV-003`, not a replacement `MOV-002`.

There is no separate `sequence_number`. Edition 1.0 carried both, which diverge the moment a movement is cancelled, `movement_ref` skips and a sequence counter does not. Display order is `movement_ref` ascending; `created_at` breaks any tie.

## 19. Movement Types

Canonical. Stored as an enum, never inferred from origin and destination at read time.

| Enum | Display | Domain | Route | Cargo | Applies when |
|---|---|---|---|---|---|
| `IMPORT_DELIVERY` | Import Delivery | Import | Port / Terminal → Customer | Laden | Collection eligibility has passed |
| `EMPTY_RETURN` | Empty Return | Import | Customer → Empty Return Yard | Empty | The laden container has been delivered |
| `EMPTY_COLLECTION` | Empty Collection | Export | Empty Collection Yard → Customer / Shipper | Empty | The empty collection gate has passed |
| `DIRECT_LADEN_TO_PORT` | Direct Laden to Port | Export | Customer / Shipper → Port | Laden | Container ready, VGM received, transhipment available |
| `ONE_WAY_LOADED` | One-Way Loaded | Export | Customer / Shipper → Company Carpark | Laden | Container ready, VGM received, transhipment not available, carpark requested |
| `CARPARK_TO_PORT` | Carpark to Port | Export | Company Carpark → Port | Laden | The container is at the carpark and transhipment has become available |
| `IMPORT_TO_CARPARK` | Import to Carpark | Import | Port / Terminal → Company Carpark | Laden | **New in 2.1.** The customer has no space, or the controller positions the container. §36.2 |
| `CARPARK_TO_CUSTOMER` | Carpark to Customer | Import | Company Carpark → Customer | Laden | **New in 2.1.** The customer can now receive it. §36.2 |
| `LADEN_SITE_TO_SITE` | Stuffing Transfer | Export | Customer → Customer | Part laden | **New in 2.1.** Stuffing continues at a second location. §46.3 |

Enum identifiers are `SCREAMING_SNAKE_CASE` and are what the API and database use. Display names are what a controller sees. Edition 1.0 used two different naming conventions for the same values across Parts II and III, one of which was not a valid identifier.

`ONE_WAY_LOADED` is the type that makes a movement separately billable and separately reportable. Inference from origin and destination would lose that, which is why the type is stored.

An `IMPORT_DELIVERY` movement collects at the port and delivers at the customer. It is one journey with two timestamps, not two movements.

`LADEN_SITE_TO_SITE` carries `cargo_state = PART_LADEN`, because the container holds cargo but stuffing is not finished. This matters: a part-laden container has no VGM, is not ready, and must not satisfy the laden gate in §44.2.

### 19.1 Double mounting constraints

A movement may carry two containers only where **all** of the following hold. The system validates each.

| Constraint | Rule |
|---|---|
| Chassis size | Only a `40FT` chassis. Two twenty-foot containers. |
| Same job | Both containers belong to the same job. Never two customers, never two jobs. |
| Same route | Identical origin and destination. |
| Combined weight | Sum of both containers' gross weights must not exceed the chassis `max_gross_weight_kg`. |
| Site permission | Both origin and destination must have `double_mounting_permitted = true`, per §9.3. |

Where any constraint fails, the system refuses the double mount and offers two separate movements instead. This is a **hard rule, not a warning**, because unlike chassis availability in §35.4 the consequence is a physically unsafe or undeliverable load rather than a scheduling inconvenience.

Double mounting is a controller decision, not an automatic optimisation. The system never combines two movements on its own.

## 20. Movement Statuses and Transitions

Movement status is a controlled value. Free-text movement status must not be possible anywhere in the system.

| Status | Meaning |
|---|---|
| `PENDING` | Created, not yet actionable or not yet planned |
| `READY_FOR_SCHEDULING` | Prerequisites met, awaiting a planned date |
| `SCHEDULED` | Planned date set |
| `ASSIGNED` | Truck and driver assigned |
| `COLLECTED` | Picked up from origin |
| `IN_TRANSIT` | On the road |
| `DELIVERED` | Arrived at destination |
| `ON_STANDBY` | Arrived, and the truck and driver are held at the site by customer instruction. §21.3 |
| `COMPLETED` | Delivered and all required capture done |
| `ON_HOLD` | Deliberately paused, reason required |
| `CANCELLED` | Will not occur, reason required, record retained |
| `EXCEPTION` | Something is wrong, requires intervention |

**Permitted transitions**

```
PENDING               ->  READY_FOR_SCHEDULING | CANCELLED | ON_HOLD
READY_FOR_SCHEDULING  ->  SCHEDULED | CANCELLED | ON_HOLD
SCHEDULED             ->  ASSIGNED | COLLECTED | CANCELLED | ON_HOLD
ASSIGNED              ->  COLLECTED | CANCELLED | ON_HOLD
COLLECTED             ->  IN_TRANSIT | DELIVERED | EXCEPTION
IN_TRANSIT            ->  DELIVERED | EXCEPTION
DELIVERED             ->  ON_STANDBY | COMPLETED | EXCEPTION
ON_STANDBY            ->  COMPLETED | EXCEPTION
COMPLETED             ->  terminal
CANCELLED             ->  terminal
ON_HOLD               ->  returns to the status it was held from
EXCEPTION             ->  returns to the status it was raised from, once resolved
```

`ASSIGNED` may be skipped where the company does not allocate a named driver in advance. It must not be mandatory in the state machine.

**`DELIVERED` and `COMPLETED` are deliberately distinct.** An `EMPTY_COLLECTION` movement is `DELIVERED` when the truck leaves the customer, but it cannot be `COMPLETED` until container number, seal number and tare weight have been captured. An `IMPORT_DELIVERY` movement is `DELIVERED` on arrival but cannot be `COMPLETED` without proof of delivery.

`ON_STANDBY` is reachable only where `standby_required` is set on the movement. It is entered on arrival and left when the driver is released. See §21.3.

**A movement cannot skip from `SCHEDULED` to `DELIVERED`.** If a controller records a delivery for a movement never marked collected, the system sets `COLLECTED` with an inferred timestamp and writes an audit note. Silent gaps in a movement history are worse than an inferred value that is labelled as inferred.

## 21. Scheduling and the Placeholder Rule

Scheduling is the act that makes a movement operationally real.

To reach `SCHEDULED` the system requires a planned date, a confirmed origin and a confirmed destination, addresses resolved against master data, not free text where a master record exists. Planned time is optional but recommended for port cut-off work. Truck and driver are required only to reach `ASSIGNED`.

> **The placeholder rule.** A movement in `PENDING` does not exist operationally. It must not appear on the transport schedule, in movement counts, in driver-facing views, or in any dashboard figure describing planned work.

A movement becomes operationally real at `READY_FOR_SCHEDULING`, which requires a human to confirm it, or `SCHEDULED`, which requires a planned date.

The transport schedule shows movements in `SCHEDULED`, `ASSIGNED`, `COLLECTED` and `IN_TRANSIT`. It must not show `PENDING`.

A scheduled movement whose planned time has passed without progressing to `COLLECTED` raises the overdue exception in Section 27.

### 21.3 Standby

> **New in 2.1c.** Not specified in any previous edition.

**Standby is a customer instruction that the truck and driver remain at the site rather than dropping the container and leaving.** The customer stuffs or unstuffs while the vehicle waits, and the same truck departs afterwards.

It is declared by the customer and is **recorded, never inferred**. The system cannot detect standby from timestamps, because a truck that arrives and leaves four hours later looks identical whether it waited by arrangement or was simply delayed.

**Standby is the fourth clock.**

| Clock | Whose asset | Held by | Specified in |
|---|---|---|---|
| Demurrage | Carrier's container at the port | Us | §34 |
| Detention | Carrier's container held by us | Us | §34 |
| Chassis occupancy | Our chassis | A customer | §35 |
| **Standby** | **Our truck and driver** | **A customer** | **This section** |

The distinction from chassis occupancy is the reason standby needs separate treatment. A chassis under a container at a customer for six days costs us one chassis. **A truck and driver held for six hours costs us a truck, a driver, and every other job that vehicle could have run that day.** It is a far more expensive hour than a chassis day, and it is currently invisible.

#### 21.3.1 What is recorded

Declared on the job, copied to the movement:

| Field | Notes |
|---|---|
| `standby_required` | Set from the customer instruction |
| `standby_instruction_source` | `BOOKING` / `EMAIL` / `PHONE` / `MANUAL` |
| `standby_expected_minutes` | Where the customer indicates a duration. Optional |

Captured on the movement as it happens:

| Field | Notes |
|---|---|
| `standby_started_at` | Set on entering `ON_STANDBY`, normally on arrival |
| `standby_ended_at` | Set when the driver is released |
| `standby_minutes` | Derived, never typed |
| `standby_released_by` | Who recorded the release |

`standby_minutes` is a system-calculated field per §56. A standby duration a controller can type is one that will be rounded, forgotten, or reconstructed from memory the following day.

#### 21.3.2 Effect on scheduling

**A truck and driver on standby are not available for other work.** The transport schedule must treat an `ON_STANDBY` movement as occupying its truck for the whole period, exactly as it treats `IN_TRANSIT`. Otherwise the vehicle appears free and is double-booked.

Where `standby_expected_minutes` is known, the scheduler blocks that time in advance. Where it is not, the vehicle is blocked from arrival until release, and the truck's remaining capacity that day is genuinely unknown until the driver is let go. The schedule shows that as open-ended rather than guessing a figure.

**Standby stops no other clock.** Demurrage, detention and chassis occupancy all continue to run. Standby is an additional cost layered on top, never a substitute.

#### 21.3.3 Waiting on

During standby the job is `waiting_on = CUSTOMER` per §25.2, with the blocking reason naming the standby.

This wants care in the queue. We are waiting on the customer, but unlike every other customer wait in the system, **our own vehicle is burning while we wait.** Active standby should sort above ordinary customer waits in the Action Required queue, because the cost of inaction accrues by the minute rather than by the day.

#### 21.3.4 Why it is recorded when billing is out of scope

The same reason `ONE_WAY_LOADED` is a stored movement type in §19 rather than an inference: **a cost that is never measured can never be recovered, and adding the measurement later loses the history.**

Standby is very likely already happening, already costing money, and already absorbed. The first release does not bill for it. It counts it and reports it per customer, so that a customer whose standby routinely runs long becomes visible as an equipment and labour cost rather than as a vague sense that their jobs are difficult.

## 22. Automatic Movement Creation

Where the next expected movement is unambiguous, the system creates it rather than waiting for a controller to do so.

| Trigger | Movement created | Origin | Destination |
|---|---|---|---|
| Import job becomes Ready for Collection | `IMPORT_DELIVERY` | Terminal | Delivery address |
| `IMPORT_DELIVERY` reaches `COMPLETED` | `EMPTY_RETURN` | Delivery address | Empty return yard |
| Export job becomes Ready for Empty Collection | `EMPTY_COLLECTION` | Empty collection yard | Customer / shipper address |
| Container ready, VGM received, transhipment available | `DIRECT_LADEN_TO_PORT` | Customer | Port |
| Container ready, VGM received, transhipment not available, carpark requested | `ONE_WAY_LOADED` | Customer | Company carpark |
| Container at carpark and transhipment becomes available | `CARPARK_TO_PORT` | Company carpark | Port |

**Created automatically but held, new in 2.1:**

| Trigger | Movement created | Held until |
|---|---|---|
| `IMPORT_DELIVERY` or `CARPARK_TO_CUSTOMER` reaches `COMPLETED` | `EMPTY_RETURN` | The customer confirms the container is empty, per §36.3 |

**Never created automatically, new in 2.1:**

| Movement | Why it must be manual |
|---|---|
| `IMPORT_TO_CARPARK` | The trigger is a customer having no space or a controller decision. Neither is observable by the system |
| `CARPARK_TO_CUSTOMER` | The trigger is the customer becoming able to receive the container |
| `LADEN_SITE_TO_SITE` | The trigger is a customer stuffing arrangement that varies per booking |

These three are manual **by design, not by omission.** Each depends on a fact established outside the system, and §5 of the operating model is explicit that where the system cannot establish a fact reliably it records who established it rather than deriving it badly.

An auto-created movement:

- is created in `PENDING`
- carries `auto_created = true`
- carries no planned date, truck or driver
- writes an audit event naming the trigger that created it

**The engine must never create a movement whose trigger condition is not yet true. Anticipation is not automation.**

Automatic creation at the moment the trigger fires, into a state invisible to planning, is what allows the system to prepare work without polluting the schedule with movements nobody can yet plan.

## 23. Duplicate Prevention, Manual Creation and Override

### 23.1 Duplicate prevention

> A new movement is rejected if an existing movement for the same job has the same `movement_type` **and** a status that is neither `CANCELLED` nor `COMPLETED`.

Enforced in the service layer, not guarded only in the interface. Both the automatic creation engine and a manual create action pass through it.

An administrator may override with a mandatory reason, which writes an audit event. A legitimate case exists: a laden collection attempted, aborted at the customer's gate, and re-run as a second movement rather than as an edit to the first.

**A cancelled movement never blocks creation.** This is what makes an aborted trip recoverable without editing history.

### 23.2 Manual creation

Controllers must be able to create a movement manually. Automatic creation is a convenience, not a constraint.

Manual creation is subject to the same gates. An `EMPTY_COLLECTION` movement cannot be created while the empty collection gate is failing. No laden movement can be created while the laden gate is failing. No `IMPORT_DELIVERY` movement can be created while collection eligibility is false. The duplicate rule applies.

## 24. Current Container Location

The system derives and displays where the container physically is.

| Value | Derived from |
|---|---|
| Terminal / Port of discharge | Import, no movement collected yet |
| Empty Collection Yard | Export, no movement collected yet |
| In Transit to Customer | `IMPORT_DELIVERY` or `EMPTY_COLLECTION` is `COLLECTED` or `IN_TRANSIT` |
| Customer / Shipper | `IMPORT_DELIVERY` or `EMPTY_COLLECTION` is `DELIVERED` or `COMPLETED`, no onward movement collected |
| In Transit to Carpark | `ONE_WAY_LOADED` is `COLLECTED` or `IN_TRANSIT` |
| Company Carpark | `ONE_WAY_LOADED` is `DELIVERED` or `COMPLETED`, no onward movement collected |
| In Transit to Port | `DIRECT_LADEN_TO_PORT` or `CARPARK_TO_PORT` is `COLLECTED` or `IN_TRANSIT` |
| Port | A port-delivery movement is `DELIVERED` or `COMPLETED` |
| In Transit to Return Yard | `EMPTY_RETURN` is `COLLECTED` or `IN_TRANSIT` |
| Empty Returned | `EMPTY_RETURN` is `DELIVERED` or `COMPLETED` |
| Unknown / Exception | Movement records are contradictory or missing |

**Location is derived from the most recently progressed movement, never stored.** If a controller edits a movement backwards, the location recomputes.

A stored location drifts. Someone corrects a movement, forgets the location field, and the tracker lies from then on. Deriving it means the location is always exactly as truthful as the movement records, and no more.

**`Unknown / Exception` raises an exception at Critical severity rather than displaying quietly.** A container whose location cannot be determined is an operational problem, not a display problem.

## 25. The Next Action Engine

> **This section resolves the second structural conflict in the previous edition.** Edition 1.0 carried two next-action engines: a flat list producing a `next_action` string for import, and a precedence-driven engine producing three values for export. This edition has one engine with two rule tables.

The engine takes three inputs and produces three outputs.

```
INPUTS
    job milestones        permit, Portnet, CMS, container details, ready, VGM, transhipment
    movement records      type, status, timestamps
    configuration         thresholds, deadlines, mandatory field set

OUTPUTS
    next_action_required  what a human must do next
    blocking_reason       why the job cannot progress without it
    waiting_on            us, the customer, or the carrier
```

`blocking_reason` exists so that the queue can explain itself. *"Obtain VGM"* is the action. *"Customer confirmed ready on 14 Aug, VGM not received in 4 days"* is the reason. A controller chasing a customer needs both.

Domain rule tables are in Sections 37 and 47. Every row in each must be traceable to a stored condition. **If a next action cannot be derived from stored data, it is not a next action, it is a note.**

### 25.1 Precedence

Several conditions can be true at once. The engine returns exactly one `next_action_required`, chosen by this ladder:

```
1  Deadline risk        LFD today or passed; vessel closing at risk
2  Overdue movement     planned time passed, movement not progressed
3  Internal blocker     something we control: permit chasing, CMS, capture, scheduling
4  External blocker     something the customer or carrier controls
5  Routine next step    the normal progression
6  No action            progressing normally, nothing due
```

**Internal blockers outrank external ones deliberately.** If a job is waiting on a customer for VGM and also waiting on us to schedule a movement, show our task. It is the one the controller can act on now.

### 25.2 Waiting on

```
US          an internal task is outstanding
CUSTOMER    stuffing, ready confirmation, VGM, carpark decision, delivery address
CARRIER     transhipment availability, booking amendment, permit or release upstream
NOBODY      progressing normally, no outstanding dependency
```

This single field makes the Action Required queue filterable in the way controllers actually work. *"Show me everything waiting on us"* is the first thing anyone will ask of this screen, and it cannot be answered by parsing action text.

## 26. The Three Queues

The system needs three queues, not one. They answer different questions, and merging them produces a list nobody trusts.

| Queue | Question | Typical owner |
|---|---|---|
| **Incomplete** | What information is missing before this job can start? | Controller, data entry |
| **Action Required** | What must someone do next on this job? | Controller, operational |
| **Exception** | What has gone wrong or is overdue? | Controller and manager |

All three serve both domains, with a domain filter.

A job can appear in more than one, and often does. A job missing its delivery address is Incomplete. The same job, once complete but with an unscheduled collection, is Action Required. The same job, if that collection is three days overdue, is also an Exception.

### 26.1 Incomplete queue

Populated automatically by the mandatory field engine. Columns: job number, domain, customer, container (blank until captured), missing information as a derived list, gate status, required action, age since job creation, assigned controller.

Priority ordering places jobs closest to a deadline at the top, then jobs blocked longest.

**No manual queue management.** A job enters when a mandatory field becomes incomplete and leaves when it is satisfied.

### 26.2 Action Required queue

The controller's default working screen. Populated from `next_action_required`.

| Column | Source |
|---|---|
| Job Number | Job |
| Container Number | Job or container, if available |
| Customer | Job |
| Current Job Status | Derived, Sections 32 and 45 |
| Current Location | Derived, Section 24 |
| Issue / blocking reason | Derived, Section 25 |
| Next Action Required | Derived, Sections 37 and 47 |
| Waiting On | Derived, Section 25.2 |
| Required By | Deadline, where applicable |
| Assigned Controller | Job |
| Age | Time since the condition was first detected |

**Default sort is precedence, then age descending. Sorting by job number must not be the default.** A queue sorted by identifier is a list. A queue sorted by urgency is a work plan.

### 26.3 Exception queue

Specified in Section 27.

### 26.4 Age and deadlines

Two different clocks, which the system must not confuse.

```
AGE           how long this condition has existed
              measured from detection, not from job creation

REQUIRED BY   when this must be done
              derived from LFD or vessel closing time where known,
              otherwise from the configured threshold
```

**Age drives escalation. Required By drives ordering.** A three-day-old issue on a vessel closing next week is less urgent than a two-hour-old issue on a vessel closing tonight, and the queue must reflect that.

Where a deadline is not known, the system must not invent one. It orders by age and marks the deadline as unknown.

## 27. Exceptions

An exception is a condition that has gone wrong or is overdue, as distinct from a normal step that has not yet happened.

### 27.1 Exception record

One shape, serving both domains.

| Field | Notes |
|---|---|
| `exception_id` | UUID |
| `job_id` | Parent job, required |
| `job_domain` | `IMPORT` or `EXPORT` |
| `container_id` | Nullable |
| `movement_id` | Nullable, where movement-specific |
| `exception_type` | Section 27.2 |
| `severity` | Low / Medium / High / Critical |
| `description` | Derived or entered |
| `blocking` | Whether it prevents progression |
| `action_required` | Derived or entered |
| `waiting_on` | Us / Customer / Carrier |
| `assigned_to` | User, nullable |
| `detected_at` | When the system first detected it |
| `required_by` | Deadline, where applicable |
| `resolved_at` / `resolved_by` / `resolution_note` | Set on resolution |

**Exceptions are records, not flags.** They are opened, they age, and they are closed with a note. A resolved exception remains readable, because the pattern of resolved exceptions is what tells management where the process leaks.

### 27.2 Exception types

**Shared**

| Exception | Trigger | Severity |
|---|---|---|
| Movement overdue | Planned time passed, movement not `COLLECTED` | High |
| Movement stalled | `COLLECTED` or `IN_TRANSIT` beyond expected duration | Medium |
| Location unknown | Movement records contradictory, per Section 24 | Critical |
| Duplicate movement blocked | Creation attempt rejected by Section 23.1 | Low |
| Document conflict | Extracted value conflicts with a stored critical field | Medium |
| Email unmatched | Inbound email could not be matched beyond threshold | Low |
| Extraction failure | Document could not be parsed | Low |
| Gate overridden | An administrator bypassed a gate | Medium |
| Delivery address disputed | Address changed after scheduling | Medium |
| Customer change | Customer changed after job creation | Medium |
| Job cancelled downstream | Delivery or booking cancelled after movements exist | Medium |

**Import**

| Exception | Trigger | Severity |
|---|---|---|
| Permit missing | Permit required, not received, ETA within threshold | High |
| Permit rejected | Permit returned as rejected | Critical |
| Portnet release missing | Release not confirmed, ETA within threshold | High |
| ETA changed | Extracted ETA differs from stored ETA | Medium |
| Container number changed | Extracted container differs from stored | High |
| Duplicate container | Container active on another open job | High |
| LFD risk | Demurrage or detention LFD within threshold | High |
| LFD passed | Demurrage or detention LFD passed | Critical |
| Collection missed | Scheduled collection date passed, not collected | High |
| Delivery overdue | Delivered date passed without POD | Medium |
| Empty return overdue | Delivered beyond threshold, empty not returned | High |

**Export**

| Exception | Trigger | Severity |
|---|---|---|
| Empty delivered without container details | `EMPTY_COLLECTION` `DELIVERED`, container number null beyond threshold | High |
| Container details not sent | Details captured, not sent beyond threshold | Medium |
| Stuffing overdue | Awaiting Customer Stuffing beyond threshold | Medium |
| VGM overdue | Container Ready beyond threshold, VGM null | Medium |
| VGM implausible | VGM at or below tare weight | High |
| Transhipment unresolved | Transhipment `PENDING` beyond threshold | Medium |
| Carpark dwell exceeded | At carpark beyond configured days | High |
| Vessel closing at risk | Closing time approaching, container not at port | Critical |

All thresholds are configurable per customer or globally, and must not be hard-coded.

### 27.3 Job closure

A job is Completed when, and only when:

1. All required final movements exist, for import, `IMPORT_DELIVERY` and `EMPTY_RETURN` where applicable, for every container on the job; for export, a port-delivery movement
2. Those movements are `COMPLETED`
3. No blocking exception is open
4. All mandatory post-delivery capture is present

**Completing a movement must never close the job by itself.** This is the single most likely defect in a naive implementation, because completing the last movement feels like completing the job. It is not the same test.

For import, a job with three containers where one is delivered and two are not is not complete, and Section 33 specifies what it shows instead.

Reopening a completed job requires administrator permission, a reason and an audit event.

### 27.2A Exceptions added in edition 2.1

| Exception | Trigger | Severity | Waiting on |
|---|---|---|---|
| Empty ready not confirmed | Import delivery completed beyond threshold, no empty-ready confirmation | High | Customer |
| Import carpark dwell exceeded | Laden import at the company carpark beyond threshold | High | Depends on `carpark_reason` |
| Portnet not processed | `portnet_processed` is `PENDING` or `FAILED` beyond threshold | Medium | Carrier |
| Free time basis mismatch | Internal ETA count and carrier count differ beyond tolerance | Low | Us |
| Past internal free time target | Internal LFD reached, carrier LFD not yet reached | Medium | Us |
| Charge risk | Carrier LFD within the configured warning window | High | Us |
| Charge incurred | Carrier LFD passed. Money is owed | Critical | Us |
| Double mounting refused | A double mount was attempted and failed a §19.1 constraint | Low | Us |
| Stuffing transfer overdue | `LADEN_SITE_TO_SITE` scheduled, planned time passed, not collected | High | Us |
| Truck window missed | Empty collection not completed inside the truck-in to truck-out window | High | Us |
| Truck window amended | The window was changed by agreement | Low | Us |
| Date churn | A single date field amended beyond the configured threshold | Low | Us |
| Date changed after assignment | A planned date moved after truck and driver were allocated | Medium | Us |
| Container awaiting identity | An export container record has no container number beyond threshold after its empty was collected | Medium | Us |
| Reefer setpoint missing | Container is a reefer with no temperature mode or setpoint | High | Us |
| Standby exceeds expected | Active standby beyond `standby_expected_minutes` | Medium | Customer |
| Standby exceeds threshold | Active standby beyond the configured maximum, whatever the customer indicated | High | Customer |
| Standby not released | Movement left in `ON_STANDBY` past end of day with no release recorded | High | Us |
| Standby unrecorded | Arrival-to-departure gap exceeds the configured limit with no standby flag set | Low | Us |

*Standby not released* and *Standby unrecorded* protect opposite failures. The first catches a driver still shown as waiting because nobody closed the record. The second catches standby that genuinely happened but was never declared, which is precisely how the cost stays invisible.

*Empty ready not confirmed* is the most consequential of these. Without it, a container sits at a customer accruing free time while everyone assumes the customer will call, which is exactly the silent failure §42 prevents on the export side.

### 27.4 Manual override rules

Every override records:

```
who     named user, never a shared account
when    timestamp
what    the rule or gate bypassed
why     mandatory free-text reason, minimum length enforced
```

Overrides are visible on the job permanently, are counted in reporting, and raise a Medium exception so that management sees the pattern rather than the individual instance.

**An override never changes a rule. It records a deliberate exception to it.**

### 27.5 Where manual handling remains

**Not everything in this operation can or should be automated, and the specification is deliberate about which parts are not.** A system that pretends to handle a case it cannot handle is worse than one that hands the case to a person, because the first produces a confident wrong answer and the second produces a queue entry.

Three different things are often confused, and they behave differently:

| | What it is | System behaviour |
|---|---|---|
| **Derived** | The system works it out from stored records | Computed, never typed, never writable |
| **Entered** | A person establishes the fact outside the system and records it | The system stores it with a name and a timestamp, and will not guess it |
| **Exception** | Something outside the normal path | The system raises it, a person resolves it, the outcome is recorded |

The list below is what remains **entered** or **exception** in the MVP. Each is a deliberate decision, not an omission, and each should be revisited only when there is a reliable source to automate against.

**Entered by a person, because there is no system to read it from**

| Item | Why | Section |
|---|---|---|
| Portnet release confirmation | No Portnet API in MVP | §31 |
| Permit receipt | Arrives by email or from the customer, confirmed by a person | §31 |
| CMS completion | Recorded against the job by the controller | §40.2 |
| Transhipment availability | Established by contacting the carrier, then recorded with time and user | §44.1 |
| Carpark positioning request | A commercial agreement with the customer | §44.4 |
| Vessel closing time | Not ingested in MVP; entered where known, and where unknown the system marks the deadline unknown rather than inventing one | §26.4 |
| Truck and driver allocation | No route optimisation or automated allocation in MVP | §21 |
| Empty return confirmation | Confirmed on receipt from the yard | §36 |
| Proof of delivery | Captured by the office | §36 |

**Handled as an exception, because the case is irregular**

| Case | Why it cannot be a workflow | Section |
|---|---|---|
| Chassis maintenance or swap mid-job | Rare, no established procedure, and the right answer depends on what is available at the time | §35.8 |
| Aborted trip re-run | A collection attempted and refused at the customer's gate is a second movement, not an edit to the first, and only a person can tell the difference | §23.1 |
| Uncertain email match | Below confidence threshold, or several candidates. Never guessed onto a job | §11.3 |
| Conflicting extracted value | The controller decides which value becomes current | §12 |
| Location unknown | Contradictory movement records need a person to reconstruct what happened | §24 |
| Gate override | A deliberate decision to proceed without a prerequisite | §27.4 |
| Delivery cancelled or address changed after scheduling | Commercial change, handled by a person, movements adjusted | §27.2 |
| Container grounded exceptionally | Damage, inspection or maintenance. Outside the mounted-throughout model | §35.8 |

**The rule that governs all of these:** where the system cannot establish a fact reliably, it must record who established it and when, rather than deriving it badly or leaving it blank. A field that is silently empty tells nobody anything. A field that says *Portnet released, confirmed by Sarah Lim, 17 Aug 10:42* is auditable, and is the whole difference between this system and the spreadsheet it replaces.

**What must never become manual:** the derived values in Section 56. Job status, container status, location, next action, blocking reason and waiting-on are computed or they are worthless. If any of them acquires a manual entry path during the build, the engine has been bypassed and the queues stop being trustworthy.


---

# Chapter C: Import Domain

Everything in Chapters A and B applies. This chapter specifies only what is import-specific.

## 28. Import Job Entity

Represents the overall shipment and transportation assignment.

| Field | Type | Required |
|---|---|---|
| `job_id` | UUID | Yes |
| `job_number` | Auto-generated | Yes |
| `customer` | Relation | Yes |
| `customer_reference` | Text | Optional |
| `bl_number` | Text | Yes |
| `house_bl` | Text | Configurable |
| `shipper` | Text / Relation | Yes |
| `consignee` | Text / Relation | Yes |
| `inward_carrier` | Relation | Yes |
| `vessel_name` | Text | Yes |
| `voyage_number` | Text | Yes |
| `eta` | Date/Time | Yes |
| `job_type` | Enum | Yes |
| `incoterm` | Enum | Optional |
| `delivery_address` | Address | Yes |
| `permit_required` | Boolean | Yes, from job type |
| `permit_number` | Text | Conditional |
| `permit_received` | Boolean | Yes |
| `portnet_required` | Boolean | Yes, from job type |
| `portnet_released` | Boolean | Yes |
| `assigned_controller` | User | Yes |
| `priority` | Enum | Yes |
| `job_status` | Derived enum | Yes |
| `notes` | Long text | Optional |
| `created_at` / `updated_at` / `created_by` | System | Yes |

There is no `import_export` enum field. Edition 1.0 carried one on the import job while also specifying a separate `export_jobs` table, which made the field dead weight and an invitation to incorrect data entry. Domain is determined by the table.

## 29. Container Entity

Each container is its own record. **A job may hold one or many containers.**

| Field | Type | Required |
|---|---|---|
| `container_id` | UUID | Yes |
| `container_number` | Text, indexed | Yes |
| `job_id` | Relation | Yes |
| `container_size` | Enum | Yes |
| `container_type` | Enum | Yes |
| `seal_number` | Text | Optional |
| `gross_weight` | Decimal | Yes |
| `net_weight` | Decimal | Optional |
| `package_quantity` | Integer | Optional |
| `package_type` | Text | Optional |
| `cargo_description` | Text | Yes |
| `port_terminal` | Text | Yes |
| `empty_return_yard` | Relation | Before return |
| `demurrage_free_days` | Integer | Yes |
| `demurrage_start_date` | Date | Yes |
| `demurrage_lfd` | Date | Yes |
| `detention_free_days` | Integer | Yes |
| `detention_start_date` | Date | On collection |
| `detention_lfd` | Date | Derived or entered |
| `container_status` | Derived enum | Yes |
| `collection_eligible` | Derived boolean | Yes |

Collection date, delivery date and empty return date are **not** stored on the container. They are the timestamps on the container's movements, per Section 17. Edition 1.0 stored them in both places.

### 29.1 Container number validation

Format `AAAA1234567`, four letters followed by seven digits. The system automatically uppercases entries, removes accidental spaces, warns on invalid formatting, and indexes the number for global search across both domains.

**Duplicate rule.** A container number must be unique across *open* jobs, not globally. The same physical box legitimately appears on many jobs over its life, and a global uniqueness constraint would break on the second use. Where a container number is entered that is active on another open job, the system raises the Duplicate container exception and requires explicit confirmation.

## 30. Mandatory Fields: Import

Mandatory field sets are configurable by administrators, not hard-coded. Some requirements depend on job type: an import job requires a permit, an internal warehouse movement may not.

**Recommended default set, required before collection**

```
Customer            BL Number           Container Number
Container Type      Shipper             Consignee
Inward Carrier      Vessel              Voyage
ETA                 Terminal            Delivery Address
Cargo Description   Gross Weight
```

**Permit status and Portnet release status are not mandatory fields.** They are gate conditions, specified in Section 31. Edition 1.0 listed them in both places, which double-counted them: a job could be reported as having incomplete mandatory information *and* as awaiting permit for the same underlying fact, and the two produced different queue entries for one problem.

The rule that separates them: **mandatory fields describe data completeness; gates describe milestones.** A field the controller types is a mandatory field. A state the world must reach is a gate condition.

The job completion indicator shows a percentage **and** an explicit missing list, not only a percentage.

```
Job Information
12 / 14 fields complete       86%

Missing
  Delivery Address
  Gross Weight
```

## 31. Collection Eligibility Engine

The system determines automatically whether each container can be collected. This is the primary product rule for import.

```
CAN_COLLECT(container):

    IF mandatory_fields_complete == false
        RETURN false

    IF permit_required == true
       AND permit_received == false
        RETURN false

    IF portnet_required == true
       AND portnet_released == false
        RETURN false

    RETURN true
```

**This function lives in the domain service layer and nowhere else.** The frontend displays its result. The frontend must never independently decide whether collection is permitted. If the browser can reach a different answer, the build is wrong.

Optional future conditions, to be added without restructuring: delivery slot confirmed, delivery order released, transport date confirmed.

### 31.1 The collection gate in the interface

```
COLLECTION READINESS

Shipment Information      ✓ Complete
Permit                    ✓ Received
Portnet Release           ✓ Released

RESULT
● READY FOR COLLECTION
```

Or:

```
COLLECTION READINESS

Shipment Information      ✓ Complete
Permit                    ✗ Missing
Portnet Release           ✓ Released

RESULT
● COLLECTION BLOCKED

Reason
Permit has not been received.
```

### 31.2 Enforcement

Where `collection_eligible = false`, the system must prevent creation or scheduling of an `IMPORT_DELIVERY` movement, and must prevent any movement for that container reaching `COLLECTED`.

An administrator or authorised manager may override, subject to Section 27.4.

```
Collection gate overridden by
John Tan

Reason
Manual release confirmation received directly from operations manager.

17 Aug 2026, 10:42
```

## 32. Import Job and Container Status Derivation

Two enums. Container status is the physical truth for one box. Job status aggregates across the job's containers.

### 32.1 Container status

Derived, never typed. Evaluation order, first match wins.

| # | Status | Condition |
|---|---|---|
| 1 | Cancelled | Container cancelled |
| 2 | On Hold | Container held |
| 3 | Exception | Open blocking exception |
| 4 | Empty Returned | `EMPTY_RETURN` is `COMPLETED` |
| 5 | Empty Return Pending | `IMPORT_DELIVERY` `COMPLETED`, empty not returned |
| 6 | Delivered | `IMPORT_DELIVERY` is `DELIVERED` |
| 7 | Collected | `IMPORT_DELIVERY` is `COLLECTED` or `IN_TRANSIT` |
| 8 | Scheduled | `IMPORT_DELIVERY` is `SCHEDULED` or `ASSIGNED` |
| 9 | Ready for Collection | `collection_eligible = true`, no movement scheduled |
| 10 | Awaiting Portnet | Portnet required, not released, all else complete |
| 11 | Awaiting Permit | Permit required, not received, all else complete |
| 12 | Incomplete | Mandatory fields missing |
| 13 | New | Newly created |

Edition 1.0 carried a nine-state container machine *and* a ten-value transportation status enum describing the same physical progression. This table replaces both. The physical journey is the movement's status; the container's status is derived from it.

### 32.2 Job status

| # | Status | Condition |
|---|---|---|
| 1 | Cancelled | Job cancelled |
| 2 | On Hold | Job held |
| 3 | Exception | Open blocking exception |
| 4 | Completed | Closure conditions in Section 27.3 satisfied |
| 5 | Empty Return Pending | All containers delivered, one or more empties outstanding |
| 6 | Delivered | All containers delivered |
| 7 | Partially Delivered | Some containers delivered, not all |
| 8 | Collected | All containers collected, none delivered |
| 9 | Partially Collected | Some containers collected, not all |
| 10 | Transport Assigned | One or more movements `SCHEDULED` or `ASSIGNED` |
| 11 | Ready for Collection | All containers eligible, none scheduled |
| 12 | Awaiting Portnet | One or more containers awaiting release |
| 13 | Awaiting Permit | One or more containers awaiting permit |
| 14 | Incomplete | Mandatory fields missing |
| 15 | Processing | Created by automation, extraction in progress |
| 16 | New | Newly created |

Alongside these, and not replacing them: `On Hold`, `Cancelled`, `Exception` are the only statuses a user may set directly, and each requires a reason.

**This logic is centralised server-side.** Separate frontend components must not calculate status independently.

## 33. Multi-Container Jobs

Import job status aggregates over containers, and the aggregation must be visible rather than flattened.

```
JOB-260817-001
    ABCU1234567     Delivered
    ABCU7654321     Ready for Collection
    ABCU9876543     Awaiting Permit

Job Status          PARTIALLY DELIVERED

Progress
    1 / 3 delivered
    0 / 3 empty returned
```

**A job must not be marked Completed while any container is outstanding.** The job detail screen shows per-container progress counts, and the container tracker remains the place a controller works a single box.

Each container carries its own eligibility, its own free-time clocks and its own movements. A blocked container does not block its siblings.

## 34. Demurrage and Detention

> **Rewritten in 2.1.** Edition 2.0 stated that demurrage and detention are two clocks with two last free days that must never be conflated. That is true of some carriers and false of others, and the operation runs its own internal count that neither matches. This section now models all three.

### 34.0 Three numbers, not one

There are three different answers to "how many days do we have," and confusing them is what makes free time reporting untrustworthy.

| Number | Whose | What it is for |
|---|---|---|
| **Internal count** | Ours | The operational alert. One standard applied to every container regardless of carrier |
| **Carrier count** | The carrier's | The money. Whatever their contract says, counted their way |
| **Charge estimate** | Derived | Carrier count multiplied by their rate |

**Both are stored, both are visible, and neither is discarded in favour of the other.** They drive two separate alert streams, specified in §34.6.

> **Confirmed by operations.** This was carried as an assumption when the section was first drafted. The decision is to show both: the internal count for operational planning, the carrier's contractual count for charge risk. The reasoning matters and is worth stating, because it is the thing a developer would otherwise simplify away.

Suppose a container discharges on 1 September. Our standard allows seven free days, so our last free date is 7 September. The carrier's contract for that customer allows ten, so their last free date is 10 September.

```
ETA                  1 Sep
Internal free time   7 days      internal LFD    7 Sep
Carrier free time    10 days     carrier LFD     10 Sep

On 5 Sep:
  Operational alert  AMBER       approaching internal LFD, 2 days
  Charge risk        GREEN       5 days before money is owed
```

Warning only on the internal figure would be operationally right and financially misleading, because a controller sees amber on a container that cannot cost anything for another five days. Warning only on the carrier figure loses the internal target the operation actually works to, and the early return that target exists to encourage.

**Worse, showing one figure alone produces a container marked overdue while it is still inside the carrier's agreed free time.** That single display error is enough to make controllers distrust the panel, and a distrusted panel is an ignored panel.

### 34.1 The internal standard

```
detention_day_0 = vessel_eta_date
days_used       = current_date - vessel_eta_date
```

The day the vessel arrives is day zero. This applies to every container identically, whatever the carrier does, which is the entire point: a controller scanning a list of forty containers is comparing like with like.

### 34.2 The carrier count

The carrier's own terms come from the free time rules in §9.2 and take one of two shapes.

**Split model.** Two allowances, two clocks, two last free days.

```
DEMURRAGE     discharge to gate-out        container sitting at the port
DETENTION     gate-out to empty return     carrier equipment held by us
```

**Combined model.** One allowance covering the whole period from discharge to empty return. There is one pool of days and one last free date. Time at the port and time at the customer draw down the same balance.

```
COMBINED D&D  discharge to empty return   one pool, one last free date
```

For a combined-model carrier the system must **not** display two separate countdowns. Splitting a single allowance in two invents a deadline that does not exist and hides the one that does.

**Stored per container:** `free_time_model`, the applicable free days, start date, last free date, days used, chargeable days, daily rate, estimated charge, currency, and the internal ETA-based count alongside.

The MVP may leave rates blank where commercial rates are unavailable. The countdowns do not depend on them.

### 34.3 What the container screen shows

```
ABCU1234567          Carrier: ONE          Model: COMBINED

Internal count       Day 6 from vessel ETA
Carrier free time    7 days combined, LFD 24 Aug
Days remaining       2          AMBER
Chargeable so far    0 days
```

Where the model is `SPLIT`, two lines appear in place of one. Where the internal count and the carrier count disagree by more than a configured tolerance, the container raises a *Free time basis mismatch* exception at Low severity, because it usually means the carrier rule on file is stale.

### 34.4 Countdown

```
days_remaining = last_free_date - current_date
```

Computed daily against the container's own LFD, never against a job-level date. Under the combined model there is one `last_free_date`; under the split model there are two and each is counted separately.

```
6 Days Remaining
2 Days Remaining
LFD Today
1 Day Overdue
3 Days Overdue
```

### 34.5 Risk levels

| Level | Threshold | Alert |
|---|---|---|
| Green | 4 or more days remaining | None |
| Amber | 2 to 3 days | Warning |
| Red | 0 to 1 days | High |
| Critical | Past LFD | Overdue |

Thresholds are configurable. Colours always accompany a text status and are never the sole signal.

**The scale is applied twice**, once against the internal LFD and once against the carrier LFD, producing two independent levels for the same container. Thresholds are configurable separately for each, because the two streams answer different questions and need not warn at the same distance.

### 34.6 Two alert streams

| Stream | Counted against | Answers | Escalates to |
|---|---|---|---|
| **Operational warning** | Internal LFD, from vessel ETA per §34.1 | Are we on track to clear or return this container by our own standard? | Assigned controller |
| **Charge risk** | Carrier LFD, from the contract per §34.2 | Is money about to be owed on this container? | Controller and manager |

The operational stream is the one that shapes daily work, and it is deliberately the tighter of the two. It exists to encourage early clearance and early return, which is where the chassis capacity in §35.6 comes from.

The charge risk stream is the one that costs money, and it is the one a manager reads.

**Neither stream may be suppressed because the other is green.** A container inside carrier free time but past our internal target is a planning problem worth surfacing. A container inside our internal target but approaching the carrier LFD, which happens when a carrier grants less free time than our standard assumes, is a financial problem that the operational stream would never catch.

**A container is described as overdue only against the carrier LFD.** Past the internal LFD it is *past internal target*, which is a different sentence and a different colour. The system must never present a container as overdue while it sits inside the carrier's agreed free time.

Alerts surface on the dashboard D&D panel per §48.4, in notifications, and as exceptions per Section 27.2.

**Empty return stops the clock.** The `EMPTY_RETURN` movement reaching `COMPLETED` is the event that does it, not a manually ticked box. Under the split model it stops detention only; under the combined model it stops the single pool.

**Time at the company carpark counts.** A laden import held at our carpark under §36.2 continues to draw down free time, because the container has not been returned. The carpark is our convenience, not a pause on the carrier's clock, and the dashboard must not present it as one.

## 35. Chassis Occupancy

> **New in this edition.** Edition 1.0 carried no chassis concept at all across any of its three parts. Because the operation never dismounts a container, chassis occupancy is the fleet's real capacity constraint, and nothing in the previous specification could see it.

### 35.1 The operating fact

Every container, laden or empty, import or export, sits on a chassis from the moment it is collected until it is released. Containers are never grounded, because no loose cargo is handled and there is therefore no reason to dismount.

This makes chassis occupancy fundamentally different from truck and driver assignment:

```
EXPORT CARPARK JOB              D0   D1   D2      D4   D5           D9   D10

TRUCK AND DRIVER                     ##           ##                ##
  engaged per trip, hours            MOV-1        MOV-2             MOV-3

CHASSIS                              ###########################################
  engaged once, released once        mounted at yard        released at port

CONTAINER                            ###########################################
```

**Chassis occupancy equals job duration.** Not trip count, not truck hours. It includes every day the customer is stuffing or unstuffing, and every day the container sits at the company carpark.

### 35.2 Assignment model

Chassis is assigned at the **job** level, not the movement level.

| Field | Lives on | Notes |
|---|---|---|
| `chassis_id` | `containers` (import), `export_jobs` (export) | The unit under this container |
| `chassis_mounted_at` | As above | Set when the first movement reaches `COLLECTED` |
| `chassis_released_at` | As above | Set when the final movement reaches `COMPLETED` |

Every movement on the job carries the same `chassis_id`, copied at creation for reporting and schedule display. A controller does not choose a chassis per trip. Where a chassis is genuinely swapped mid-job, which should be rare, it is recorded as a chassis change event with a reason and is audited.

**Size must match, with one exception.** A forty-foot container requires a forty-foot chassis. A twenty-foot container requires a twenty-foot chassis **unless it is double mounted**, in which case two twenty-foot containers share one forty-foot chassis under the constraints in §19.1.

> **Changed in 2.1.** Edition 2.0 stated the size rule as absolute. It is not. The validation is:

```
IF container.size == 40FT
    REQUIRE chassis.size == 40FT

IF container.size == 20FT
    REQUIRE chassis.size == 20FT
         OR (chassis.size == 40FT AND double mounting constraints pass)
```

Where a chassis is double mounted, `chassis_id` is the same on both container records, and `chassis_days` is **counted once**, not twice. Counting it per container would inflate occupancy and understate the capacity benefit that double mounting exists to deliver.

### 35.3 Chassis status is derived

Chassis status follows the same discipline as container location in Section 24. It is computed from job and movement records, never typed.

| Status | Derived from |
|---|---|
| `IN_USE` | Assigned to a job whose final movement is not `COMPLETED` |
| `INSPECTION` | Inspection due date reached, no current pass recorded |
| `MAINTENANCE` | Set manually, reason required |
| `RETIRED` | Set manually by an administrator |
| `AVAILABLE` | Active, and none of the above |

A stored availability flag drifts the moment someone forgets to clear it. Deriving it means the count is always exactly as truthful as the job records.

### 35.4 Availability, per size

The system must expose available counts **by size**, because a spare forty-foot chassis does not help a twenty-foot booking.

```
available_20ft = active 20ft chassis  -  in use  -  inspection  -  maintenance
available_40ft = active 40ft chassis  -  in use  -  inspection  -  maintenance
```

**Availability warns, it does not block.** Scheduling a movement when no chassis of the required size is free raises a warning and an exception, and the controller may proceed. A hard gate on equipment would be overridden constantly, and a gate that is routinely overridden teaches people to ignore every other gate in the system. This is the one place where the specification deliberately departs from the checkpoint pattern in Sections 31, 41 and 43.

### 35.5 The third clock

Demurrage and detention measure the carrier's equipment held by us. Chassis occupancy measures **our** equipment held by a customer, and it has never been counted.

| Clock | Whose asset | Currently tracked |
|---|---|---|
| Demurrage | Carrier's container at the port | Yes, Section 34 |
| Detention | Carrier's container held by us | Yes, Section 34 |
| **Chassis occupancy** | **Our chassis held by a customer** | **No** |

The system stores `chassis_days` per job, computed from `chassis_mounted_at` to `chassis_released_at`, or to now while the job is open. It is reported per customer, so that a customer whose stuffing routinely runs long is visible as an equipment cost rather than as a generic delay.

Billing for chassis occupancy is not in MVP scope. Recording it is, for the same reason one-way loaded trips are recorded as their own category in Section 19: a cost that is never measured can never be recovered, and adding the measurement later means losing the history.

### 35.6 Capacity

Because occupancy equals job duration, fleet size sets a hard ceiling on concurrent jobs.

```
concurrent 40ft containers   <=  available 40ft chassis
concurrent 20ft containers   <=  available 20ft chassis
                                 + (available 40ft chassis not otherwise committed) x 2

monthly capacity  ~  chassis  x  (30 / average job days)
```

At the current fleet of 47 twenty-foot and 42 forty-foot units, a six-day average job supports roughly 235 and 210 jobs per month respectively. At five days it is roughly 282 and 252, an increase of about 20 per cent on the same fleet.

> **Changed in 2.1.** Edition 2.0 treated the two fleets as strictly separate. Double mounting makes forty-foot units **partially fungible into twenty-foot capacity**, so the ceiling is softer than stated. The system must not present a spare forty-foot unit as usable twenty-foot capacity automatically, because the §19.1 constraints may not hold, but the availability panel should show it as *conditionally available* rather than unavailable.

**The clustering in §9.1 cuts the other way.** Twenty-two units due for inspection in a single month is roughly a quarter of the fleet, and that hurts more once forty-foot units are absorbing twenty-foot work. Inspection scheduling should be levelled before it becomes a capacity event.

**This is the clearest financial case in the project.** Every feature that shortens a job, faster container detail capture in Section 42, earlier VGM chasing in Section 43, shorter carpark dwell in Section 44.5, converts directly into fleet capacity that would otherwise have to be bought. The dashboard must therefore report average `chassis_days` as a trend, not only as a current count.

### 35.7 Exceptions

| Exception | Trigger | Severity |
|---|---|---|
| Chassis held beyond threshold | `chassis_days` exceeds the configured limit for the customer | Medium |
| Chassis size mismatch | Assigned chassis size does not match container size | High |
| Fleet availability low | Available count for a size falls below the configured floor | High |
| Chassis inspection due | Inspection due within the configured warning window | Medium |
| Chassis assigned while unavailable | Scheduled against a unit in maintenance, inspection or another job | High |
| Chassis unaccounted | Marked in use with no open job | Critical |
| Chassis maintenance mid-job | A unit under a container is withdrawn for maintenance or repair | High |
| Chassis swapped mid-job | The unit under a container is changed before the job completes | Medium |

### 35.8 Mid-job maintenance and swaps

**This is an exception, not a workflow.** A chassis needing maintenance while under a container is the only case that forces a dismount, it happens rarely, and there is no established procedure for it today. The system must not invent one.

When it happens, the case is raised as a *Chassis maintenance mid-job* exception at High severity and is worked by a person. The system's role is to record what was decided, not to decide it:

| Recorded | Notes |
|---|---|
| `chassis_id_previous` | The unit withdrawn |
| `chassis_id_new` | The replacement, or null if the container was grounded |
| `reason` | Mandatory free text |
| `location` | Where the change happened |
| `changed_at` / `changed_by` | Timestamp and named user |
| `container_grounded` | Boolean, true where no replacement was fitted |

`chassis_days` splits across both units, so neither unit's occupancy record is falsified by the swap. The exception stays open until a controller closes it with a resolution note.

**Whether a container is grounded or transferred to another chassis is an operational decision made at the time.** The system records the outcome. It does not prescribe the choice, block either option, or assume a replacement is always available.


## 36. Import Movements

### 36.1 The normal pattern

A container's journey normally comprises two movements.

```
MOV-001    IMPORT_DELIVERY    Terminal      →  Customer / Warehouse    laden
MOV-002    EMPTY_RETURN       Customer      →  Empty Return Yard       empty
```

`MOV-001` collects at the terminal and delivers at the customer: one journey, two timestamps. `actual_collection_at` is the gate-out that starts the carrier's detention clock under the split model. `actual_delivery_at` is arrival, and `COMPLETED` requires proof of delivery.

### 36.2 The carpark pattern

> **New in 2.1.** Edition 2.0 stated that import has no company-held storage. It does.

Where the customer has no space to receive the container, or the controller positions it deliberately, the laden container is held at the company carpark and the journey becomes three movements.

```
MOV-001    IMPORT_TO_CARPARK      Terminal          →  Company Carpark   laden
MOV-002    CARPARK_TO_CUSTOMER    Company Carpark   →  Customer          laden
MOV-003    EMPTY_RETURN           Customer          →  Empty Return Yard  empty
```

**Why it happened is recorded, because it decides who we are waiting on.**

| `carpark_reason` | Waiting on | Meaning |
|---|---|---|
| `CUSTOMER_NO_SPACE` | Customer | They cannot receive it yet |
| `CONTROLLER_DECISION` | Us | We positioned it for operational reasons |

The distinction is not cosmetic. A container sitting at our carpark because the customer has no space is a customer delay that should be visible and, in time, chargeable. The same container sitting there because we chose to position it is our own cost. Recording them identically makes both invisible.

`carpark_arrived_at` is set when `IMPORT_TO_CARPARK` reaches `DELIVERED`, and carpark dwell is counted exactly as for export under §44.5, with the same threshold and the same *Carpark dwell exceeded* exception.

**Free time keeps running throughout.** See §34.5.

`MOV-002` is **not** auto-created. The trigger is the customer being able to receive the container, which the system has no way to know. It is created by a controller when the customer says so.

### 36.3 Empty return waits on the customer

> **Changed in 2.1.** Edition 2.0 auto-created the `EMPTY_RETURN` movement the moment delivery completed. In practice the customer unstuffs and then tells us the container is empty, usually by email or WhatsApp, and only then can we collect it.

Two fields are added to the container record:

| Field | Notes |
|---|---|
| `empty_ready_confirmed` | Boolean |
| `empty_ready_confirmed_at` / `_by` / `_source` | Timestamp, user, and `EMAIL` / `WHATSAPP` / `PHONE` / `MANUAL` |

The sequence is:

```
IMPORT_DELIVERY reaches COMPLETED
        |
EMPTY_RETURN auto-created in PENDING          waiting on: CUSTOMER
        |
Customer confirms the container is empty      empty_ready_confirmed = true
        |
EMPTY_RETURN becomes READY_FOR_SCHEDULING     waiting on: US
        |
Controller schedules and completes it
```

The movement is still created automatically, so it exists and is countable. What changes is that it cannot leave `PENDING` until the customer has confirmed. This is the placeholder rule in §21 doing exactly what it was designed for.

**A container whose delivery completed beyond the configured threshold with no empty-ready confirmation raises an exception**, because the alternative is a container quietly accruing detention while everyone assumes the customer will call.

WhatsApp is not an ingestion channel in the first release. A confirmation arriving by WhatsApp is recorded manually by the controller with `_source = WHATSAPP`, which at minimum captures who established the fact and when, per §5 of the workflow model.

### 36.4 Suppression and scoping

Where empty return is not applicable, shipper-owned containers or certain job types, the job type suppresses the `EMPTY_RETURN` movement, and Section 27.3 closure does not require it.

**`movement_ref` is scoped to the job, not the container.** On a three-container job the movements run `MOV-001` through `MOV-006`, each carrying its `container_id`. The container tracker filters them; the job's movement history shows them all.

## 37. Next Action Rules: Import

Consumed by the engine in Section 25.

| Condition | Next action required | Waiting on |
|---|---|---|
| Mandatory information missing | Complete job information | Us |
| Permit required, not received | Request permit | Customer |
| Permit rejected | Resolve permit rejection | Us |
| Portnet release not confirmed | Check Portnet release | Us |
| Delivery address missing or disputed | Confirm delivery address | Customer |
| Eligible, no movement scheduled | Assign transportation | Us |
| Movement scheduled, planned time passed, not collected | Chase collection | Us |
| LFD today or within critical threshold, not collected | Prioritise collection | Us |
| Collected, not delivered | Deliver container | Us |
| Delivered, POD not captured | Capture proof of delivery | Us |
| Delivered, empty not returned | Return empty container | Us |
| Detention LFD approaching, empty not returned | Prioritise empty return | Us |
| Document conflict open | Review document conflict | Us |
| Open exception | Resolve exception | Per exception |
| All movements complete, job open | Close job | Us |
| Nothing outstanding | No action required | Nobody |

---

# Chapter D: Export Domain

Everything in Chapters A and B applies. This chapter specifies only what is export-specific.

**Do not copy from Chapter C.** Three things in particular must not carry across:

- **Do not reuse the collection eligibility engine as written.** The export gates ask different questions. Build separate rule functions with the same shape and the same server-side discipline, per Sections 41 and 44.
- **Do not reuse demurrage and detention logic.** Export has no last free day in the import sense. Omit it rather than leaving it unpopulated.
- **Do not create permit fields on the export job.** The export workflow does not require export permit tracking. An unused field invites incorrect data entry.

## 38. Export Job and Container Entities

> **Restructured in 2.1.** Edition 2.0 held container identity, seal, tare and VGM on the export job, because an export job was assumed to concern one container. One booking can cover several. Container-level fields therefore move to a container record, exactly as import already does, and the export job becomes the commercial header.

```
EXPORT JOB          the booking: customer, shipper, vessel, references, CMS
   |
   +-- CONTAINER    identity, seal, tare, VGM, ready state, chassis
   |      |
   |      +-- MOVEMENT   each physical journey
   +-- CONTAINER
   +-- CONTAINER
```

### 38.1 Export job

| Field | Type | Required |
|---|---|---|
| `export_job_id` | UUID | Yes |
| `job_number` | Auto-generated | Yes |
| `customer` | Relation | Yes |
| `shipper` | Text / Relation | Yes |
| `booking_reference` | Text | Yes |
| `export_clearance_reference` | Text | Yes |
| `carrier` | Relation | Optional |
| `vessel_name` | Text | Yes |
| `voyage_number` | Text | Yes |
| `eta_singapore` | Date/Time | Yes |
| `vessel_closing_at` | Date/Time | Optional |
| `empty_collection_yard` | Relation | Yes |
| `empty_delivery_address` | Address | Yes |
| `cms_required` | Boolean | Yes, from customer or job type |
| `cms_status` | Enum | Yes |
| `cms_completed_at` / `cms_completed_by` | Timestamp / User | Conditional |
| `container_quantity` | Integer | Yes. From the booking, e.g. 1 |
| `container_size_type` | Text | Yes. From the booking, e.g. `40 HQ` |
| `truck_in_date` | Date | Yes. The yard collection window opens |
| `truck_out_date` | Date | Yes. The yard collection window closes |
| `truck_window_amended_at` / `_by` / `_reason` | Timestamp / User / Text | Conditional. See below |
| `standby_required` | Boolean | Yes, default false. Customer instruction, per §21.3 |
| `standby_instruction_source` | Enum | Conditional |
| `standby_expected_minutes` | Integer | Optional |
| `special_instructions` | Text | Optional. Free text, e.g. clean dry, heavy duty |
| `transhipment_status` | Enum | Yes |
| `transhipment_checked_at` / `_by` | Timestamp / User | Conditional |
| `carpark_requested` | Boolean | Yes, default false |
| `assigned_controller` | User | Yes |
| `priority` | Enum | Yes |
| `job_status` | Derived enum | Yes, aggregated per §45.4 |
| `notes` | Long text | Optional |
| `created_at` / `updated_at` / `created_by` | System | Yes |

The export job carries no permit field. This is deliberate.

**Truck-in and truck-out are fixed.** They come from the yard booking and are not editable in the ordinary course. Changing either requires a recorded agreement with the customer, and is written to the date amendment log in §13.1 with a `reason_code` of `YARD_WINDOW_CHANGE` or `CUSTOMER_REQUEST`. This is an override in the sense of §27.4, not a field edit.

> **Changed in 2.1d.** This originally carried its own `truck_window_amended_*` fields. They are removed in favour of the general mechanism in §13.1, so that one log holds every date change on the job rather than the window being tracked separately from everything else.

> **New in 2.1.** Neither date appeared in edition 2.0. They are a hard operational window and the empty collection must be scheduled inside it.

**Transhipment is held at job level, not per container**, because it is a property of the booking and the vessel rather than of an individual box.

### 38.2 Export container

One record per container on the booking. Created when the job is created, from `container_quantity`, and identified later.

| Field | Type | Required |
|---|---|---|
| `export_container_id` | UUID | Yes |
| `export_job_id` | FK | Yes |
| `container_ref` | Text | Yes. Display reference, `C1`, `C2`, scoped to the job |
| `container_number` | Text | After empty collection |
| `seal_number` | Text | After empty collection |
| `tare_weight_kg` | Decimal | After empty collection |
| `size_type` | Text | Yes. e.g. `20 GP`, `40 HQ` |
| `is_reefer` | Boolean | Derived from type |
| `temperature_mode` | Enum | Conditional. `PRE_COOL` / `PRE_SET`, per §9.4 |
| `temperature_setpoint_c` | Decimal | Conditional |
| `empty_collection_yard` | Relation | Yes |
| `stuffing_location` | FK to customer location | Yes, per §9.3 |
| `container_details_sent` | Boolean | After empty delivery |
| `container_details_sent_at` / `_by` / `_to` | Timestamp / User / Email | Conditional |
| `container_ready` | Boolean | Before laden movement |
| `container_ready_at` | Timestamp | Conditional |
| `vgm` | Decimal | Before laden movement |
| `vgm_received_at` / `vgm_source` | Timestamp / Enum | Conditional |
| `portnet_processed` | Enum | Yes. See §44.2 |
| `portnet_processed_at` / `_by` | Timestamp / User | Conditional |
| `chassis_id` | FK | Per §35.2 |
| `chassis_mounted_at` / `chassis_released_at` | Timestamp | Per §35.2 |
| `carpark_arrived_at` | Timestamp | Written by the movement engine |
| `container_status` | Derived enum | Per §45.4 |

`carpark_arrived_at` is stored rather than derived on read, because carpark dwell days appear on the dashboard and in reporting and deriving it on every read is wasteful. **It is written by the movement engine when `ONE_WAY_LOADED` reaches `DELIVERED`, never by a user.**

**Each container carries its own gate result, its own readiness, its own VGM and its own movements.** A blocked container does not block its siblings, exactly as §33 specifies for import.

**`stuffing_location` is per container**, not per job. Operations confirmed that containers on one booking can go to different customer sites. Where all containers share a site, they simply share the value.

## 39. Container Identity Capture

The container number is not known when an export job is created. It becomes known only when the empty container is collected from the yard.

Once collected, three values must be captured:

```
EXP-260817-001

Container Number      ABCU1234567
Seal Number           123456
Tare Weight           3,850 KG
```

These become permanently associated with the **container record**, not the job.

Before identity is captured the container is addressed by its `container_ref`:

```
EXP-260817-001

C1    ABCU1234567    seal 123456    tare 3,850 KG
C2    ABCU7654321    seal 123457    tare 3,820 KG
C3    (awaiting empty collection)
```

Format validation, uppercasing, space removal and the open-job duplicate rule follow Section 29.1 without change. The container number is indexed and globally searchable across both domains.

**An `EMPTY_COLLECTION` movement that has reached `DELIVERED` with no container number cannot reach `COMPLETED`,** and beyond the configured threshold raises the *Empty delivered without container details* exception at High severity. Without that rule, a delivered empty with no container number simply looks finished.

> **Resolved in 2.1.** Edition 2.0 noted that multi-container export bookings would require a separate `export_containers` table, and predicted the change would be purely additive because the movement already carried a nullable container reference. Operations confirmed multi-container bookings are normal, the table now exists in §38.2, and the prediction held: no movement migration was required.

## 40. Mandatory Fields and CMS: Export

### 40.1 Mandatory fields

```
Customer                       Shipper
Booking Reference              Export Clearance Reference
Vessel                         Voyage
ETA Singapore                  Empty Collection Yard
Stuffing Location              Container Quantity
Container Size and Type        Truck In Date
Truck Out Date
```

Thirteen fields. **CMS is not among them.**

> **Changed in 2.1.** Edition 2.0 listed nine. Four are added from the standard booking slip: container quantity, size and type, and the truck-in and truck-out window. *Empty Delivery Address* is renamed *Stuffing Location* and is now selected from the customer's locations per §9.3 rather than typed.

The booking slip these are read from looks like this, and §11 extraction targets it directly:

```
1 x 40 HQ,  EK11                         TRUCK IN    18/08/26
                                         TRUCK OUT   20/08/26
Bkg ref      SGSIN12345
Portnet ref  OP-260818-77
Shipper      XYZ Manufacturing
Delivery     12 Tuas Ave 8, Singapore

Special instructions
  Reefer, pre-set -15C
```

Reefer instructions are extracted into the structured fields in §9.4, not left in `special_instructions`. CMS is a gate condition, specified below and enforced in Section 41.

Edition 1.0 listed `CMS Status = Completed` as a mandatory field while simultaneously permitting a CMS status of `Not Required`, which made the mandatory field unsatisfiable for any job legitimately exempt from CMS. The gate function handled this correctly; the field table did not.

Container number, VGM and transhipment status are also not mandatory fields for empty collection. They are captured later and gate the laden movement instead.

### 40.2 CMS tracking

CMS is an operational checkpoint tracked as a status, not a free-text note.

```
Pending
Completed
Not Required
```

Stored alongside: completed date, completed time, updated by.

A job cannot reach Ready for Empty Collection while CMS is `Pending`.

**`Not Required` is an explicit, permissioned choice with a mandatory reason, never a default.** If CMS is routinely not required for a given customer, that belongs in master data as `cms_required = false`, not as a repeated per-job decision.

## 41. Empty Collection Gate

The first of two export gates. Ten conditions: nine mandatory fields plus CMS.

```
CAN_COLLECT_EMPTY(export_job):

    IF mandatory_fields_complete == false
        RETURN false

    IF cms_required == true
       AND cms_status != COMPLETED
        RETURN false

    RETURN true
```

Where the gate passes, status becomes `Ready for Empty Collection` and `EMPTY_COLLECTION` may be created and scheduled. Where it fails, status is `Incomplete` or `Awaiting CMS`, and **the system displays exactly which information is missing**:

```
EXP-260817-001
Status    INCOMPLETE

Missing
  CMS
  Empty Delivery Address
```

The common failure this prevents: empty collection arranged before CMS is done. The gate exists to make that impossible, not to remind someone.

Server-side, single source of truth, alongside the derivation functions. Administrator override per Section 27.4.

## 42. Customer Notification After Empty Delivery

Once the empty container has been delivered, the system supports sending container details to the customer.

```
Container Number      Seal Number      Tare Weight
```

**The notification is generated from stored job data, never retyped by the controller.** The send is recorded: sent flag, timestamp, sender, recipient address, and a stored copy or message reference.

Once sent, the job moves to `Awaiting Customer Stuffing`.

A job sitting in `Awaiting Container Details Notification` beyond a configured period appears in the Action Required queue and raises an exception. **This is a common silent delay:** the container is delivered, but the customer does not know its number and therefore cannot begin stuffing.

## 43. Container Ready and VGM

After stuffing, the customer confirms by email that the container is ready and provides VGM.

| Field | Description |
|---|---|
| `container_ready` | Yes / No |
| `container_ready_at` | Timestamp |
| `vgm` | Verified gross mass, with unit |
| `vgm_received_at` | Timestamp |
| `vgm_source` | Email / manual entry / document |

Incoming email automation should identify the job or container number and update the correct export job automatically, subject to the two safety rules in Section 11.4.

**VGM must be validated as plausible. A VGM at or below the recorded tare weight is impossible and raises a discrepancy rather than being stored.** (Edition 1.0 stated this as *below* tare in one place and *at or below* in three others; at or below is correct, because a laden container cannot weigh exactly its own tare.)

Once both conditions are satisfied **for a given container**, that container progresses to the transhipment availability check. Containers on the same job progress independently.

### 43.1 Multi-stop stuffing

Where stuffing runs across more than one location, per §46.3, **ready and VGM are confirmed only after the final location.** A container in transit between stuffing sites carries `cargo_state = PART_LADEN`, has no VGM, and cannot satisfy the laden gate.

> **Confirmed by operations.** VGM is the *total* verified gross mass of the finished container. The customer cannot produce it until stuffing is complete, so it arrives from the final stuffing location and from nowhere else. This is a physical constraint, not a process convention, and the system enforces it as one.

The consequence for the build: **a container with an outstanding `LADEN_SITE_TO_SITE` movement cannot hold a VGM.** Where an extracted or manually entered VGM arrives for a container that still has stuffing legs ahead of it, the system raises a discrepancy under §12 rather than storing it. The likeliest causes are a customer sending a partial figure or a figure against the wrong container, and storing either would produce a VGM that is wrong and looks right.

Where a customer declares a container ready at what was expected to be an intermediate site, that site simply becomes the final site. No further transfer movement is created and the job proceeds normally. The system does not need to be told the plan changed; it needs only to observe that no further transfer exists.

**No ceiling is imposed on the number of stuffing locations.** Two is what operations described. The model supports any number, because a hard limit of two would fail silently the first time a customer used three.

## 44. Transhipment, the Laden Gate and the Carpark Branch

### 44.1 Transhipment availability

```
Pending
Available
Not Available
```

**The check is recorded with a timestamp and a user.** "We checked" is not sufficient. The stored answer is what the dashboard and the Action Required queue read.

`Pending` is a blocking state, not an absence of data. The job sits in `Awaiting T/T` and appears in the Action Required queue until it is resolved either way.

### 44.2 The laden gate

Evaluated **per container**, not per job.

```
CAN_START_LADEN(export_container):

    IF container_number IS NULL
        RETURN false

    IF container_ready != true
        RETURN false

    IF vgm IS NULL
        RETURN false

    IF stuffing_complete != true                 -- §43.1, multi-stop
        RETURN false

    IF job.transhipment_status == PENDING
        RETURN false

    RETURN true
```

**No laden movement of any type may be created while this returns false.**

### 44.2.1 Portnet processing warns, it does not block

> **New in 2.1.** Not specified in any previous edition.

A container can be genuinely ready, with VGM received, and still not be processed by Portnet. The cause is usually a carrier-side issue outside our control.

```
portnet_processed:   PENDING  ·  PROCESSED  ·  FAILED
```

All four combinations of Portnet and VGM occur in practice, and none of them is a data error:

| VGM | Portnet | Meaning |
|---|---|---|
| Received | Processed | The normal path |
| Received | Pending or failed | Ready, but the carrier's side is not clear |
| Missing | Processed | Portnet cleared ahead of the customer's confirmation |
| Missing | Pending | Nothing has happened yet |

**Portnet is not a condition of the laden gate.** The system raises a *Portnet not processed* exception at Medium severity and shows the state on the container, but the movement may still be created and scheduled. Operations were explicit: the customer may still request the move, and a hard block would leave the controller unable to act on a decision that is not theirs to make.

This is the second place in the specification, after chassis availability in §35.4, where the system deliberately warns instead of blocking. Both share a reason: the blocking condition is outside our control, so a gate would be overridden routinely and would teach people to ignore every other gate.

### 44.3 Scenario A, transhipment available

The laden container travels directly from the customer to the port. Status becomes `Ready for Laden Collection`, and the system creates one movement:

```
MOV-002    DIRECT_LADEN_TO_PORT    Customer  →  Port    laden
```

Two movements in total.

### 44.4 Scenario B, transhipment not available

The customer may request that the laden container be trucked to the company's carpark. `carpark_requested` is set, status becomes `Ready for One-Way Loaded Trip`, and the system creates:

```
MOV-002    ONE_WAY_LOADED    Customer  →  Company Carpark    laden
```

On delivery, `carpark_arrived_at` is set, location becomes Company Carpark, and **job status recomputes to `Awaiting T/T`.** A container sitting at the carpark with transhipment unresolved is genuinely awaiting transhipment, and the dashboard must count it that way.

Once transhipment becomes available:

```
MOV-003    CARPARK_TO_PORT    Company Carpark  →  Port    laden
```

**This is a separate movement with its own schedule, driver and timestamps. It must never be recorded as an edit to `MOV-002`.**

Three movements in total. **One job number throughout.** A shipment never receives a second job number because it required an extra journey.

### 44.5 Carpark exposure

Containers at the carpark must be individually visible on the dashboard with dwell days, and must raise the *Carpark dwell exceeded* exception beyond the configured threshold.

**A container at the carpark is company cost and company risk, and it is the state most likely to be forgotten.**

## 45. Export Job Status Derivation

### 45.1 Canonical enum

Twenty-one values.

| # | Status | | # | Status |
|---|---|---|---|---|
| 1 | New Export Job | | 12 | Awaiting T/T |
| 2 | Incomplete | | 13 | Ready for One-Way Loaded Trip |
| 3 | Awaiting CMS | | 14 | Ready for Laden Collection |
| 4 | Ready for Empty Collection | | 15 | Laden Collection Scheduled |
| 5 | Empty Collection Scheduled | | 16 | Laden Collected |
| 6 | Empty Collected | | 17 | At Carpark |
| 7 | Empty Delivered | | 18 | Ready for Port Delivery |
| 8 | Awaiting Container Details Notification | | 19 | Port Delivery Scheduled |
| 9 | Awaiting Customer Stuffing | | 20 | Delivered to Port |
| 10 | Container Ready | | 21 | Completed |
| 11 | Awaiting VGM | | | |

Alongside these, and not replacing them: `On Hold`, `Cancelled`, `Exception`. These three are the only statuses a user may set directly, and each requires a reason.

### 45.2 Derivation order

Where several conditions are true at once, the system shows the most blocking status. First match wins.

| # | Status | Condition |
|---|---|---|
| 1 | Cancelled | Job cancelled |
| 2 | On Hold | Job held |
| 3 | Exception | Open blocking exception |
| 4 | Completed | Final port delivery `COMPLETED`, closure conditions met |
| 5 | Delivered to Port | Port movement `DELIVERED` |
| 6 | Port Delivery Scheduled | `CARPARK_TO_PORT` is `SCHEDULED` or `ASSIGNED` |
| 7 | Ready for Port Delivery | At carpark, transhipment available |
| 8 | At Carpark | `ONE_WAY_LOADED` is `COMPLETED`, transhipment available or unchecked |
| 9 | Laden Collected | Laden movement `COLLECTED` or `IN_TRANSIT` |
| 10 | Laden Collection Scheduled | Laden movement `SCHEDULED` or `ASSIGNED` |
| 11 | Ready for One-Way Loaded Trip | Laden gate passed, transhipment unavailable, carpark requested |
| 12 | Ready for Laden Collection | Laden gate passed, transhipment available |
| 13 | Awaiting T/T | VGM received and transhipment `PENDING`; **or** at carpark with transhipment `PENDING` |
| 14 | Awaiting VGM | Container ready, VGM missing |
| 15 | Container Ready | Customer confirmed, VGM present, transhipment not yet checked |
| 16 | Awaiting Customer Stuffing | Container details sent |
| 17 | Awaiting Container Details Notification | Details captured, not sent |
| 18 | Empty Delivered | `EMPTY_COLLECTION` `DELIVERED`, details not captured |
| 19 | Empty Collected | `EMPTY_COLLECTION` `COLLECTED` or `IN_TRANSIT` |
| 20 | Empty Collection Scheduled | `EMPTY_COLLECTION` `SCHEDULED` or `ASSIGNED` |
| 21 | Ready for Empty Collection | Empty gate passed, no movement scheduled |
| 22 | Awaiting CMS | All else complete, CMS pending |
| 23 | Incomplete | Mandatory fields missing |
| 24 | New Export Job | Newly created |

Twenty-four rules producing twenty-one statuses: rows 1 to 3 are the exception statuses, and `Awaiting T/T` is reachable by two distinct routes.

**Note rule 13 and the carpark branch.** A container at the carpark with transhipment still `PENDING` is `Awaiting T/T`, not `At Carpark`. `At Carpark` describes a container whose onward journey is unblocked but unscheduled. This distinction is what makes the carpark dwell count and the transhipment chase count both correct.

This function lives server-side beside the two gate functions. **Three derived values, one module, one place.**

### 45.4 Aggregation across containers

> **New in 2.1.** Edition 2.0 stated that export job status aggregates over movements and has no partial states, because an export job was assumed to hold one container. With several containers it needs the same aggregation import already has.

The mechanism in §33 applies without change. Container status is derived per container; job status summarises them.

```
EXP-260818-001

  C1   ABCU1234567    Delivered to Port
  C2   ABCU7654321    At Carpark
  C3   ABCU9876543    Awaiting VGM

Job status      PARTIALLY DELIVERED
Progress        1 of 3 delivered to port
```

Two values are added to the export job status enum in §45.1 for this purpose:

| Status | Meaning |
|---|---|
| Partially Collected | Some containers' empties collected, not all |
| Partially Delivered | Some containers delivered to port, not all |

**A job is not Completed while any container is outstanding.** Each container carries its own gate results, its own readiness, its own VGM and its own movements, and a blocked container does not block its siblings.

Where a job holds exactly one container, which remains the common case, the partial states never appear and the status behaves exactly as edition 2.0 described.

## 46. Export Movement Patterns

**Normal export job, transhipment available**

```
MOV-001    EMPTY_COLLECTION        Empty Yard  →  Customer    empty
MOV-002    DIRECT_LADEN_TO_PORT    Customer    →  Port        laden
```

**Export job using the carpark, transhipment not available**

```
MOV-001    EMPTY_COLLECTION        Empty Yard  →  Customer    empty
MOV-002    ONE_WAY_LOADED          Customer    →  Carpark     laden
MOV-003    CARPARK_TO_PORT         Carpark     →  Port        laden
```

`MOV-003` is created only when transhipment becomes available, in `PENDING`, and per Section 21 does not appear on the schedule or in planned-work counts until a human progresses it.

### 46.3 Multi-stop stuffing

> **New in 2.1.** Not specified in any previous edition.

A container may be stuffed at one customer location and then moved to a second for further stuffing.

```
MOV-001    EMPTY_COLLECTION        Empty Yard   →  Customer site A    empty
MOV-002    LADEN_SITE_TO_SITE      Customer A   →  Customer site B    part laden
MOV-003    DIRECT_LADEN_TO_PORT    Customer B   →  Port               laden
```

Combined with the carpark branch this reaches four movements, and there is no fixed ceiling.

**What stays constant across a multi-stop job is the container number and the chassis.** Everything else, truck, driver, date, even the destination, may change between legs. Operations were explicit that the arrangement varies by customer, so the system must not assume a fixed pattern.

| Constant | Changes freely |
|---|---|
| `container_id` | `truck`, `driver` |
| `chassis_id` | `planned_date`, `planned_time` |
| `job_id` | `destination`, standby per §21.3 |

**The stuffing plan is an ordered list, not a pair of fields.** Each leg carries its own location, its own driver assignment and its own standby declaration:

```
EXP-260818-004    C1    ABCU1234567    chassis 4029

Stuffing 1    Location A    Driver: Tan       drop and leave
Stuffing 2    Location B    Driver: Rahman    STANDBY REQUIRED
```

Modelling it as a plan rather than as two locations is what allows a third leg to be added without a schema change.

**No ceiling is imposed on the number of stuffing locations.** Operations have seen two and describe three or more as very rare but possible. A hard limit was rejected: a limit of two would fail the first time three were needed, and the failure would appear as a controller quietly working around the system rather than as an error anyone could see.

Standby is common enough on a second leg to be worth planning for. A driver sent to hold at location B is engaged for the duration per §21.3, and the transport schedule must show that engagement rather than showing the driver as available.

`LADEN_SITE_TO_SITE` is **never auto-created.** The trigger is a customer arrangement the system cannot observe, so it is created by a controller when the customer says so. Section 22 lists it as manual by design, not by omission.

A container carrying `cargo_state = PART_LADEN` is not ready, has no VGM, and fails the laden gate in §44.2. It cannot be sent to the port by mistake.

### 46.4 Movements are per container

On a three-container export job, movements run `MOV-001` through `MOV-006` or beyond, each carrying its `container_id`, exactly as §36.4 specifies for import. `movement_ref` is scoped to the job, not the container.

Where two containers are double mounted, **one movement carries both** per §17.1, so a three-container job with one double mount has five movements rather than six.

## 47. Next Action Rules: Export

Consumed by the engine in Section 25.

| Condition | Next action required | Waiting on |
|---|---|---|
| Mandatory information missing | Complete job information | Us |
| CMS not completed | Complete CMS | Us |
| Empty collection ready, not scheduled | Arrange empty collection | Us |
| Empty collection scheduled, date passed, not collected | Chase empty collection | Us |
| Empty collected, container details missing | Enter container, seal and tare | Us |
| Container details captured, not sent | Send container details to customer | Us |
| Empty delivered, details sent | Await customer stuffing | Customer |
| Awaiting stuffing beyond threshold | Follow up customer stuffing | Customer |
| Customer confirms ready, VGM missing | Obtain VGM | Customer |
| VGM implausible | Resolve VGM discrepancy | Customer |
| VGM received, transhipment unknown | Check transhipment | Us |
| Transhipment available, no laden movement | Arrange laden collection to port | Us |
| Transhipment unavailable | Check carpark requirement | Customer |
| Customer requests carpark | Arrange one-way loaded trip | Us |
| Container at carpark, transhipment unavailable | Await transhipment | Carrier |
| Container at carpark, transhipment available | Arrange carpark to port | Us |
| Movement scheduled, planned time passed, not collected | Chase movement | Us |
| Carpark dwell beyond threshold | Escalate carpark dwell | Us |
| Vessel closing approaching, container not at port | Escalate, closing at risk | Us |
| Container delivered to port | Close export job | Us |
| Nothing outstanding | No action required | Nobody |

---

# Chapter E: Screens

## 48. Dashboard

The dashboard is the controller's command centre. Its purpose is not to show statistics. It answers one question:

> **What requires attention right now?**

### 48.1 KPI cards

Merged from the two competing card lists in edition 1.0. Cards are grouped and filterable by domain.

**Cross-domain**

```
Active jobs          Incomplete jobs        Action required
Exceptions open      Movements overdue      Completed today
```

**Import**

```
Containers active    Awaiting permit        Awaiting Portnet
Ready for collection Collections today      Deliveries today
Empty return pending D&D risk
```

**Export**

```
Awaiting CMS              Ready for empty collection    Empty collections scheduled
Awaiting customer stuffing Containers ready             Awaiting VGM
Awaiting T/T              Ready for laden collection    Containers at carpark
Ready for port delivery
```

**Every card opens its filtered list when clicked.**

### 48.2 Action Required panel

The most important dashboard component. Shows the top rows of the Action Required queue with a link to the full list.

```
ACTION REQUIRED                                    ordered by urgency, not by job number

EXP-001   Pending        Awaiting CMS      CMS pending 2 days        Complete CMS            Us
JOB-002   ABCU1234567    Ready            LFD today                  Prioritise collection   Us
EXP-003   TGHU1234567    Awaiting VGM     Ready 4 days, no VGM       Obtain VGM              Customer
JOB-004   GHIU7890123    Awaiting Permit  ETA today                  Request permit          Customer
EXP-005   ABCU9876543    At Carpark       Dwell 6 days               Arrange carpark to port Us
```

Ordered by the precedence in Section 25.1, then age. Filterable by `waiting_on`.

### 48.3 Operational pipeline

Each stage shows a count. Every count is clickable.

```
IMPORT     New → Incomplete → Awaiting Release → Ready → Assigned
           → Collected → Delivered → Empty Returned → Completed

EXPORT     New → Incomplete → Awaiting CMS → Ready for Empty
           → Empty Delivered → Awaiting Customer → Awaiting T/T
           → Laden → Delivered to Port → Completed
```

### 48.4 D&D risk panel

Import only. The panel carries **two columns for every container**, per §34.6: the operational position against our internal LFD, and the charge position against the carrier LFD.

```
CONTAINER       CARRIER   MODEL      INTERNAL LFD        CARRIER LFD

ABCU1234567     ONE       COMBINED   7 Sep   past target  10 Sep   3 days
ABCU7654321     MSC       SPLIT      4 Sep   overdue 2     4 Sep   OVERDUE
TGHU5678912     PIL       SPLIT      9 Sep   5 days        6 Sep   2 days
```

The third row is the case that justifies the whole design: the carrier grants less free time than our standard assumes, so the container is comfortable on the operational stream and two days from charges on the financial one. A single-figure panel would show it as green.

Sorting defaults to charge risk, then operational risk. Filters cover both streams independently, so a manager can ask for everything at charge risk and a controller can ask for everything past internal target.

**The word overdue appears only against the carrier column.**

### 48.3A Date churn

Where `amendment_count` passes the configured threshold, the job appears in the Action Required queue showing the original date, the current date and the number of changes, so that a repeatedly moved job surfaces as a pattern rather than as a series of individual edits.

### 48.4A Standby on the schedule

A movement with `standby_required` shows its truck and driver as engaged for the whole standby period, not merely at the delivery moment. Section 52 must reflect this, otherwise a driver held on standby appears available.

Where standby has started and not ended, the schedule shows the elapsed time live, because an open-ended standby is the case a controller most needs to see.

### 48.5 Carpark panel

Export only. Containers currently at the carpark, each with dwell days and transhipment status.

### 48.6 Today's transport

Movements in `SCHEDULED`, `ASSIGNED`, `COLLECTED` or `IN_TRANSIT` with a planned date of today, across both domains. `PENDING` movements never appear here.

### 48.7 Filters

Customer, controller, carrier, domain, date, ETA, vessel, status, terminal, priority. The dashboard defaults to active operational jobs.

## 49. Job Trackers

Two trackers, one per domain, sharing the same table component.

**Import columns:** job number, customer, BL, house BL, shipper, consignee, carrier, vessel/voyage, ETA, container count, permit status, Portnet status, completion %, job status, next action, waiting on, priority, controller, updated.

**Export columns:** job number, customer, shipper, booking reference, container number (blank until captured), vessel/voyage, ETA, CMS status, transhipment status, job status, next action, waiting on, controller, updated.

**Saved views, import:** All Active, Incomplete, Awaiting Permit, Awaiting Portnet, Ready for Collection, Collection Today, Delivery Today, Empty Return Pending, Exceptions, Completed.

**Saved views, export:** All Active, Incomplete, Awaiting CMS, Ready for Empty Collection, Awaiting Customer, Awaiting T/T, At Carpark, Ready for Port Delivery, Exceptions, Completed.

## 50. Container Tracker

Independent of the job trackers, and **spanning both domains**. Its purpose is to track individual container operational status and risk.

Searching a container number returns its complete operational history regardless of domain:

```
Container         ABCU1234567
Job               EXP-260817-001        Export
Customer          ABC Pte Ltd
Shipper           XYZ Manufacturing

CONTAINER INFORMATION
Seal              123456
Tare              3,850 KG
VGM               24,500 KG

MOVEMENTS
MOV-001    EMPTY_COLLECTION    XYZ Depot → Customer    Completed
MOV-002    ONE_WAY_LOADED      Customer → Carpark      Completed
MOV-003    CARPARK_TO_PORT     Carpark → Port          Pending

CURRENT LOCATION  Company Carpark          dwell 6 days
TRANSHIPMENT      Pending
NEXT ACTION       Await transhipment       waiting on Carrier
```

**Import columns:** container number, job number, customer, carrier, vessel, ETA, terminal, empty return yard, demurrage LFD, detention LFD, days remaining, D&D risk, collection eligibility, container status, current location, next action.

**Export columns:** container number, job number, customer, shipper, vessel, ETA, seal, tare, VGM, transhipment status, current location, carpark dwell days, job status, next action.

A controller searching a container number does not know, and should not need to know, which module it belongs to.

## 51. Job Detail Screens

Both domains follow one layout convention: a header strip carrying identity and derived status, a readiness panel, then tabbed content.

### 51.1 Import

```
JOB-260817-001                              READY FOR COLLECTION ●
Customer  ABC Company     BL  ABC123456     ETA  17 Aug 2026     Controller  Sarah

COLLECTION READINESS
Information complete       ✓
Permit received            ✓
Portnet released           ✓
● READY FOR COLLECTION

NEXT ACTION    Assign transportation                        Waiting on  Us

TABS
Overview   Containers   Movements   Documents   Emails   Exceptions   Activity   Notes
```

The Containers tab is the default once containers exist. Each container shows size, LFD, days remaining, status, eligibility and its own movements.

### 51.2 Export

```
EXP-260817-001                              AWAITING T/T ●
Customer  ABC Pte Ltd     Booking  BK-99213  Vessel/Voyage  Vessel XYZ / 123E   ETA  17 Aug

READINESS
Information complete       ✓
CMS completed              ✓
Container details sent     ✓
Container ready            ✓
VGM received               ✓
Transhipment               PENDING    ← blocking

NEXT ACTION    Check transhipment                           Waiting on  Us
LOCATION       Customer / Shipper

TABS
Overview   Movements   Container   Documents   Emails   Exceptions   Activity   Notes
```

The Movements tab is the default once the first movement exists. It is the operational heart of the export screen.

### 51.3 Movement history panel

Present on both. **The movement history is the operational narrative of the job and must be readable as one.**

| Movement | Route | Type | Status | Planned | Collected | Delivered |
|---|---|---|---|---|---|---|
| MOV-001 | Empty Yard → Customer | Empty Collection | Completed | 19 Aug | 19 Aug 08:40 | 19 Aug 11:15 |
| MOV-002 | Customer → Carpark | One-Way Loaded | Completed | 22 Aug | 22 Aug 09:05 | 22 Aug 13:30 |
| MOV-003 | Carpark → Port | Carpark to Port | Pending |, |, |, |

Cancelled movements remain visible, greyed, with their cancellation reason. Auto-created movements are marked as such.

**A controller should be able to reconstruct what happened from this panel alone, without opening the audit log.** The audit log answers *who* and *when*. The movement history answers *what*.

## 52. Transport Schedule

A daily view of movements across both domains in `SCHEDULED`, `ASSIGNED`, `COLLECTED` or `IN_TRANSIT`. **Never `PENDING`.**

| Time | Movement | Job | Container | Customer | Type | Origin | Destination | Truck | Driver | Status |
|---|---|---|---|---|---|---|---|---|---|---|

Movements past their planned time without progressing to `COLLECTED` are flagged and raise the overdue exception.

## 53. Supporting Screens

### 53.1 Inbox

Columns: received, sender, subject, detected customer, detected document, detected container, matched job, extraction confidence, processing status.

```
AUTO PROCESSED    REVIEW REQUIRED    UNMATCHED    FAILED
```

### 53.2 Review queue

Automation must not force uncertain matches.

```
Incoming email / document

Suggested match      JOB-260817-001
Confidence           73%
Detected             Container ABCU1234567, BL ABC12345

[Confirm match]   [Select different job]   [Create new job]   [Ignore]
```

### 53.3 Notifications

In-app, and each links directly to the job it concerns. **A notification that does not link to its record is not actionable.**

| Trigger | Recipient |
|---|---|
| Mandatory information incomplete | Assigned controller |
| Permit or Portnet outstanding, ETA within threshold | Assigned controller |
| Job becomes ready for collection | Assigned controller |
| Container approaching or past LFD | Controller and manager |
| Empty return due or overdue | Assigned controller |
| Job becomes ready for empty collection | Assigned controller |
| Empty delivered, container details not captured | Assigned controller |
| Container details not sent within threshold | Assigned controller |
| Container ready received | Assigned controller |
| VGM received | Assigned controller |
| Transhipment pending beyond threshold | Controller and manager |
| Carpark dwell exceeds configured days | Controller and manager |
| Vessel closing approaching, container not at port | Controller and manager |
| Movement overdue | Assigned controller |
| Document conflict detected | Assigned controller |
| Email requires review | Assigned controller |
| Exception assigned to user | That user |

Email notifications may be added later.

### 53.4 Handover view

Supports shift and staff handover. Initially derived from dashboard filters rather than built as a separate module.

```
Outstanding critical jobs      Today's collections        Today's deliveries
Missing permits                Pending Portnet releases   Awaiting CMS
D&D risks                      Carpark dwell              Open exceptions
Pending empty returns          Jobs updated since last login
```

### 53.5 Completed jobs

Completed jobs remain fully searchable by job number, container, customer, BL, house BL, booking reference, vessel, carrier and date. Historical documents, movements and activity logs remain accessible.

Reopening requires administrator permission, a reason and an audit event, per Section 27.3.

---

# Chapter F: Delivery

## 54. API Surface

One API serving both domains.

```
/auth
/users
/master-data

/import-jobs                       create, read, update, list, close, reopen
/import-jobs/:id/release           record permit and Portnet status
/import-jobs/:id/eligibility       read only, derived
/containers                        create, read, update, list
/containers/:id/dd                 demurrage and detention record

/export-jobs                       create, read, update, list, close, reopen
/export-jobs/:id/cms               record CMS completion
/export-jobs/:id/container         capture container, seal, tare
/export-jobs/:id/notify            send container details, record event
/export-jobs/:id/readiness         confirm container ready, record VGM
/export-jobs/:id/transhipment      record availability check

/movements                         list, filter by job, domain, type, status, date
/movements                  POST   create manually
/movements/:id             PATCH   update status, schedule, assign
/movements/:id/cancel       POST   cancel with reason
/movements/:id/override     POST   administrator override with reason
/jobs/:id/movements                movements for one job, ordered
/schedule                          movements in schedulable states only

/jobs/:id/next-action              read only, derived
/jobs/:id/location                 read only, derived
/jobs/:id/close             POST   subject to Section 27.3

/queues/incomplete                 read only
/queues/action-required            read only, filterable by waiting_on
/queues/exceptions                 read only
/exceptions/:id/resolve     POST   resolve with note

/documents                         upload, version, attach
/emails                            list, match, review
/extraction
/notifications
/audit                             read only
/reports                           export
```

There is no `/transport` domain. Edition 1.0 carried `/transport` for import and `/movements` for export, describing the same resource.

> **`job_status`, `next_action_required`, `blocking_reason`, `waiting_on`, `current_location`, `collection_eligible` and the two export gate results must be read-only computed values.** If any is writable through the API, the engine can be bypassed, and it will be.

## 55. Data Model

```
users                       customers                  shippers
carriers                    yards                      terminals
ports                       locations                  ← includes the company carpark
container_types             job_types                  document_types
chassis                     trucks
exception_types             dd_rules                   config_thresholds

import_jobs                 containers
export_jobs

movements                   ← one table, both domains, per Section 17
documents                   emails                     email_attachments
exceptions                  notes                      audit_events
notifications               release_checks
demurrage_records           detention_records
```

**One `movements` table, not two.** It carries `job_domain` and a nullable `container_id`. Edition 1.0 specified `transport_movements` for import and `export_job_movements` for export; the engine in Chapter B cannot be written once against two tables.

**One `exceptions` table** and **one `audit_events` table**, both carrying `job_domain`.

`config_thresholds` holds `threshold_key`, `scope`, `customer_id`, `value`, `unit`, every threshold referenced in this document, configurable globally or per customer.

## 56. System-Calculated Fields

Never user-editable, computed server-side.

| Field | Derived from |
|---|---|
| `mandatory_fields_complete` | Configured mandatory field set, §30 / §40.1 |
| `missing_information` | List of unsatisfied mandatory fields |
| `job_completion_percent` | Satisfied fields over configured set |
| `collection_eligible` | §31 |
| `empty_collection_eligible` | §41 |
| `laden_movement_eligible` | §44.2 |
| `container_status` | §32.1 |
| `job_status` | §32.2 / §45.2 |
| `current_location` | §24 |
| `next_action_required` | §37 / §47 |
| `blocking_reason` | §25 |
| `waiting_on` | §25.2 |
| `cargo_state` | Movement type, §19 |
| `days_until_lfd` | Container LFD to now |
| `dd_risk_level` | §34.2 |
| `demurrage_chargeable_days` | LFD to collection |
| `detention_chargeable_days` | LFD to empty return |
| `carpark_dwell_days` | `carpark_arrived_at` to now |
| `chassis_days` | `chassis_mounted_at` to release or now, §35.5 |
| `chassis_status` | Job and movement records, §35.3 |
| `available_chassis_20ft` / `_40ft` | Active fleet less in use, inspection and maintenance, §35.4 |
| `movement_overdue` | Planned time against current status |
| `condition_age` | Detection timestamp to now |
| `required_by` | LFD, vessel closing, or configured threshold |
| `exception_count` | Open exceptions on the job |
| `outstanding_document_count` | Checklist against received |

## 57. Consolidated Business Rules

### 57.0 Rules added in edition 2.1

1. An export booking may cover several containers. All belong to one job number, and a second job number is never created for the same booking.
2. Each export container carries its own gate results, readiness, VGM, chassis and movements. A blocked container does not block its siblings.
3. A movement may carry two containers only where every constraint in §19.1 holds. This is a hard rule, not a warning.
4. A double-mounted pair counts `chassis_days` once, not twice.
5. Stuffing may run across any number of customer locations. Container ready and VGM apply only to the finished container.
6. A container in `PART_LADEN` state cannot satisfy the laden gate.
6a. A container with an outstanding stuffing transfer movement cannot hold a VGM. One arriving early raises a discrepancy and is not stored.
7. Laden imports may be held at the company carpark, and the reason is recorded because it decides who we are waiting on.
8. Free time continues to run while a container is at the company carpark, in either domain.
9. Free time is counted three ways: our internal standard from vessel ETA, the carrier's contractual count, and the resulting charge estimate. All three are stored.
9a. Free time produces two independent alert streams, operational and charge risk, per §34.6. Neither is suppressed because the other is green.
9b. A container is described as overdue only against the carrier last free date, never against the internal target.
10. A carrier issuing a combined demurrage and detention allowance is shown one countdown, never two.
11. The `EMPTY_RETURN` movement is created automatically but cannot leave `PENDING` until the customer confirms the container is empty.
12. Portnet processing state is recorded and warned on. It never blocks the creation of a laden movement.
13. Truck-in and truck-out dates are fixed by the yard booking and may be amended only with a recorded customer agreement and a mandatory reason.
13a. No date field may be changed without a reason code. Enforced server-side.
13b. Date amendments are never edited or deleted. A wrong entry is corrected by a further amendment.
13c. Every date field displays its original value, its current value and its amendment count.
14. A reefer container must carry a temperature mode and setpoint as structured values, never as free text.
15. Stuffing locations are selected from the customer's location master, never typed onto a job.
16. Standby is a recorded customer instruction. The system never infers it from timestamps.
17. A truck and driver on standby are unavailable for other work and are blocked on the transport schedule for the whole period.
18. Standby stops no other clock. Demurrage, detention and chassis occupancy continue to run throughout.
19. `standby_minutes` is derived from the recorded start and release times and is never editable.



Enforced server-side. This list is the compliance checklist for the build.

**Platform**

1. Job numbers are system-generated, unique across both domains, and immutable.
2. Job status, container status, location, next action, blocking reason and waiting-on are computed, never typed.
3. The only statuses a user may set directly are On Hold, Cancelled and Exception, each requiring a reason.
4. Every gate override requires a named user, a timestamp, a mandatory reason and an audit event, and raises a Medium exception.
5. Extracted values never silently overwrite critical operational fields; conflicts raise a discrepancy.
6. Email processing is idempotent.
7. Hard deletion of operational records is prohibited.
8. Critical audit events cannot be deleted or edited by standard users.
9. System-generated audit entries name the rule that produced them.
10. Where the system cannot establish a fact reliably, it records who established it and when, rather than deriving it badly or leaving it blank.
11. Irregular cases are raised as exceptions and resolved by a person. The system records the outcome, it does not prescribe the choice.

**Movements**

12. One job may contain multiple movements, all linked to the same job number. A shipment is never split across job numbers.
13. `movement_ref` is unique within a job and is never reused, including after cancellation.
14. Movement type is a stored enum, never inferred from origin and destination.
15. Movements in `PENDING` are excluded from the transport schedule and from planned-work counts.
16. An auto-created movement is only ever created when its trigger condition is already true.
17. Duplicate active movements of the same type on the same job are rejected unless explicitly overridden.
18. A cancelled movement is retained, remains visible, and never blocks re-creation.
19. A movement cannot skip from `SCHEDULED` to `DELIVERED`; an inferred `COLLECTED` is written and audited.
20. Completing a movement never closes the parent job unless Section 27.3 is satisfied.

**Import**

21. A container cannot be collected until mandatory information is complete, the permit is received where required, and Portnet release is confirmed.
22. A container number must be unique across open jobs; reuse on a closed job is legitimate.
23. Each container carries its own eligibility, free-time clocks and movements; a blocked container does not block its siblings.
24. Demurrage and detention are separate clocks with separate last free days, computed per container.
25. The detention clock stops when `EMPTY_RETURN` reaches `COMPLETED`.
26. A job with any container outstanding is not Completed.
27. A chassis is assigned at job level and inherited by every movement on that job.
28. Chassis size must match container size.
29. Chassis status and availability are derived from job records, never typed.
30. Chassis unavailability warns and raises an exception; it does not block scheduling.

**Export**

31. An export job cannot become Ready for Empty Collection until mandatory information is complete and CMS is completed where required.
32. CMS `Not Required` is an explicit permissioned choice with a mandatory reason.
33. Container number, seal and tare are captured after the empty is collected, and `EMPTY_COLLECTION` cannot reach `COMPLETED` without them.
34. Container details must be sent to the customer before the job progresses to Awaiting Customer Stuffing.
35. The laden workflow cannot begin until the customer confirms the container is ready.
36. VGM must be recorded before any laden movement is created, and must exceed tare weight.
37. Transhipment status determines laden routing: available produces `DIRECT_LADEN_TO_PORT`; unavailable with carpark requested produces `ONE_WAY_LOADED`.
38. `CARPARK_TO_PORT` is created as a new movement once transhipment becomes available, never as an edit to `ONE_WAY_LOADED`.
39. A container at the carpark with transhipment unresolved is `Awaiting T/T`, not `At Carpark`.
40. Transhipment checks are recorded with a timestamp and a user.

## 58. Worked Examples

### 58.1 Import, standard job

```
JOB-260818-001

Day 0   Email with NOA, Invoice, Packing List received
        Extracted: ABC Company, BL ABC123456, ABCU1234567, Vessel XYZ / 123E, ETA 20 Aug
        Job and container created
        Status: Incomplete            Next: Complete job information       Waiting on: Us

Day 0   Information completed
        Status: Awaiting Permit       Next: Request permit                 Waiting on: Customer

Day 1   Permit email matched on container number
        permit_received = true
        Status: Awaiting Portnet      Next: Check Portnet release          Waiting on: Us

Day 1   Portnet release confirmed by Sarah
        CAN_COLLECT returns true
        Status: Ready for Collection
        System auto-creates MOV-001   IMPORT_DELIVERY   PENDING
        Next: Assign transportation

Day 2   MOV-001 scheduled 14:00, truck and driver assigned
        Status: Transport Assigned    Location: Terminal

Day 2   MOV-001 collected 14:12, detention clock starts
        Delivered 16:40, POD captured, MOV-001 → COMPLETED
        Status: Empty Return Pending  Location: Customer
        System auto-creates MOV-002   EMPTY_RETURN   PENDING
        Next: Return empty container

Day 4   MOV-002 completed, empty return confirmation received
        Detention clock stops
        Status: Completed
```

### 58.2 Export, carpark job

```
EXP-260818-002        Transhipment not available

Day 0   Job created from booking email, information completed, CMS completed
        CAN_COLLECT_EMPTY returns true
        Status: Ready for Empty Collection
        System auto-creates MOV-001   EMPTY_COLLECTION   PENDING

Day 1   MOV-001 scheduled and assigned
        Status: Empty Collection Scheduled     Location: Empty Collection Yard

Day 2   MOV-001 collected, then delivered
        Status: Empty Delivered                Location: Customer
        Next: Enter container, seal and tare

Day 2   ABCU1234567, seal 123456, tare 3,850 KG captured
        MOV-001 → COMPLETED
        Details sent to customer
        Status: Awaiting Customer Stuffing     Waiting on: Customer

Day 4   Customer confirms ready, VGM 24,500 KG received by email
        VGM validated against tare, plausible
        Status: Awaiting T/T                   Next: Check transhipment    Waiting on: Us

Day 4   Transhipment checked: NOT AVAILABLE. Customer requests carpark
        carpark_requested = true
        System auto-creates MOV-002   ONE_WAY_LOADED   PENDING
        Status: Ready for One-Way Loaded Trip

Day 5   MOV-002 scheduled, collected, delivered, completed
        carpark_arrived_at set
        Location: Company Carpark
        Status recomputes to Awaiting T/T      Next: Await transhipment    Waiting on: Carrier

Day 8   Carpark dwell reaches 3 days
        Exception raised: Carpark dwell exceeded, High

Day 9   Transhipment becomes available
        System auto-creates MOV-003   CARPARK_TO_PORT   PENDING
        Status: Ready for Port Delivery        Next: Arrange carpark to port

Day 10  MOV-003 scheduled, collected, delivered, completed
        Status: Delivered to Port              Location: Port
        Exception resolved. Job closed. Status: Completed

All three movements belong to EXP-260818-002. No second job number was created.
```

### 58.3 The exception path

```
EXP-260818-003        Empty delivered, details never captured

Day 2   MOV-001 marked DELIVERED
        Container number still null
        MOV-001 cannot reach COMPLETED
        Status: Empty Delivered      Next: Enter container, seal and tare

Day 3   Threshold of 24 hours passed
        Exception raised: Empty delivered without container details, High
        Job appears in the Exception queue AND the Action Required queue
        Waiting on: Us

Day 3   Controller enters details
        MOV-001 → COMPLETED
        Exception resolved with note
        Status: Awaiting Container Details Notification
```

**This example is the failure the system exists to catch.** Without the `DELIVERED` / `COMPLETED` distinction in Section 20, a delivered empty with no container number simply looks finished.

## 59. Acceptance Criteria

### 59.1 Job creation

- A job can be created manually and automatically, in either domain
- Job numbers are system-generated, unique across both domains and immutable
- An import job supports multiple containers
- Required fields are validated and a live missing list is shown
- An incomplete job saves without losing entered data
- Every change is recorded in the audit trail
- The job is findable via global search

### 59.2 Email automation

- Configured operational emails are received and metadata stored
- Attachments are stored and classified
- Key shipment information is extracted with `value / source / confidence / timestamp`
- Existing jobs are matched using the domain priority order in Section 11.2
- Low-confidence results enter the review queue and never update a job
- Processing the same email twice creates no duplicate records
- A conflicting critical value raises a discrepancy rather than overwriting

### 59.3 Gates

- **Import.** A container with any mandatory field missing shows Incomplete and lists them; permit outstanding shows Awaiting Permit; Portnet outstanding shows Awaiting Portnet; all satisfied shows Ready for Collection
- **Import.** No `IMPORT_DELIVERY` movement can be created or scheduled while `collection_eligible` is false
- **Export.** CMS pending shows Awaiting CMS; all satisfied shows Ready for Empty Collection
- **Export.** No `EMPTY_COLLECTION` movement can be created while the empty gate fails
- **Export.** No laden movement of any type can be created while the laden gate fails
- **Export.** A VGM at or below tare weight is rejected and raises a discrepancy
- Every gate result is returned by the API and is not computed in the browser
- An administrator override succeeds, records a reason, raises a Medium exception, and remains visible on the job permanently

### 59.4 Movements

- A single job can contain at least three separate movements
- Each movement is individually scheduled, assigned and tracked
- Movement type is stored explicitly and appears on the movement history
- `movement_ref` is unique within the job and is never reused after cancellation
- A duplicate active movement of the same type is rejected with a clear message
- A cancelled movement remains visible and does not block re-creation
- An auto-created movement enters in `PENDING` with `auto_created = true` and an audit event naming its trigger
- A `PENDING` movement appears in no schedule, count or driver view
- A `CARPARK_TO_PORT` movement can be created after the fact without altering earlier movements
- Completing a movement does not close the parent job

### 59.5 Status and location

- Every active job displays exactly one derived status
- Current location displays on the job, the tracker and the queues
- Location recomputes when a movement status changes, including when a movement is edited backwards
- Contradictory movement records produce `Unknown / Exception` and raise a Critical exception
- Neither status nor location is writable through the API
- Import job status correctly reflects partial states across multiple containers

### 59.6 Next action engine

- Every active job displays exactly one `next_action_required` and one `waiting_on`
- No user can type or edit either
- The action changes automatically when the underlying condition changes
- The precedence in Section 25.1 is observed where several conditions are true
- A `blocking_reason` accompanies the action and names the specific condition
- The engine is exercised by tests covering **every row** of Sections 37 and 47

### 59.7 Queues and dashboard

- The Incomplete, Action Required and Exception queues exist separately
- A job can appear in more than one, and does so correctly
- The Incomplete queue lists the specific missing fields per job
- The Action Required queue is filterable by `waiting_on` and by domain
- The Exception queue lists type, severity, waiting-on and required action
- Default sort is precedence then age, never job number
- Every KPI card opens its filtered list
- Containers at the carpark show dwell days; containers approaching LFD show days remaining
- Overdue movements appear on the dashboard and in the exception queue

### 59.8 Documents

- A document can be uploaded, categorised, and attached to a job, container or movement
- Documents preview and download, showing source and received date
- A revised document supersedes rather than replaces its predecessor
- The document checklist reflects received against expected

### 59.9 Audit

- Every event in Section 13 writes an audit record
- System-generated changes name the rule that produced them
- Overrides record user, time, rule and reason
- Audit records are immutable to standard users
- The audit log for one job reads as a chronological narrative

## 60. Build Sequence

Operational correctness before visual complexity. Each phase is usable on its own.

### Phase 1: Foundation

Authentication and role gating · database and schema · master data · import job and container entities · export job entity · **movement entity and state machine, manual creation only** · document upload and versioning · job trackers · container tracker · global search

*Establishes the system of record.*

### Phase 2: Operational controls

Mandatory field engine · permit and Portnet tracking · collection eligibility engine · CMS tracking · empty collection gate · laden gate · **status derivation, both domains** · **location engine** · Incomplete queue · exception records and types

*Stops movements beginning without their prerequisites.*

### Phase 3: The engine

**Next action engine and precedence ladder** · `waiting_on` · Action Required queue · Exception queue · thresholds and configuration · age and required-by clocks

*This is the product. Phases 1 and 2 exist to make this computable.*

### Phase 4: Movements and notification

Movement scheduling and assignment · transport schedule · container identity capture · customer notification · container ready and VGM · transhipment check · the carpark path · duplicate prevention · **automatic movement creation**

*Automatic creation is deliberately last within this phase. It is the feature most likely to produce confusing duplicate records, and it should be switched on only once the state machine, the derivation rules and the duplicate guard are proven with manual creation.*

### Phase 5: Automation

Email ingestion · document classification · extraction with provenance · discrepancy path · job matching, both domains · review queue · automatic document attachment

*Removes manual data entry.*

### Phase 6: Control tower

Dashboard and KPI cards · Action Required panel · operational pipeline · D&D countdown and alerts · carpark dwell panel · handover view · notifications · management reporting

*Gives controllers and management visibility.*

### Phase 7: Commercial

Trip cost tracking · demurrage and detention cost calculation · customer billing · profitability per job · Portnet API · carrier APIs · GPS · driver application · customer portal · predictive exception detection

*Later, and only once the core is trusted.*

**The MVP is Phases 1 to 6.**

### 60.1 Sequencing notes

Export does not depend on import business logic. It depends on the shell, the extraction package and the engine. **Export work can begin in parallel once Phase 1 is complete.**

The engine in Phase 3 depends on Phase 2's derivation and location functions, which depend on Phase 1's movement state machine. That chain is the critical path and should not be reordered.

## 61. Definition of Done

### 61.1 Import

A controller can run a job end to end without a spreadsheet:

```
Receive shipment information → create or identify the job → identify containers
→ store documents → see what is missing → confirm permit → confirm Portnet release
→ system determines eligibility → schedule collection → confirm collection
→ confirm delivery → track empty return → close the job
```

### 61.2 Export

```
Receive booking → create the export job → see what is missing → record CMS completion
→ system confirms empty collection eligibility → schedule and complete the empty movement
→ capture container, seal and tare → send details to the customer
→ record container ready and VGM → record transhipment availability
→ create the correct laden movement, direct or via carpark → complete port delivery
→ close the job
```

### 61.3 The real test

Both of the above describe a controller working *jobs*. The system is done when a controller no longer works jobs at all:

```
Open the Action Required queue
        ↓
Filter to waiting on us
        ↓
Work the list top to bottom
        ↓
Each row states the job, the container, where it is,
what is blocking it, and what to do
        ↓
Completing the action removes the row
        ↓
The queue is empty at the end of the day
```

**An empty Action Required queue must be an achievable state.** If it can never be emptied, the thresholds are wrong, not the controller.

At every point, management must be able to see the current position from the dashboard.

### 61.4 Key user outcome

A transportation controller must be able to open the system and immediately answer:

- Where is the container?
- What movement has already been completed?
- What movement needs to happen next?
- Is anything preventing the next movement?
- What action does the transportation team need to take, and who are we waiting on?

The system therefore operates on the model:

```
Job → Container → Movement → Milestone → Exception → Next Action
```

rather than functioning as a static job tracker.

> **The measure of this system is not what it stores. It is whether a controller ever again has to open a job to find out whether anything is wrong.**

---

# Appendix A: Decision Register

Every conflict, gap and duplication resolved in this edition. Items 1 to 8 are the ones Part III already identified; items 9 to 27 were not previously flagged.

## A.1 Previously identified (Part III, Section 1)

| # | Item | Edition 1.0 | Resolution | Now in |
|---|---|---|---|---|
| 1 | Movement type names | Part II: `EMPTY_COLLECTION`, `LADEN_DIRECT`, `ONE_WAY_LOADED_TRIP`, `CARPARK_TO_PORT`. Part III: `EMPTY COLLECTION`, `DIRECT LADEN TO PORT`, `ONE-WAY LOADED`, `CARPARK TO PORT` | Part III's semantics with valid enum identifiers. Spaced capitals are not identifiers; display names carry the readable form | §19 |
| 2 | Movement statuses | Part II: 7 values. Part III: 11 | 11 values | §20 |
| 3 | Job status count | Part II: 20. Part III adds `Ready for One-Way Loaded Trip` | 21 values | §45.1 |
| 4 | Carpark progression | Part II: At Carpark → Ready for Port Delivery. Part III: At Carpark → Awaiting T/T → Ready for Port Delivery | Part III. A container at the carpark with transhipment unresolved is genuinely awaiting transhipment | §44.4, §45.2 |
| 5 | Container number on the movement | Part II: identity on the job only. Part III: movement carries a number | Nullable reference on the movement, populated when known. Removes the multi-container migration entirely | §17, §39 |
| 6 | Automatic movement creation | Part II: must not pre-create placeholders. Part III: system should auto-create | Both. Create at the moment the trigger fires, in `PENDING`, invisible to planning | §21, §22 |
| 7 | Movement identifier | Part II: UUID plus sequence number. Part III: `MOV-001` per job | UUID as primary key, `MOV-NNN` as display reference. Sequence number dropped, see item 23 | §18 |
| 8 | Queue model | Part II: Incomplete and Exception. Part III: combined Action Required / Exception | Three queues. Missing data, required action and genuine exception are different problems with different owners | §26 |

## A.2 Newly identified, structural

| # | Item | Edition 1.0 | Resolution | Now in |
|---|---|---|---|---|
| 9 | **Two movement models** | Part I tracked movement as a status on the container with a 10-value transportation enum and a `transport_movements` table. Part III specified a first-class movement record with an 11-value state machine | One movement model, both domains. Import gains `IMPORT_DELIVERY` and `EMPTY_RETURN` movements. One `movements` table carrying `job_domain` | §17, §19, §36, §55 |
| 10 | **Two next-action engines** | Part I §55 produced a flat `next_action` string. Part III §16 to 19 produced `next_action_required` + `blocking_reason` + `waiting_on` under a precedence ladder | One engine with Part III's shape, and two domain rule tables | §25, §37, §47 |
| 11 | **Two exception shapes** | Part I §37: category, description, assigned user, due date. Part III §28: type, blocking, waiting-on, detected-at | One record, superset of both, carrying `job_domain` | §27.1 |
| 12 | **Two audit shapes** | Part I §57: entity, field, values, actor, source. Part III §36: adds `event` and requires the rule to be named | Part III's shape with Part I's source enum, serving both domains | §13 |
| 27 | **No chassis concept anywhere** | None of the three parts mentioned chassis, trailer or prime mover. A movement carried one optional `truck` field. Because containers are never dismounted, chassis occupancy runs for the whole job and is the fleet's real capacity constraint | New Section 35. Chassis assigned at job level, status derived, availability by size, occupancy as a third clock | §9.1, §17, §35 |
| 13 | **Mandatory fields double-counted as gate conditions** | Part I §31 listed permit and Portnet status as mandatory fields *and* §32 as gate conditions. Part II §16 did the same with CMS while §14 permitted `Not Required`, making that field unsatisfiable for exempt jobs | Mandatory fields describe data completeness; gates describe milestones. Nothing appears in both | §30, §40.1 |

## A.3 Newly identified, enumeration and duplication

| # | Item | Edition 1.0 | Resolution | Now in |
|---|---|---|---|---|
| 14 | Export status derivation order | Part II §25 gave 19 rules; Part III §14 gave 24, with `At Carpark` at a different precedence | Part III's 24 rules, with the two routes to `Awaiting T/T` made explicit | §45.2 |
| 15 | Export exception types | Part II §27 listed 9 without severity; Part III §29 listed 14 with severity | Merged and extended to cover import, grouped shared / import / export | §27.2 |
| 16 | Import exception types never given severities | Part I §37 listed 18 categories with no severity or trigger | Triggers and severities assigned, matching the export table's shape | §27.2 |
| 17 | Export dashboard KPI cards | Part II §28 listed 15 cards; Part III §31 listed 13, overlapping but different | One merged list, grouped cross-domain / import / export | §48.1 |
| 18 | Import had only two queues | Part I had Incomplete and Exception, plus a dashboard Action Required *panel* but no queue | Three queues platform-wide. The panel remains, as the dashboard view of the queue | §26, §48.2 |
| 19 | Container status machine duplicated transport status | Part I carried a 9-state container machine and a 10-value transportation status describing the same progression | Container status derived from its movements; the parallel enum is removed | §32.1 |
| 20 | `import_export` enum on the import job | Part I §9 carried the field while Part II created a separate `export_jobs` table, making it dead weight | Removed. Domain is determined by the table | §28 |
| 21 | VGM comparison stated inconsistently | Part II §20 said *lower than* tare; Part II §38.6, Part II §45 and Part III §29 said *at or below* | At or below. A laden container cannot weigh exactly its tare | §43 |
| 22 | Container duplicate rule too strict | Part I §12 prevented duplicates globally, which breaks on the second use of any box | Unique across *open* jobs. Reuse on a closed job is legitimate and expected | §29.1 |
| 23 | `sequence_number` and `movement_ref` diverge | Part III §6 carried both. They separate the moment a movement is cancelled, because `movement_ref` skips and a sequence counter does not | `sequence_number` dropped. Order by `movement_ref`, `created_at` breaks ties | §18 |
| 24 | API path collision | Part I §73 defined `/transport`; Parts II and III defined `/movements` for the same resource | `/movements` only | §54 |
| 25 | Job closure specified twice | Part I §60 and Part III §33 gave different shapes for the same rule | One rule, parameterised per domain | §27.3 |
| 26 | Figure numbering broken | Part I contained two figures labelled `FIGURE I.8`; `FIGURE I.10` was captioned `Figure I.7`; the container-status figure was labelled `I.8` and captioned `I.10` | Figures removed from this text edition pending regeneration; see the note below |, |

## A.4 Open items for the team

Three things this edition could not decide on the team's behalf.

**A.4.1 Figures.** Edition 1.0 carried 30 figures, several of which were genuinely load-bearing: the two structural-difference diagrams, the gate flows, the status maps, the carpark timeline. This edition is text-complete but figure-free. The figures should be regenerated against the merged section numbering before handover, and roughly two-thirds of them will need redrawing rather than renumbering, because the movement-model and next-action-engine merges changed what they depict.

**A.4.2 Import carpark equivalent.** ~~Open.~~ **Closed in 2.1.** Operations confirmed laden imports are held at the company carpark, triggered either by the customer having no space or by a controller decision. Specified in §36.2 with two new movement types, a recorded reason, and dwell counted as for export. Free time continues to run, per §34.5.

**A.4.3 Chassis maintenance procedure.** Section 35.8 treats a mid-job chassis withdrawal as an exception and records the outcome without prescribing it, because no procedure exists today. If one is later agreed, whether the container is grounded or transferred and who decides, it can be promoted from an exception to a defined path. Until then the system must not assume one.

**A.4.3a Standby thresholds.** §21.3 introduces two with no starting value: the maximum standby duration before escalation, and the arrival-to-departure gap above which unflagged standby is suspected. The second is the more delicate, because setting it too low will flag ordinary delays as unrecorded standby.

**A.4.4 Thresholds.** Every threshold in this document is specified as configurable, but no defaults are given beyond D&D. Before Phase 3, the team needs starting values for: stuffing overdue, VGM overdue, container details not sent, transhipment unresolved, carpark dwell, movement overdue, movement stalled, email unmatched, empty return overdue, and **new in 2.1**, empty-ready confirmation overdue, Portnet not processed, and free time basis mismatch tolerance. Wrong defaults make the Action Required queue un-emptiable, which Section 61.3 identifies as the failure mode to avoid.

## A.5 Assumptions made in edition 2.1

Three points where operations gave a partial answer and this edition made a call rather than leaving a gap. Each is reversible by configuration or a small change, and each should be confirmed.

**A.5.1 Which free time number drives the alert.** ~~Assumption.~~ **Closed.** Operations confirmed: show both, as two separate alert streams. The internal ETA-based count raises the operational warning, the carrier's contractual count raises the charge risk warning, and the word overdue is reserved for the carrier date. Specified in §34.6 and §48.4, with three new exception types in §27.2A. This was the only one of the three assumptions that touched the dashboard, and it is now a decision rather than a guess.

**A.5.2 When readiness is declared on a multi-stop job.** ~~Assumption.~~ **Closed.** Operations confirmed that VGM is the total gross mass of the finished container and is received only once stuffing is complete, at the final location. §43.1 now enforces this: a container with an outstanding stuffing transfer cannot hold a VGM, and one arriving early raises a discrepancy rather than being stored.

**A.5.3 Ceiling on stuffing locations.** ~~Assumption.~~ **Closed.** Operations confirmed no ceiling: two is all they have seen, three or more is very rare but should stay possible. §46.3 models the stuffing plan as an ordered list for exactly this reason. The same answer surfaced driver standby, which was not previously specified and is now §21.3.

**All three assumptions carried in this edition are now closed.** No open assumptions remain.

## A.6 Edition 2.1 change register

Every change applied in this edition, with the operational fact behind it.

| # | Change | Operational fact | Sections |
|---|---|---|---|
| 1 | Export gains a container entity | One booking can cover several containers | §6, §38.1, §38.2, §39 |
| 2 | Export job status aggregates | Follows from 1 | §45.4 |
| 3 | Movement may carry two containers | Double mounting on a 40ft chassis | §17.1, §19.1 |
| 4 | Chassis size rule made conditional | Follows from 3 | §35.2 |
| 5 | Capacity model revised | 40ft units partially fungible into 20ft capacity | §35.6 |
| 6 | New movement type `LADEN_SITE_TO_SITE` | Stuffing runs across locations | §19, §46.3 |
| 6a | VGM blocked while stuffing transfers remain | VGM is the total gross mass of the finished container | §43.1 |
| 7 | New cargo state `PART_LADEN` | Follows from 6 | §17, §19 |
| 8 | New movement types `IMPORT_TO_CARPARK`, `CARPARK_TO_CUSTOMER` | Laden imports held at our carpark | §19, §36.2 |
| 9 | Free time rewritten as three numbers | Carriers count differently; some combine D&D; we count from vessel ETA | §9.2, §34 |
| 9a | Two free-time alert streams, operational and charge risk | Warning on one figure alone marks containers overdue inside carrier free time | §34.6, §48.4, §27.2A |
| 10 | Empty return waits on the customer | The customer tells us the container is empty | §36.3 |
| 11 | Portnet processing warns, does not block | Portnet can fail on a genuinely ready container | §38.2, §44.2.1 |
| 12 | Customer stuffing locations as master data | Customers stuff at more than one site | §9.3, §38.2, §40.1 |
| 13 | Reefer temperature as structured fields | Pre-cool or pre-set, with a setpoint | §9.4, §38.2 |
| 14 | Truck-in and truck-out dates added | A fixed yard window, amendable only by agreement | §38.1, §40.1 |
| 15 | Export mandatory fields nine to thirteen | Follows from 12 and 14 | §40.1 |
| 16 | Standby recorded as the fourth clock | Customers instruct us to hold the truck and driver while they work | §21.3, §20, §27.2A, §48.4A |
| 17 | Stuffing plan modelled as an ordered list | Locations are uncapped; each leg carries its own driver and standby declaration | §46.3 |
| 18 | Date amendment log added | Dates change day to day, and the reason matters more than the change | §13.1, §38.1, §48.3A |

---

# Appendix B: Canonical Enumerations

Quick reference for implementation. Each is authoritative.

**Movement type**, §19
`IMPORT_DELIVERY` · `EMPTY_RETURN` · `IMPORT_TO_CARPARK` · `CARPARK_TO_CUSTOMER` · `EMPTY_COLLECTION` · `DIRECT_LADEN_TO_PORT` · `ONE_WAY_LOADED` · `CARPARK_TO_PORT` · `LADEN_SITE_TO_SITE`

**Movement status**, §20
`PENDING` · `READY_FOR_SCHEDULING` · `SCHEDULED` · `ASSIGNED` · `COLLECTED` · `IN_TRANSIT` · `DELIVERED` · `ON_STANDBY` · `COMPLETED` · `ON_HOLD` · `CANCELLED` · `EXCEPTION`

**Standby instruction source**, §21.3
`BOOKING` · `EMAIL` · `PHONE` · `MANUAL`

**Cargo state**, §17
`EMPTY` · `PART_LADEN` · `LADEN`

**Free time model**, §9.2
`SPLIT` · `COMBINED`

**Free time counts from**, §9.2
`VESSEL_ETA` · `DISCHARGE` · `GATE_OUT`

**Portnet processed**, §44.2.1
`PENDING` · `PROCESSED` · `FAILED`

**Temperature mode**, §9.4
`PRE_COOL` · `PRE_SET`

**Date amendment reason**, §13.1
`CUSTOMER_REQUEST` · `VESSEL_DELAY` · `VESSEL_EARLY` · `PORTNET_ETA_CHANGE` · `YARD_WINDOW_CHANGE` · `CUSTOMER_NO_SPACE` · `EQUIPMENT` · `INTERNAL_RESCHEDULE` · `OTHER`

**Import carpark reason**, §36.2
`CUSTOMER_NO_SPACE` · `CONTROLLER_DECISION`

**Empty ready source**, §36.3
`EMAIL` · `WHATSAPP` · `PHONE` · `MANUAL`

**Location type**, §17
`YARD` · `CUSTOMER` · `CARPARK` · `PORT` · `TERMINAL`

**Import container status**, §32.1
New · Incomplete · Awaiting Permit · Awaiting Portnet · Ready for Collection · Scheduled · Collected · Delivered · Empty Return Pending · Empty Returned · On Hold · Cancelled · Exception

**Import job status**, §32.2
New · Processing · Incomplete · Awaiting Permit · Awaiting Portnet · Ready for Collection · Transport Assigned · Partially Collected · Collected · Partially Delivered · Delivered · Empty Return Pending · Completed · On Hold · Cancelled · Exception

**Export job status**, §45.1 and §45.4
New Export Job · Incomplete · Awaiting CMS · Ready for Empty Collection · Empty Collection Scheduled · Empty Collected · Empty Delivered · Awaiting Container Details Notification · Awaiting Customer Stuffing · Container Ready · Awaiting VGM · Awaiting T/T · Ready for One-Way Loaded Trip · Ready for Laden Collection · Laden Collection Scheduled · Laden Collected · At Carpark · Ready for Port Delivery · Port Delivery Scheduled · **Partially Collected** · **Partially Delivered** · Delivered to Port · Completed · On Hold · Cancelled · Exception

**CMS status**, §40.2
`PENDING` · `COMPLETED` · `NOT_REQUIRED`

**Transhipment status**, §44.1
`PENDING` · `AVAILABLE` · `NOT_AVAILABLE`

**Waiting on**, §25.2
`US` · `CUSTOMER` · `CARRIER` · `NOBODY`

**Exception severity**, §27.1
`LOW` · `MEDIUM` · `HIGH` · `CRITICAL`

**Audit source**, §13
`USER` · `EMAIL_AUTOMATION` · `AI_EXTRACTION` · `SYSTEM_RULE` · `API`

**Email processing status**, §11.3
`AUTO_PROCESSED` · `REVIEW_REQUIRED` · `UNMATCHED` · `FAILED`

**D&D risk level**, §34.2
`GREEN` · `AMBER` · `RED` · `CRITICAL`

---

# Appendix C: Where the Old Sections Went

For anyone holding edition 1.0.

**Part I: Import and the Control Tower**

| Old | New |
|---|---|
| I.0-I.0.6 Build approach | §5 |
| I.1-I.4 Overview, problem, objective, success | §1, §2, §3 |
| I.5-I.6 Scope | §4 |
| I.7 User roles | §7 |
| I.8 Core data architecture | §8 |
| I.9-I.10 Job entity, job number | §28, §8.1 |
| I.11-I.12 Container entity, validation | §29 |
| I.13-I.14 Document entity, types | §10 |
| I.15-I.19 Email automation, extraction, matching | §11, §12 |
| I.20 Navigation | §15.1 |
| I.21-I.26 Dashboard | §48 |
| I.27-I.28 Job tracker | §49 |
| I.29 Job detail | §51.1 |
| I.30-I.31 Completion indicator, mandatory fields | §30 |
| I.32-I.34 Eligibility engine, gate, enforcement | §31 |
| I.35-I.36 Incomplete queue | §26.1 |
| I.37 Exception queue | §26.3, §27 |
| I.38-I.39 Container tracker, search | §50, §15.2 |
| I.40-I.43 Demurrage, detention, countdown, alerts | §34 |
| I.44 Transportation schedule | §52 |
| I.45 Transportation status | **Superseded**, §20 movement status |
| I.46-I.47 Job status, derivation | §32.2 |
| I.48 Multiple container jobs | §33 |
| I.49-I.51 Documents, versioning, upload | §10 |
| I.52-I.53 Inbox, review queue | §53.1, §53.2 |
| I.54 Notifications | §53.3 |
| I.55 Action required engine | **Superseded**, §25 |
| I.56-I.58 Timeline, audit, notes | §13 |
| I.59 Handover view | §53.4 |
| I.60-I.62 Completion, archive, reopening | §27.3, §53.5 |
| I.63-I.64 Master data, customer master | §9 |
| I.65-I.69 Search, filters, sorting, export, responsive | §15 |
| I.70-I.72 UI principles, layouts | §15.6, §48, §51.1 |
| I.73 API domains | §54 |
| I.74-I.77 Relationships, tables, integrity, calculated fields | §8.2, §55, §56 |
| I.78-I.84 Time, security, performance, reliability, errors, logging | §14 |
| I.85 MVP automation rules | §60 |
| I.86-I.90 Worked examples | §58.1 |
| I.91-I.98 Acceptance criteria | §59 |
| I.99-I.104 Phases and priority | §60 |
| I.105 Primary product rule | §31 |
| I.106 Product philosophy | §61 |
| I.107-I.109 Definition of done, handover, structure | §61, §15.1 |

**Part II: Export Job Management**

| Old | New |
|---|---|
| II.0-II.0.3 Build approach, structural difference | §6, Chapter D preamble |
| II.1-II.4 Overview, problem, objective, success | §1, §2, §3 |
| II.5-II.6 Scope | §4 |
| II.7 User roles | §7 |
| II.8 Core data architecture | §8 |
| II.9-II.10 Export job entity, job number | §38, §8.1 |
| II.11 Container identification | §39 |
| II.12 Movement entity | **Superseded**, §17 |
| II.13 Movement patterns | §46 |
| II.14 CMS tracking | §40.2 |
| II.15 Empty collection gate | §41 |
| II.16 Mandatory fields | §40.1 |
| II.17 Enforcement rule | §41, §44.2 |
| II.18 Empty container movement | §46, §39 |
| II.19 Customer notification | §42 |
| II.20 Container ready and VGM | §43 |
| II.21-II.23 Transhipment, scenarios A and B | §44 |
| II.24 Export job statuses | **Superseded**, §45.1 |
| II.25 Derived status priority | **Superseded**, §45.2 |
| II.26-II.27 Incomplete queue, exception queue | §26.1, §27 |
| II.28-II.29 Dashboard, action required panel | §48 |
| II.30-II.31 Container tracker, job tracker | §50, §49 |
| II.32 Job detail screen | §51.2 |
| II.33 Documents | §10 |
| II.34 Email automation | §11 |
| II.35-II.36 Notifications, search and filters | §53.3, §15 |
| II.37 Audit logging | §13 |
| II.38 Export business rules | §57 |
| II.39-II.41 API, tables, calculated fields | §54, §55, §56 |
| II.42-II.47 Acceptance criteria | §59 |
| II.48-II.49 Build phases, definition of done | §60, §61.2 |
| II.50-II.52 Handover, differences, philosophy | §6, §61 |

**Part III: Export Movement and Exception Management**

| Old | New |
|---|---|
| III.0-III.1 Relationship, reconciliation | §0, Appendix A |
| III.2-III.4 Overview, objective, operating model | §3, §16 |
| III.5 One job, many movements | §46, §57 |
| III.6-III.7 Movement record, identity | §17, §18 |
| III.8-III.10 Types, statuses, transitions | §19, §20 |
| III.11-III.14 Job vs movement status, progression, enum, derivation | §27.3, §45 |
| III.15 Current location | §24 |
| III.16-III.19 Next action engine, rules, precedence, waiting on | §25, §47 |
| III.20-III.21 Automatic creation, placeholder rule | §22, §21 |
| III.22-III.24 Duplicates, manual creation, scheduling | §23, §21 |
| III.25-III.30 Three queues, age and deadlines | §26 |
| III.31-III.32 Dashboard, job detail | §48, §51.2 |
| III.33-III.34 Closure, movement history | §27.3, §51.3 |
| III.35-III.37 Audit events, structure, overrides | §13, §27.4 |
| III.38 Business rules | §57 |
| III.39-III.41 API, data model, calculated fields | §54, §55, §56 |
| III.42-III.44 Worked examples | §58 |
| III.45-III.49 Acceptance criteria | §59 |
| III.50-III.52 Build sequence, done, outcome | §60, §61 |

---

*Zhenghe Logistics · Confidential · Unified edition 2.0*
