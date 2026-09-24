/**
 * The controller's board, and the four piles a container falls into.
 *
 * The status chain this replaces had nine steps and a button for each:
 * Ready, Planned, Assigned, Collected, Delivered, Empty Pending, Empty Ready,
 * Empty Return Planned, Empty Returned. A controller moved a container along
 * it by hand, which meant the chain recorded what somebody had remembered to
 * click rather than what had happened, and the two drifted apart within a day.
 *
 * So nothing is clicked along. Four real events decide everything:
 *
 *   portnet released   the shipment is cleared to leave the terminal
 *   discharged         this box is off the vessel and on the ground
 *   delivered          it reached the customer
 *   empty              the customer has finished with it
 *
 * Each is a fact somebody can check, and the pile follows from them. A
 * container is READY when it is both released and discharged, because those
 * are exactly the two things that have to be true before a truck can fetch it
 * — and neither of them is a thing a controller decides, which is why neither
 * belongs on a status dropdown.
 *
 * Portnet is recorded per shipment and discharge per container, and that
 * asymmetry is real rather than an oversight: the release is granted against
 * the bill of lading, while the boxes come off the ship one at a time and
 * sometimes days apart.
 */

/** The four piles, in the order the board shows them. */
export type ControllerStage = 'PENDING' | 'READY' | 'DELIVERED' | 'EMPTY';

export interface ControllerBoardFacts {
  /** §31. The shipment is cleared to leave the terminal. */
  portnetReleased: boolean;
  /** This container is off the vessel. Null until it is. */
  dischargedAt: string | null;
  /** It reached the customer. */
  deliveredAt: string | null;
  /** The customer has finished with it and it is ready to go back. */
  emptyReadyAt: string | null;
}

const happened = (at: string | null | undefined): boolean =>
  at !== null && at !== undefined && String(at).trim() !== '';

/**
 * Which pile this container is in.
 *
 * Read latest-first, because the later facts subsume the earlier ones: a
 * container that is empty was necessarily delivered, and one that was
 * delivered was necessarily released and discharged. Asking in the other
 * order would put a delivered container back in READY.
 */
export function controllerStage(facts: ControllerBoardFacts): ControllerStage {
  if (happened(facts.emptyReadyAt)) return 'EMPTY';
  if (happened(facts.deliveredAt)) return 'DELIVERED';
  if (facts.portnetReleased && happened(facts.dischargedAt)) return 'READY';
  return 'PENDING';
}

/**
 * Why a pending container is pending, in the words the board shows.
 *
 * Empty when it is not pending. Both can be outstanding at once, and both are
 * named: "awaiting Portnet" alone would send a controller chasing the wrong
 * one of the two.
 */
export function pendingReasons(facts: ControllerBoardFacts): string[] {
  if (controllerStage(facts) !== 'PENDING') return [];
  const reasons: string[] = [];
  if (!facts.portnetReleased) reasons.push('Portnet');
  if (!happened(facts.dischargedAt)) reasons.push('Discharge');
  return reasons;
}

/**
 * Whether a truck can be sent for this container.
 *
 * The same two conditions as READY, named separately because this is the
 * question the plan button asks and the stage is the question the board asks.
 * They agree today and should keep agreeing, which is easier to hold true when
 * only one of them computes it.
 */
export function canPlanCollection(facts: ControllerBoardFacts): boolean {
  return controllerStage(facts) === 'READY';
}

/** What a stage is called on screen. */
export const STAGE_LABEL: Record<ControllerStage, string> = {
  PENDING: 'Pending collection',
  READY: 'Ready for collection',
  DELIVERED: 'Delivered',
  EMPTY: 'Empty returns',
};

/**
 * What each stage is waiting for, said once at the top of the pile.
 *
 * A board that shows four numbers and no explanation makes a controller open
 * rows to find out what the numbers mean.
 */
export const STAGE_MEANING: Record<ControllerStage, string> = {
  PENDING: 'Waiting on Portnet release or discharge. Nothing can be collected yet.',
  READY: 'Released and discharged. A truck can be sent.',
  DELIVERED: 'At the customer. Waiting for them to finish with the box.',
  EMPTY: 'Finished with. Ready to plan the empty back to the depot.',
};


/**
 * Why an event cannot be recorded yet.
 *
 * The four facts happen in an order, and recording one out of order is always
 * a mistake rather than an unusual case: a container cannot be empty before it
 * was delivered, and it cannot be delivered before anybody sent a truck.
 *
 * This is the one place in the workflow where refusing is right rather than
 * warning. Everywhere else — a delivery date before the ETA, a container
 * number of the wrong shape — the odd-looking answer is sometimes the true
 * one. Here it never is: a box that reached the customer with no trip planned
 * did not teleport, it means somebody clicked the wrong row, and recording it
 * would put a date on the job that nothing can later contradict.
 *
 * Returns null when the event can be recorded.
 */
export function refuseEvent(
  event: 'DISCHARGE' | 'DELIVER' | 'EMPTY',
  facts: ControllerBoardFacts & { hasPlannedCollection?: boolean },
): string | null {
  if (event === 'DELIVER') {
    if (!happened(facts.dischargedAt)) {
      return 'This container has not been discharged yet, so it cannot have reached the customer.';
    }
    if (facts.hasPlannedCollection === false) {
      return 'No collection has been planned for this container. Plan the trip, then record the delivery.';
    }
  }
  if (event === 'EMPTY' && !happened(facts.deliveredAt)) {
    return 'This container has not been delivered yet, so the customer cannot have finished with it.';
  }
  return null;
}

/**
 * Whether a movement has enough on it to be a plan.
 *
 * A trip with no driver is a row on a board, not a job anybody can do. All
 * three are named separately because "incomplete" sends somebody back to the
 * form to work out which of the three it was.
 */
export function movementGaps(plan: {
  driver?: string | null; vehicle?: string | null; chassis?: string | null;
}): string[] {
  const gaps: string[] = [];
  if (!plan.driver?.trim()) gaps.push('Driver');
  if (!plan.vehicle?.trim()) gaps.push('Vehicle');
  if (!plan.chassis?.trim()) gaps.push('Chassis');
  return gaps;
}

/**
 * Which containers a bulk change would overwrite.
 *
 * Applying one container's terms to the rest is the point of the control, and
 * silently replacing a figure somebody entered by hand is not. Naming them
 * lets the question be asked properly — "this will replace the yard on these
 * three" — rather than as a general warning nobody reads.
 */
export function wouldOverwrite<T extends Record<string, unknown>>(
  targets: readonly T[],
  fields: readonly string[],
  incoming: Record<string, unknown>,
  nameOf: (item: T) => string,
): string[] {
  return targets
    .filter((item) => fields.some((field) => {
      const existing = item[field];
      const isSet = existing !== null && existing !== undefined && String(existing).trim() !== '';
      return isSet && String(existing) !== String(incoming[field] ?? '');
    }))
    .map(nameOf);
}
