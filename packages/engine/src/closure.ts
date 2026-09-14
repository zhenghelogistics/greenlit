/**
 * §33. Closing a job.
 *
 * Closing is a person's act, not a derivation: the engine can see that every
 * container is back and every movement is finished, but only a controller
 * knows the paperwork is out and the customer is satisfied. So the engine
 * answers whether it *may* be closed, and someone decides whether it *is*.
 *
 * The distinction matters for §54. `closed` is a stored fact — somebody did
 * it, and there is an audit row naming them. `jobStatus` stays derived, and
 * reads Completed because the stored fact is true, not instead of it.
 */
import type { ImportContainer, Movement } from './types.ts';

/**
 * What is still outstanding, in the words a controller would use.
 *
 * Empty means the job may be closed. Anything else is a list of reasons, and
 * the caller shows all of them rather than the first: someone about to close a
 * job wants to know everything left, not to discover it one refusal at a time.
 */
export function closureBlockers(
  containers: readonly ImportContainer[],
  movements: readonly Movement[],
  openExceptions: number,
): readonly string[] {
  const blockers: string[] = [];

  if (containers.length === 0) {
    blockers.push('The job has no containers, so there is nothing to have finished.');
  }

  // A container that has not been returned is one the carrier is still
  // charging for, and closing over it stops the countdown that is the only
  // reason anyone would notice.
  //
  // The return is a completed EMPTY_RETURN movement, not a field on the
  // container: §32 derives "Empty Returned" that way, and a second source for
  // the same fact is a second source that can disagree.
  const returned = new Set(
    movements
      .filter((m) => m.movementType === 'EMPTY_RETURN' && m.movementStatus === 'COMPLETED')
      .map((m) => m.containerId),
  );
  const notReturned = containers.filter((c) => !returned.has(c.containerId));
  if (notReturned.length > 0) {
    blockers.push(notReturned.length === containers.length
      ? `No container has been returned empty yet.`
      : `${notReturned.length} of ${containers.length} containers are not back yet.`);
  }

  const unfinished = movements.filter(
    (m) => m.movementStatus !== 'COMPLETED' && m.movementStatus !== 'CANCELLED',
  );
  if (unfinished.length > 0) {
    blockers.push(`${unfinished.length} ${unfinished.length === 1 ? 'trip is' : 'trips are'} still running.`);
  }

  if (openExceptions > 0) {
    blockers.push(`${openExceptions} open ${openExceptions === 1 ? 'exception' : 'exceptions'} to resolve.`);
  }

  return blockers;
}

/**
 * §33.2. Why a closed job is being opened again.
 *
 * Required, and required to say something: closing is what makes a job
 * billable, so reopening changes what has already been invoiced. "Correction"
 * is not a reason anybody can act on six weeks later, and this is the only
 * record of why the invoice moved.
 */
export function reopenReasonProblem(reason: string): string | null {
  const given = reason.trim();
  if (given.length === 0) return 'Reopening a billed job needs a reason.';
  if (given.length < 12) {
    return 'Say what changed, in enough words to be useful to whoever reads this later.';
  }
  return null;
}
