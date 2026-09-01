import type { NextActionResult } from './types.ts';
import type { WaitingOn } from './enums.ts';

/**
 * §25.1. The precedence ladder. Several conditions can be true at once; the
 * engine returns exactly one `next_action_required`, chosen by this order.
 *
 * Internal blockers outrank external ones deliberately: if a job is waiting on
 * a customer for VGM *and* on us to schedule a movement, show our task. It is
 * the one the controller can act on now.
 */
export const PRECEDENCE = {
  DEADLINE_RISK: 1,
  OVERDUE_MOVEMENT: 2,
  INTERNAL_BLOCKER: 3,
  EXTERNAL_BLOCKER: 4,
  ROUTINE: 5,
  NO_ACTION: 6,
} as const;
export type Precedence = (typeof PRECEDENCE)[keyof typeof PRECEDENCE];

/**
 * One row of a domain rule table. §25 requires every row to be traceable to a
 * stored condition: if a next action cannot be derived from stored data, it is
 * not a next action, it is a note.
 */
export interface Rule<Ctx> {
  /** Stable identifier, used by tests to prove every row is reachable. */
  id: string;
  precedence: Precedence;
  when: (ctx: Ctx) => boolean;
  action: string;
  waitingOn: WaitingOn;
  /**
   * §25. `blocking_reason` exists so the queue can explain itself. "Obtain VGM"
   * is the action; "Customer confirmed ready on 14 Aug, VGM not received in 4
   * days" is the reason. A controller chasing a customer needs both.
   */
  reason: (ctx: Ctx) => string;
}

const NO_ACTION: NextActionResult = {
  nextActionRequired: 'No action required',
  blockingReason: null,
  waitingOn: 'NOBODY',
};

/**
 * Evaluate a rule table. Lowest precedence number wins; within a tier, the
 * first matching row in table order wins.
 */
export function evaluate<Ctx>(rules: readonly Rule<Ctx>[], ctx: Ctx): NextActionResult {
  let best: Rule<Ctx> | undefined;
  for (const rule of rules) {
    if (!rule.when(ctx)) continue;
    if (!best || rule.precedence < best.precedence) best = rule;
  }
  if (!best) return NO_ACTION;
  return {
    nextActionRequired: best.action,
    blockingReason: best.reason(ctx),
    waitingOn: best.waitingOn,
  };
}

/** Which rule fired. Exposed for tests and for the audit trail in §13. */
export function evaluateRuleId<Ctx>(rules: readonly Rule<Ctx>[], ctx: Ctx): string | null {
  let best: Rule<Ctx> | undefined;
  for (const rule of rules) {
    if (!rule.when(ctx)) continue;
    if (!best || rule.precedence < best.precedence) best = rule;
  }
  return best?.id ?? null;
}
