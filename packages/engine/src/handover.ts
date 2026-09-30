/**
 * The handover from operations to the controller.
 *
 * Operations gather a job; the controller plans it. Between the two there was
 * nothing — the controller's board showed whatever existed, complete or not,
 * and the only way to know a job was ready was to open it and look.
 *
 * So this is a deliberate act, not a derivation. Someone in operations decides
 * a container is ready and says so, per container, and that is what puts it on
 * the controller's board. The system's part is narrow: refuse the handover
 * while the controller could not act on it, and otherwise stay out of the way.
 *
 * ## The list is short on purpose
 *
 * The temptation is to require everything. The controller needs far less than
 * that to start: who the customer is, and where the box is going. Everything
 * else — the vessel, the ETA, the bill of lading, the free time, the empty
 * return yard — is real work, but it is work that lands *while* the container
 * is already on the board, and holding the handover for it means the
 * controller cannot see next week until operations have finished this week.
 *
 * Portnet is the clearest case and the one most often got wrong. It is a hard
 * gate on *planning* — nothing can be collected without it — and no gate at
 * all on handover. A container waiting on Portnet is exactly the container a
 * controller wants to see, because seeing it is how the chasing starts.
 *
 * §30 / §40.1 already separate data completeness from milestones. This is a
 * third thing and is kept apart from both: the least a controller needs before
 * the job becomes theirs.
 */
import type { ExportJob, ImportContainer, ImportJob } from './types.ts';
import type { GateResult } from './gates.ts';
import type { PermitRecord } from './permits.ts';
import { checkPermit } from './permits.ts';

const missing = (value: unknown): boolean =>
  value === null || value === undefined || String(value).trim() === '';

/**
 * What an import job is missing before any of its containers can be handed on.
 *
 * The customer. The PM's demo is the specification (29 September 2026), and
 * its handover check is explicit: customer, delivery address and, where the
 * job needs one, a permit number on the box — "vessel, ETA, carrier, MBL/OBL,
 * Portnet, Discharged, D+D, LFD and Empty Return Depot are not Controller
 * Handover gateways". The delivery address is checked per container, because
 * a job may deliver each box somewhere different and then has none of its own.
 */
export function importHandoverShipmentGaps(job: ImportJob): string[] {
  const gaps: string[] = [];
  if (missing(job.customer)) gaps.push('Customer');
  return gaps;
}

/**
 * The export equivalent, which is longer because an export job starts empty.
 *
 * On import the container exists and is coming whatever we do. On export
 * nothing exists yet: the controller is being asked to send a truck for an
 * empty box, and without the booking, the yard to collect it from and the
 * place it is going, there is no trip to plan.
 */
export function exportHandoverShipmentGaps(job: ExportJob): string[] {
  const gaps: string[] = [];
  if (missing(job.customer)) gaps.push('Customer');
  if (missing(job.vesselName)) gaps.push('Vessel');
  if (missing(job.bookingReference)) gaps.push('Booking reference');
  if (missing(job.emptyCollectionYard)) gaps.push('Empty collection yard');
  // The stuffing location is per container here, not per job, so it is checked
  // with the container rather than with the shipment.
  return gaps;
}

/**
 * Whether a permit counts toward handover: it has a number.
 *
 * The demo's rule — "a permit counts only when this container actually stores
 * a permit reference with a number". An uploaded permit whose number is not
 * yet entered is flagged on the permit as needing attention.
 */
export function permitOnFile(permit: Pick<PermitRecord, 'permitNumber' | 'fileName'>): boolean {
  return !missing(permit.permitNumber);
}

/**
 * What one container is missing, over and above its job.
 *
 * Where it is going, and the permit when the job says one is required. The
 * address is the box's own when it has one and the job's otherwise, which is
 * what a null container address has always meant.
 *
 * A permit is per-container because a shipment's permits are allocated to
 * particular boxes, and a container nobody allocated one to will be stopped
 * at the gate however complete the rest of the job looks.
 *
 * Note what is not here. The container number, its size, its weight: all
 * necessary, none of them the controller's blocker. They are chased through
 * the missing-information list, which is where chasing belongs.
 */
