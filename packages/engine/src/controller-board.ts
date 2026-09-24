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
