import type { Movement } from './types.ts';
import type { JobDomain, MovementStatus, MovementType } from './enums.ts';

export const CONTAINER_LOCATION = [
  'Terminal / Port of discharge',
  'Empty Collection Yard',
  'In Transit to Customer',
  'Customer / Shipper',
  'In Transit to Carpark',
  'Company Carpark',
  'In Transit to Port',
  'Port',
  'In Transit to Return Yard',
  'Empty Returned',
  'Unknown / Exception',
] as const;
export type ContainerLocation = (typeof CONTAINER_LOCATION)[number];

/** In flight: collected or on the road, not yet arrived. */
const IN_FLIGHT: ReadonlySet<MovementStatus> = new Set(['COLLECTED', 'IN_TRANSIT']);
/** Arrived: delivered, standing by, or finished. */
const ARRIVED: ReadonlySet<MovementStatus> = new Set(['DELIVERED', 'ON_STANDBY', 'COMPLETED']);

/** Movements that no longer describe where the box is. */
const INERT: ReadonlySet<MovementStatus> = new Set(['CANCELLED', 'PENDING', 'READY_FOR_SCHEDULING']);

/**
 * How far through its life a movement is. Used to pick the most recently
 * progressed movement, since §24 derives location from that one alone.
 */
const PROGRESS: Record<MovementStatus, number> = {
  PENDING: 0, READY_FOR_SCHEDULING: 0, CANCELLED: 0,
  SCHEDULED: 1, ASSIGNED: 2, ON_HOLD: 2, EXCEPTION: 2,
  COLLECTED: 3, IN_TRANSIT: 4,
  DELIVERED: 5, ON_STANDBY: 5, COMPLETED: 6,
};

const IN_TRANSIT_TO: Partial<Record<MovementType, ContainerLocation>> = {
  IMPORT_DELIVERY: 'In Transit to Customer',
  EMPTY_COLLECTION: 'In Transit to Customer',
  CARPARK_TO_CUSTOMER: 'In Transit to Customer',
  LADEN_SITE_TO_SITE: 'In Transit to Customer',
  IMPORT_TO_CARPARK: 'In Transit to Carpark',
  ONE_WAY_LOADED: 'In Transit to Carpark',
  DIRECT_LADEN_TO_PORT: 'In Transit to Port',
  CARPARK_TO_PORT: 'In Transit to Port',
  EMPTY_RETURN: 'In Transit to Return Yard',
};

const ARRIVED_AT: Partial<Record<MovementType, ContainerLocation>> = {
  IMPORT_DELIVERY: 'Customer / Shipper',
  EMPTY_COLLECTION: 'Customer / Shipper',
  CARPARK_TO_CUSTOMER: 'Customer / Shipper',
  LADEN_SITE_TO_SITE: 'Customer / Shipper',
  IMPORT_TO_CARPARK: 'Company Carpark',
  ONE_WAY_LOADED: 'Company Carpark',
  DIRECT_LADEN_TO_PORT: 'Port',
  CARPARK_TO_PORT: 'Port',
  EMPTY_RETURN: 'Empty Returned',
};

/** Where a container starts, before any movement has been collected. */
function origin(domain: JobDomain): ContainerLocation {
  return domain === 'IMPORT' ? 'Terminal / Port of discharge' : 'Empty Collection Yard';
}

/**
 * §24. Current container location.
 *
 * Derived from the most recently progressed movement, never stored. A stored
 * location drifts: someone corrects a movement, forgets the location field, and
 * the tracker lies from then on.
 *
 * Returns `Unknown / Exception` where movement records are contradictory —
 * which §24 requires to raise a Critical exception rather than display quietly.
 */
export function currentLocation(movements: readonly Movement[], domain: JobDomain): ContainerLocation {
  // Journey order decides, not status rank. A *completed earlier* leg must not
  // outrank a *delivered later* leg: the box is wherever its furthest-along
  // journey put it. Sort by movement_ref, which §18 guarantees is ascending
  // within a job and never reused.
  const ordered = movements
    .filter((m) => !INERT.has(m.movementStatus))
    .slice()
    .sort((a, b) => a.movementRef.localeCompare(b.movementRef));

  // The last leg that actually moved the container. Scheduled and assigned
  // movements have not moved anything yet.
  let latest: Movement | undefined;
  for (const m of ordered) {
    if (PROGRESS[m.movementStatus] >= PROGRESS.COLLECTED) latest = m;
  }
  if (!latest) return origin(domain);

  if (IN_FLIGHT.has(latest.movementStatus)) {
    return IN_TRANSIT_TO[latest.movementType] ?? 'Unknown / Exception';
  }
  if (ARRIVED.has(latest.movementStatus)) {
    return ARRIVED_AT[latest.movementType] ?? 'Unknown / Exception';
  }
  return 'Unknown / Exception';
}

/** §24. A location that cannot be determined is an operational problem. */
export function isLocationUnknown(location: ContainerLocation): boolean {
  return location === 'Unknown / Exception';
}