export function containerHandoverGaps(
  job: { permitRequired: boolean; deliveryAddress?: string | null },
  container: Pick<ImportContainer, 'containerId'> & { deliveryAddress?: string | null },
  permits: readonly PermitRecord[],
): string[] {
  const gaps: string[] = [];
  if (missing(container.deliveryAddress) && missing(job.deliveryAddress)) {
    gaps.push('Delivery address');
  }
  if (job.permitRequired) {
    const covered = permits.some((permit) =>
      permitOnFile(permit) && permit.linkedContainerIds.includes(container.containerId));
    if (!covered) gaps.push('Permit');
  }
  return gaps;
}

/**
 * Whether this container can be handed to the controller now.
 *
 * The job's gaps and the container's own, together, in the order a person
 * would read them: what is wrong with the shipment before what is wrong with
 * the box.
 */
export function canHandOver(
  job: ImportJob,
  container: Pick<ImportContainer, 'containerId'> & { deliveryAddress?: string | null },
  permits: readonly PermitRecord[],
): GateResult {
  const failures = [
    ...importHandoverShipmentGaps(job),
    ...containerHandoverGaps(job, container, permits),
  ];
  return { passed: failures.length === 0, failures };
}

/**
 * Whether a container is on the controller's board.
 *
 * A stored instant, not a derived state, because it records something that
 * happened: a person decided this was ready and said so.
 */
export function isHandedOver(container: { handedOverAt: string | null }): boolean {
  return !missing(container.handedOverAt);
}

/**
 * Whether an edit after the handover should take the container back.
 *
 * It should not, and this returns false for everything — which is the whole
 * point of it existing rather than being left implicit.
 *
 * The alternative was tried and is worse. If the requirements are re-tested
 * continuously, a container vanishes from the controller's board because
 * somebody in operations opened the delivery address to correct a typo. The
 * controller is mid-plan; the row disappears; nobody can explain why. The
 * handover records a decision a person made, and a person unmakes it.
 *
 * What replaces the automatic withdrawal is ordinary visibility: the job still
 * reports what it is missing, and the controller still sees it, because a
 * controller who can see the gap is the one best placed to chase it.
 */
export function handoverSurvivesEdit(): boolean {
  return false;
}


/**
 * Document readiness — the job-level gate that sits before any handover.
 *
 * Two gates, and the difference between them is the point. The handover asks
 * the least a controller needs to *start*; this asks whether operations have
 * *finished*. A job can pass the first and fail the second all week, and
 * usually does: the controller is planning the collection while the free-time
 * terms are still being chased.
 *
 * So this is the longer list, and it is the one operations work down. It is
 * computed from the record every time rather than stored, so saving a field
 * clears its line at once — a stored checklist goes stale the moment somebody
 * edits the job from a different screen.
 */
export interface DocumentGap {
  /** Which part of the job: what a person would click to fix it. */
  area: 'Customer & delivery' | 'Shipment' | 'Container' | 'Permit';
  /** Which container, when it is one container's problem rather than the job's. */
  container?: string;
  field: string;
}

export function documentGaps(
  job: ImportJob,
  containers: readonly (ImportContainer & { containerRef?: string })[],
  permits: readonly PermitRecord[],
): DocumentGap[] {
  const gaps: DocumentGap[] = [];
  const need = (area: DocumentGap['area'], field: string, value: unknown, container?: string) => {
    if (missing(value)) gaps.push(container ? { area, field, container } : { area, field });
  };

  // The demo's list (v12.108): customer and where it goes; the sailing, the
  // master carrier and the MBL; and per box its number, size, return yard,
  // a last free day, and a permit where one is needed.
  need('Customer & delivery', 'Customer', job.customer);
  // A job delivering each box somewhere different has no address of its own,
  // so the company and address are asked of each container instead.
  const perContainerAddress = containers.some((c) => !missing(c.deliveryAddress));
  if (!perContainerAddress) {
    need('Customer & delivery', 'Delivery address company name', job.deliveryCompany);
    need('Customer & delivery', 'Delivery address', job.deliveryAddress);
  }
  if (missing(job.vesselName) || missing(job.voyageNumber)) {
    gaps.push({ area: 'Shipment', field: 'Vessel / Voyage' });
  }
  need('Shipment', 'Master carrier', job.carrier);
  need('Shipment', 'MBL / OBL', job.blNumber);

  containers.forEach((c, index) => {
    const name = c.containerNumber || c.containerRef || `Container ${index + 1}`;
    need('Container', 'Container number', c.containerNumber, name);
    need('Container', 'Container size', c.containerSize, name);
    if (perContainerAddress) {
      need('Container', 'Delivery address company name', c.deliveryCompany, name);
      need('Container', 'Delivery address', c.deliveryAddress, name);
    }
    need('Container', 'Empty return yard', c.emptyReturnYard, name);
    if (!hasLastFreeDay(c, job.eta)) {
      gaps.push({ area: 'Container', container: name, field: 'LFD' });
    }

    // The demo counts a permit linked to the box whether its number or its
    // file is on record; the number is what handover asks for.
    if (job.permitRequired) {
      const mapped = permits.filter((p) => p.linkedContainerIds.includes(c.containerId));
      if (!mapped.some((p) => !missing(p.permitNumber) || !missing(p.fileName))) {
        gaps.push({ area: 'Permit', container: name, field: 'Permit' });
      } else if (mapped.some((p) => checkPermit(p, job).vessel === 'ATTENTION')) {
        // The demo asks for the permit to be updated once the vessel or
        // voyage it was issued against no longer matches the shipment.
        gaps.push({ area: 'Permit', container: name, field: 'Update Permit' });
      }
    }
  });

  if (containers.length === 0) {
    gaps.push({ area: 'Container', field: 'At least one container' });
  }

  return gaps;
}

