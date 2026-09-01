import type {
  ExceptionRecord, ExportContainer, ExportJob, ImportContainer, ImportJob, Movement,
} from './types.ts';
import type { ExportJobStatus, ImportContainerStatus, ImportJobStatus, MovementStatus } from './enums.ts';

const isOpenBlocking = (e: ExceptionRecord) => e.blocking && e.resolvedAt === null;

const has = (ms: readonly Movement[], type: string, statuses: readonly MovementStatus[]) =>
  ms.some((m) => m.movementType === type && statuses.includes(m.movementStatus));

const LADEN_TO_PORT = ['DIRECT_LADEN_TO_PORT', 'CARPARK_TO_PORT'] as const;

/**
 * §32.1. Import container status. Derived, never typed.
 * Evaluation order, first match wins.
 */
export function importContainerStatus(
  container: ImportContainer,
  job: ImportJob,
  movements: readonly Movement[],
  exceptions: readonly ExceptionRecord[],
  collectionEligible: boolean,
  mandatoryComplete: boolean,
): ImportContainerStatus {
  const own = movements.filter((m) => m.containerId === container.containerId);

  if (container.cancelled) return 'Cancelled';
  if (container.onHold) return 'On Hold';
  if (exceptions.some(isOpenBlocking)) return 'Exception';
  if (has(own, 'EMPTY_RETURN', ['COMPLETED'])) return 'Empty Returned';
  if (has(own, 'IMPORT_DELIVERY', ['COMPLETED']) || has(own, 'CARPARK_TO_CUSTOMER', ['COMPLETED'])) {
    return 'Empty Return Pending';
  }
  if (has(own, 'IMPORT_DELIVERY', ['DELIVERED', 'ON_STANDBY'])) return 'Delivered';
  if (has(own, 'IMPORT_DELIVERY', ['COLLECTED', 'IN_TRANSIT'])) return 'Collected';
  if (has(own, 'IMPORT_DELIVERY', ['SCHEDULED', 'ASSIGNED'])) return 'Scheduled';
  if (collectionEligible) return 'Ready for Collection';
  if (job.portnetRequired && !job.portnetReleased && mandatoryComplete) return 'Awaiting Portnet';
  if (job.permitRequired && !job.permitReceived && mandatoryComplete) return 'Awaiting Permit';
  if (!mandatoryComplete) return 'Incomplete';
  return 'New';
}

/**
 * §32.2 + §33. Import job status aggregates over containers.
 * A job must not be Completed while any container is outstanding.
 */
export function importJobStatus(
  job: ImportJob,
  containerStatuses: readonly ImportContainerStatus[],
  movements: readonly Movement[],
  exceptions: readonly ExceptionRecord[],
  closureSatisfied: boolean,
): ImportJobStatus {
  if (job.cancelled) return 'Cancelled';
  if (job.onHold) return 'On Hold';
  if (exceptions.some(isOpenBlocking)) return 'Exception';
  if (closureSatisfied) return 'Completed';
  if (containerStatuses.length === 0) return 'New';

  const every = (s: ImportContainerStatus) => containerStatuses.every((c) => c === s);
  const count = (...s: ImportContainerStatus[]) =>
    containerStatuses.filter((c) => s.includes(c)).length;

  const delivered = count('Delivered', 'Empty Return Pending', 'Empty Returned');
  const collected = count('Collected', 'Delivered', 'Empty Return Pending', 'Empty Returned');
  const total = containerStatuses.length;

  if (every('Empty Return Pending')) return 'Empty Return Pending';
  if (delivered === total && count('Empty Return Pending') > 0) return 'Empty Return Pending';
  if (delivered === total) return 'Delivered';
  if (delivered > 0) return 'Partially Delivered';
  if (collected === total) return 'Collected';
  if (collected > 0) return 'Partially Collected';
  if (movements.some((m) => ['SCHEDULED', 'ASSIGNED'].includes(m.movementStatus))) {
    return 'Transport Assigned';
  }
  if (every('Ready for Collection')) return 'Ready for Collection';
  if (containerStatuses.includes('Awaiting Portnet')) return 'Awaiting Portnet';
  if (containerStatuses.includes('Awaiting Permit')) return 'Awaiting Permit';
  if (containerStatuses.includes('Incomplete')) return 'Incomplete';
  return 'New';
}

/**
 * §45.2. Export status derivation — 24 rules producing 21 statuses.
 * Evaluated per container; §45.4 aggregates to the job.
 *
 * Note rule 13 and the carpark branch: a container at the carpark with
 * transhipment still PENDING is `Awaiting T/T`, not `At Carpark`. `At Carpark`
 * describes a container whose onward journey is unblocked but unscheduled.
 * This distinction is what makes carpark dwell and transhipment chase both
 * count correctly.
 */
