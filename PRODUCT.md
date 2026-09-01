# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React control-tower demo using Tailwind utility classes, `lucide-react`, and browser-local PDF.js extraction. No backend, authentication, document upload service, browser storage, or external operational data source.

## Users

Singapore container-haulage operations staff, primarily experienced operators over 60 who currently coordinate work from memory, spreadsheets, and email and may be unfamiliar with purpose-built operations software.

## Product Purpose

Project Greenlit is an interactive control-tower proof of concept that turns an arrival notice into reviewed job facts, then turns job readiness rules, deadlines, trip state, carpark dwell, and chassis use into one actionable work queue. Success means a first-time user can process a representative PDF, verify uncertain fields, create or update an import job, find work waiting on the company, understand why a job is blocked, and see downstream operational state respond.

The demo must feel operable rather than observational: visible readiness checkpoints, next actions, containers, trips, chassis units, job facts, and free-time dates open a working management flow. Saving an update changes the shared job model, recalculates derived status and responsibility, and records a session activity event.

## Positioning

One job number holds the complete operational story across several trips. Derived readiness, status, next action, responsibility, location, exceptions, deadlines, and chassis use update together from the job's underlying facts.

## Operating Context

- Import work runs from port collection to customer delivery and empty return, under demurrage and detention clocks.
- Export work runs from empty collection and stuffing to laden port delivery, with an optional company-carpark branch when transhipment space is unavailable.
- Containers remain mounted on one chassis for the job, so fleet availability constrains active work.
- Controllers work top-to-bottom from an urgency-ranked action queue and especially need to isolate work waiting on the company.

## Capabilities and Constraints

- Four always-visible destinations: Dashboard, Action Required, Document Intake, and Chassis Fleet.
- Computed `jobStatus`, `nextAction`, `blockingReason`, `waitingOn`, and `location` functions drive every displayed value.
- Four interactive demonstrations: arrival-notice extraction and reviewed job creation; CMS release and automatic trip creation; missing container details exception closure; and direct-versus-carpark export branching.
- Universal job management: edit job facts, update readiness checkpoints, manage every container, create or progress trips, assign or release chassis, confirm free-time dates, and review session activity.
- Operational changes have linked consequences: permit updates change container readiness, CMS completion creates an empty-collection trip, trip progress changes container state and location, final delivery creates an empty-return trip, and completed terminal movements release chassis capacity.
- Seed data is held as constants and all runtime state is held only in React `useState`.
- Document Intake accepts selectable-text PDF arrival notices up to 15 MB, parses them entirely in the browser, requires operator review of uncertain fields, and applies only required-complete data.
- The proof-of-concept parser is tuned to Hapag-Lloyd-style arrival notices and is not a promise of universal carrier coverage. Source document bytes and extracted records are not persisted after the browser session.
- The demo date is fixed at 19 August 2026 for repeatable deadline and dwell calculations.
- Include a Reset demo control, allow document fact correction during intake, and build no settings or authentication features.
- Use plain domain language and never expose internal field names.

## Brand Commitments

The product name is Project Greenlit. The voice is calm, direct, and operational. The primary brand color is navy `#17418c`; amber and red are reserved for risk. The interface uses white surfaces, dark text, no gradients, restrained corners, and no decorative illustration.

## Evidence on Hand

The supplied build brief at `/Users/NgMax/Downloads/Project_Greenlit_Demo_Prompt.md` contains synthetic but internally consistent export, import, fleet, terminal, yard, carpark, container, and trip data for 19 August 2026. The supplied Hapag-Lloyd arrival notice is a real representative extraction specimen and remains outside the repository. The public demo must not imply production readiness, persistent document storage, universal carrier coverage, or verified live operational data.

## Product Principles

1. Make today's responsibility unmistakable.
2. Explain every block in plain words at the point of work.
3. Derive downstream operational state from facts instead of duplicating it.
4. Keep one job number as the complete story across every trip.
5. Demonstrate consequences visibly and immediately.

## Accessibility & Inclusion

Use a 16px minimum base size and 18px body text, high contrast, visible text labels in addition to color, minimum 44px targets, persistent navigation, no hover-only interactions, strong focus indicators, and layouts that remain understandable without software familiarity.