/**
 * Whether this box has a last free day: one set by hand, or one that can be
 * counted from the ETA and the carrier's allowance.
 */
function hasLastFreeDay(
  c: Pick<ImportContainer, 'freeTimeModel' | 'combinedFreeDays' | 'combinedLfd'
    | 'demurrageFreeDays' | 'demurrageLfd' | 'detentionFreeDays' | 'detentionLfd'>,
  eta: string | null,
): boolean {
  if (!missing(c.combinedLfd) || !missing(c.demurrageLfd) || !missing(c.detentionLfd)) return true;
  if (missing(eta)) return false;
  if (c.freeTimeModel === 'COMBINED') return !missing(c.combinedFreeDays);
  if (c.freeTimeModel === 'SPLIT') return !missing(c.demurrageFreeDays) || !missing(c.detentionFreeDays);
  return false;
}

/** Whether operations have finished gathering this job. */
export function documentsComplete(
  job: ImportJob,
  containers: readonly ImportContainer[],
  permits: readonly PermitRecord[],
): boolean {
  return documentGaps(job, containers, permits).length === 0;
}


/**
 * Whether an export job can be passed to the controller, and what it lacks.
 *
 * ## What holds it back
 *
 * The core details a controller needs to plan the collection: who it is for,
 * where it is going, and what equipment the boxes need. Operations named these
 * on 28 September 2026 — customer, delivery address, size and weight per
 * container, and whether heavy duty, tri-axle or 32.5 tonnes apply.
 *
 * The equipment answers count as given once the job exists, because they are
 * booleans with a real default: "not needed" is an answer. Weight is not, and
 * a box with no weight cannot be matched to a chassis.
 *
 * ## What deliberately does not
 *
 * CMS. It frequently cannot be completed until the day the empty is collected,
 * and blocking handover on it would keep the job off the controller's board
 * for exactly the period the controller needs to plan around it. It blocks the
 * collection instead — `canCollectEmpty` — which is the thing it actually
 * stops.
 *
 * ## Why this is job level
 *
 * An export has no per-box paperwork gate the way an import has permits, so
 * what holds one container back holds the job back. Imports hand over box by
 * box because a permit covers particular boxes and not others.
 */
export function canHandOverExport(
  job: { customer: string | null; deliveryAddress?: string | null },
  containers: readonly { containerRef: string; sizeType: string | null;
    grossWeightKg?: number | null; stuffingLocation?: string | null }[],
): GateResult {
  const failures: string[] = [];

  if (missing(job.customer)) failures.push('Customer');

  // An export's address is where the box is stuffed, which is per container
  // because a customer may stuff at more than one site. An export job carries
  // no delivery address of its own — the first version of this gate checked
  // for one and refused every export, because the field it read does not
  // exist on that record.

  if (containers.length === 0) {
    failures.push('At least one container');
  }

  for (const c of containers) {
    // Named per box rather than counted: "2 containers are incomplete" sends
    // somebody looking, and "C2 has no weight" is a thing they can go and fix.
    if (missing(c.sizeType)) failures.push(`${c.containerRef}: size`);
    if (missing(c.stuffingLocation)) failures.push(`${c.containerRef}: stuffing address`);
    if (c.grossWeightKg === null || c.grossWeightKg === undefined) {
      failures.push(`${c.containerRef}: weight`);
    }
  }

  return { passed: failures.length === 0, failures };
}
