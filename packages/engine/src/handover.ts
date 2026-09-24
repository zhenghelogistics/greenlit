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

const missing = (value: unknown): boolean =>
  value === null || value === undefined || String(value).trim() === '';

/**
 * What an import job is missing before any of its containers can be handed on.
 *
 * Two fields. A controller who knows the customer and the delivery address can
 * begin; one who knows neither cannot begin at all.
 */
export function importHandoverShipmentGaps(job: ImportJob): string[] {
  const gaps: string[] = [];
  if (missing(job.customer)) gaps.push('Customer');
  if (missing(job.deliveryAddress)) gaps.push('Delivery address');
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
 * What one container is missing, over and above its job.
 *
 * Only the permit, and only when the job says a permit is required. A permit
 * is per-container because a shipment's permits are allocated to particular
 * boxes, and a container nobody allocated one to will be stopped at the gate
 * however complete the rest of the job looks.
 *
 * Note what is not here. The container number, its size, its weight: all
 * necessary, none of them the controller's blocker. They are chased through
 * the missing-information list, which is where chasing belongs.
 */
export function containerHandoverGaps(
  job: { permitRequired: boolean },
  container: Pick<ImportContainer, 'containerId'>,
  permits: readonly PermitRecord[],
): string[] {
  if (!job.permitRequired) return [];
  const covered = permits.some((permit) =>
    !missing(permit.permitNumber) && permit.linkedContainerIds.includes(container.containerId));
  return covered ? [] : ['Permit'];
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
  container: Pick<ImportContainer, 'containerId'>,
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

  need('Customer & delivery', 'Customer', job.customer);
  need('Customer & delivery', 'Delivery address', job.deliveryAddress);
  need('Shipment', 'Vessel', job.vesselName);
  need('Shipment', 'ETA', job.eta);
  need('Shipment', 'Master bill of lading', job.blNumber);

  containers.forEach((c, index) => {
    const name = c.containerNumber || c.containerRef || `Container ${index + 1}`;
    need('Container', 'Container number', c.containerNumber, name);
    need('Container', 'Size', c.containerSize, name);
    need('Container', 'Empty return yard', c.emptyReturnYard, name);

    // The free-time terms, whichever shape this carrier issues them in. An
    // unconfirmed model is itself the gap: nobody has read the terms yet.
    if (c.freeTimeModel === 'COMBINED') {
      need('Container', 'Combined free days', c.combinedFreeDays, name);
    } else if (c.freeTimeModel === 'SPLIT') {
      need('Container', 'Demurrage free days', c.demurrageFreeDays, name);
      need('Container', 'Detention free days', c.detentionFreeDays, name);
    } else {
      gaps.push({ area: 'Container', container: name, field: 'Free time terms' });
    }

    if (job.permitRequired) {
      const covered = permits.some((p) =>
        !missing(p.permitNumber) && p.linkedContainerIds.includes(c.containerId));
      if (!covered) gaps.push({ area: 'Permit', container: name, field: 'Permit' });
    }
  });

  if (containers.length === 0) {
    gaps.push({ area: 'Container', field: 'At least one container' });
  }

  return gaps;
}

/** Whether operations have finished gathering this job. */
export function documentsComplete(
  job: ImportJob,
  containers: readonly ImportContainer[],
  permits: readonly PermitRecord[],
): boolean {
  return documentGaps(job, containers, permits).length === 0;
}
