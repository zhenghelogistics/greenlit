import type { Movement } from './types.ts';
import type { MovementStatus, MovementType } from './enums.ts';

/**
 * §20. Permitted transitions. Movement status is a controlled value; free-text
 * movement status must not be possible anywhere in the system.
 *
 * `ON_HOLD` and `EXCEPTION` are not listed as sources here because they do not
 * transition forward — they *return* to the status they were entered from,
 * which `resume()` handles.
 */
export const PERMITTED_TRANSITIONS: Readonly<Record<MovementStatus, readonly MovementStatus[]>> = {
  PENDING: ['READY_FOR_SCHEDULING', 'CANCELLED', 'ON_HOLD'],
  READY_FOR_SCHEDULING: ['SCHEDULED', 'CANCELLED', 'ON_HOLD'],
  // ASSIGNED may be skipped where no named driver is allocated in advance.
  SCHEDULED: ['ASSIGNED', 'COLLECTED', 'CANCELLED', 'ON_HOLD'],
  ASSIGNED: ['COLLECTED', 'CANCELLED', 'ON_HOLD'],
  COLLECTED: ['IN_TRANSIT', 'DELIVERED', 'EXCEPTION'],
  IN_TRANSIT: ['DELIVERED', 'EXCEPTION'],
  DELIVERED: ['ON_STANDBY', 'COMPLETED', 'EXCEPTION'],
  ON_STANDBY: ['COMPLETED', 'EXCEPTION'],
  COMPLETED: [],
  CANCELLED: [],
  ON_HOLD: [],
  EXCEPTION: [],
};

export const TERMINAL_STATUSES: readonly MovementStatus[] = ['COMPLETED', 'CANCELLED'];

export interface TransitionResult {
  allowed: boolean;
  reason: string | null;
  /**
   * §20. Recording a delivery for a movement never marked collected writes an
   * inferred COLLECTED rather than leaving a hole: "silent gaps in a movement
   * history are worse than an inferred value that is labelled as inferred."
   */
  inferredCollected: boolean;
}

const ok = (inferredCollected = false): TransitionResult =>
  ({ allowed: true, reason: null, inferredCollected });
const no = (reason: string): TransitionResult =>
  ({ allowed: false, reason, inferredCollected: false });

/** Statuses that mean the container has physically moved. */
const MOVED: readonly MovementStatus[] = ['COLLECTED', 'IN_TRANSIT', 'DELIVERED', 'ON_STANDBY', 'COMPLETED'];

export function canTransition(from: MovementStatus, to: MovementStatus): TransitionResult {
  if (from === to) return no(`Movement is already ${from}`);
  if (TERMINAL_STATUSES.includes(from)) return no(`${from} is terminal and cannot transition`);

  if (from === 'ON_HOLD' || from === 'EXCEPTION') {
    return no(`${from} returns to the status it was entered from; use resume()`);
  }

  if (PERMITTED_TRANSITIONS[from].includes(to)) return ok();

  // The one permitted inference. Everything else is a genuine violation.
  if (to === 'DELIVERED' && (from === 'SCHEDULED' || from === 'ASSIGNED')) {
    return ok(true);
  }

  return no(`${from} cannot transition to ${to}`);
}

/**
 * §20. `ON_STANDBY` is reachable only where standby was declared on the
 * movement — §21.3 is explicit that standby is recorded, never inferred,
 * because a truck that arrives and leaves four hours later looks identical
 * whether it waited by arrangement or was simply delayed.
 */
export function canEnterStandby(movement: Movement): TransitionResult {
  if (!movement.standbyRequired) {
    return no('Standby was not declared on this movement; it cannot be inferred');
  }
  return canTransition(movement.movementStatus, 'ON_STANDBY');
}

/**
 * §20. DELIVERED and COMPLETED are deliberately distinct. What `COMPLETED`
 * additionally requires depends on the movement type.
 */
export function canComplete(
  movement: Movement,
  evidence: { containerIdentityCaptured?: boolean; podCaptured?: boolean },
): TransitionResult {
  const base = canTransition(movement.movementStatus, 'COMPLETED');
  if (!base.allowed) return base;

  if (movement.movementType === 'EMPTY_COLLECTION' && !evidence.containerIdentityCaptured) {
    return no('Container number, seal and tare must be captured before completion');
  }
  if (movement.movementType === 'IMPORT_DELIVERY' && !evidence.podCaptured) {
    return no('Proof of delivery must be captured before completion');
  }
  return ok();
}

/**
 * §23.1. A new movement is rejected if an existing movement for the same job
 * has the same type and a status that is neither CANCELLED nor COMPLETED.
 *
 * A cancelled movement never blocks creation — that is what makes an aborted
 * trip recoverable without editing history.
 */
export function canCreateMovement(
  existing: readonly Movement[],
  jobId: string,
  type: MovementType,
): TransitionResult {
  const clash = existing.find((m) =>
    m.jobId === jobId &&
    m.movementType === type &&
    !TERMINAL_STATUSES.includes(m.movementStatus));

  if (clash) {
    return no(`An active ${type} movement already exists on this job (${clash.movementRef})`);
  }
  return ok();
}

/**
 * §18. `movement_ref` is unique within a job and never reused, including after
 * cancellation. A cancelled MOV-002 means the next is MOV-003.
 */
export function nextMovementRef(existing: readonly Movement[]): string {
  let highest = 0;
  for (const m of existing) {
    const n = Number.parseInt(m.movementRef.replace(/^MOV-/, ''), 10);
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return `MOV-${String(highest + 1).padStart(3, '0')}`;
}

/** §21. A movement in PENDING does not exist operationally. */
export function appearsOnSchedule(movement: Movement): boolean {
  return ['SCHEDULED', 'ASSIGNED', 'COLLECTED', 'IN_TRANSIT'].includes(movement.movementStatus);
}

/** §21. Reaching SCHEDULED requires a planned date and resolved endpoints. */
export function canSchedule(movement: Movement): TransitionResult {
  if (movement.plannedDate === null) return no('A planned date is required to schedule a movement');
  if (!movement.origin) return no('A confirmed origin is required');
  if (!movement.destination) return no('A confirmed destination is required');
  return canTransition(movement.movementStatus, 'SCHEDULED');
}

/** §20. Truck and driver are required only to reach ASSIGNED. */
export function canAssign(movement: Movement): TransitionResult {
  if (movement.truck === null) return no('A truck is required to assign a movement');
  if (movement.driver === null) return no('A driver is required to assign a movement');
  return canTransition(movement.movementStatus, 'ASSIGNED');
}

export { MOVED as MOVED_STATUSES };