export function exportContainerStatus(
  job: ExportJob,
  container: ExportContainer,
  movements: readonly Movement[],
  exceptions: readonly ExceptionRecord[],
  emptyGate: boolean,
  ladenGate: boolean,
  mandatoryComplete: boolean,
  closureSatisfied: boolean,
): ExportJobStatus {
  const own = movements.filter((m) =>
    m.containerId === container.exportContainerId ||
    m.secondaryContainerId === container.exportContainerId);

  const atCarpark = has(own, 'ONE_WAY_LOADED', ['COMPLETED', 'DELIVERED']);
  const portMoved = (s: readonly MovementStatus[]) => LADEN_TO_PORT.some((t) => has(own, t, s));

  if (job.cancelled || container.cancelled) return 'Cancelled';
  if (job.onHold || container.onHold) return 'On Hold';
  if (exceptions.some(isOpenBlocking)) return 'Exception';
  if (closureSatisfied) return 'Completed';
  if (portMoved(['DELIVERED', 'ON_STANDBY', 'COMPLETED'])) return 'Delivered to Port';
  if (has(own, 'CARPARK_TO_PORT', ['SCHEDULED', 'ASSIGNED'])) return 'Port Delivery Scheduled';
  if (atCarpark && job.transhipmentStatus === 'AVAILABLE') return 'Ready for Port Delivery';
  if (atCarpark && job.transhipmentStatus === 'PENDING') return 'Awaiting T/T';
  if (atCarpark) return 'At Carpark';
  if (portMoved(['COLLECTED', 'IN_TRANSIT']) || has(own, 'ONE_WAY_LOADED', ['COLLECTED', 'IN_TRANSIT'])) {
    return 'Laden Collected';
  }
  if (portMoved(['SCHEDULED', 'ASSIGNED']) || has(own, 'ONE_WAY_LOADED', ['SCHEDULED', 'ASSIGNED'])) {
    return 'Laden Collection Scheduled';
  }
  if (ladenGate && job.transhipmentStatus === 'NOT_AVAILABLE' && job.carparkRequested) {
    return 'Ready for One-Way Loaded Trip';
  }
  if (ladenGate && job.transhipmentStatus === 'AVAILABLE') return 'Ready for Laden Collection';
  if (container.vgm !== null && job.transhipmentStatus === 'PENDING') return 'Awaiting T/T';
  if (container.containerReady && container.vgm === null) return 'Awaiting VGM';
  if (container.containerReady && container.vgm !== null) return 'Container Ready';
  if (container.containerDetailsSent) return 'Awaiting Customer Stuffing';
  if (container.containerNumber !== null && !container.containerDetailsSent) {
    return 'Awaiting Container Details Notification';
  }
  if (has(own, 'EMPTY_COLLECTION', ['DELIVERED', 'ON_STANDBY'])) return 'Empty Delivered';
  if (has(own, 'EMPTY_COLLECTION', ['COLLECTED', 'IN_TRANSIT'])) return 'Empty Collected';
  if (has(own, 'EMPTY_COLLECTION', ['SCHEDULED', 'ASSIGNED'])) return 'Empty Collection Scheduled';
  if (emptyGate) return 'Ready for Empty Collection';
  if (job.cmsRequired && job.cmsStatus === 'PENDING' && mandatoryComplete) return 'Awaiting CMS';
  if (!mandatoryComplete) return 'Incomplete';
  return 'New Export Job';
}

/**
 * §45.4. Export job status aggregates across containers, using the same
 * mechanism §33 already specifies for import.
 *
 * Where a job holds exactly one container — still the common case — the
 * partial states never appear and behaviour is identical to edition 2.0.
 */
export function exportJobStatus(
  job: ExportJob,
  containerStatuses: readonly ExportJobStatus[],
  exceptions: readonly ExceptionRecord[],
  closureSatisfied: boolean,
): ExportJobStatus {
  if (job.cancelled) return 'Cancelled';
  if (job.onHold) return 'On Hold';
  if (exceptions.some(isOpenBlocking)) return 'Exception';
  if (closureSatisfied) return 'Completed';
  if (containerStatuses.length === 0) return 'New Export Job';
  if (containerStatuses.length === 1) return containerStatuses[0]!;

  const total = containerStatuses.length;
  const delivered = containerStatuses.filter((s) => s === 'Delivered to Port').length;
  const collected = containerStatuses.filter((s) =>
    !['New Export Job', 'Incomplete', 'Awaiting CMS', 'Ready for Empty Collection',
      'Empty Collection Scheduled'].includes(s)).length;

  if (delivered === total) return 'Delivered to Port';
  if (delivered > 0) return 'Partially Delivered';
  if (collected === total && collected > 0) return 'Empty Collected';
  if (collected > 0) return 'Partially Collected';

  // No container has progressed: report the most blocking shared state by
  // walking the §45.2 order.
  for (const s of containerStatuses) if (s === 'Incomplete') return s;
  for (const s of containerStatuses) if (s === 'Awaiting CMS') return s;
  return containerStatuses[0]!;
}
