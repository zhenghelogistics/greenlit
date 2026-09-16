/**
 * §17. Chaining one movement onto the end of another.
 *
 * A truck that finishes at a customer in Tuas is standing at the exact place
 * some other job needs a truck to start from. Today nobody sees that: the two
 * movements belong to different jobs, and jobs are worked one at a time.
 *
 * The opportunity is real money — an empty leg is a truck, a driver and a slot
 * on the day, paid for and carrying nothing — and it is the one thing the
 * schedule can find that a controller reading job by job cannot.
 *
 * Deliberately narrow. This *offers* a pairing and never makes it: matching is
 * an observation about two locations being the same, and whether the chain is
 * actually workable depends on timing, the customer's window, what is on the
 * chassis and whether the driver's shift covers it. Those are the controller's
 * to weigh, so the pairing is surfaced and the decision is left alone.
 */
import type { Movement } from './types.ts';

/**
 * Two ways of writing one place.
 *
 * "Tuas Ave 13", "TUAS AVE 13" and "Tuas Ave. 13," are the same gate, and a
 * controller typing any of them means the same thing. Comparison is on
 * letters and digits alone so the match survives the punctuation.
 *
 * It is deliberately not fuzzy. "Tuas Ave 13" and "Tuas Ave 14" are a hundred
 * metres and a different company apart, and a near-match offered as a chain is
 * worse than no chain — it sends a truck to the wrong gate.
 */
export const sameLocation = (a: string | null, b: string | null): boolean => {
  const key = (v: string | null) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const left = key(a);
  return left.length > 0 && left === key(b);
};

export interface RouteOpportunity {
  /** The movement that ends where the next one starts. */
  finishing: Movement;
  /** The movement waiting to be picked up there. */
  waiting: Movement;
  /** The shared place, as a person wrote it rather than normalised. */
  at: string;
}

/**
 * Movements a truck is already committed to, paired with work starting where
 * they end.
 *
 * `finishing` is anything scheduled or under way that has a destination.
 * `waiting` is anything not yet collected — there is no point offering to
 * chain onto a movement whose truck has already left.
 *
 * A movement never chains onto itself, and never onto another leg of the same
 * container: a box cannot be in two places, and the second leg of one
 * container's journey is a sequence the engine already knows about.
 */
export function routeOpportunities(movements: readonly Movement[]): RouteOpportunity[] {
  const finishing = movements.filter((m) =>
    m.destination && ['SCHEDULED', 'ASSIGNED', 'COLLECTED', 'IN_TRANSIT'].includes(m.movementStatus));

  const waiting = movements.filter((m) =>
    m.origin && ['PENDING', 'READY_FOR_SCHEDULING', 'SCHEDULED'].includes(m.movementStatus));

  const found: RouteOpportunity[] = [];
  for (const first of finishing) {
    for (const next of waiting) {
      if (first.movementId === next.movementId) continue;
      if (first.containerId && first.containerId === next.containerId) continue;
      if (!sameLocation(first.destination, next.origin)) continue;
      found.push({ finishing: first, waiting: next, at: first.destination });
    }
  }
  return found;
}

/**
 * The same pairing, said in one line.
 *
 * Named separately because the sentence is the product here: a controller
 * scanning a list needs to read "XA1234B ends at Tuas Ave 13, where MOV-7 is
 * waiting" without assembling it from six fields.
 */
export function describeOpportunity(opportunity: RouteOpportunity): string {
  const truck = opportunity.finishing.truck ?? 'A truck';
  return `${truck} ends at ${opportunity.at}, where ${opportunity.waiting.movementRef} starts`;
}
