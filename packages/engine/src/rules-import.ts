import { PRECEDENCE, type Rule } from './next-action.ts';

/**
 * §37. Import next-action rules. Every row here maps to one row of the PRD
 * table, in the same order.
 */
export interface ImportCtx {
  mandatoryComplete: boolean;
  missingFields: readonly string[];
  permitRequired: boolean;
  permitReceived: boolean;
  permitRejected: boolean;
  portnetRequired: boolean;
  portnetReleased: boolean;
  deliveryAddressMissing: boolean;
  collectionEligible: boolean;
  hasScheduledDelivery: boolean;
  deliveryOverdue: boolean;
  daysUntilLfd: number | null;
  ddCriticalDays: number;
  collected: boolean;
  delivered: boolean;
  podCaptured: boolean;
  emptyReturned: boolean;
  detentionLfdApproaching: boolean;
  documentConflictOpen: boolean;
  openExceptionWaitingOn: 'US' | 'CUSTOMER' | 'CARRIER' | null;
  allMovementsComplete: boolean;
  jobOpen: boolean;
}

export const IMPORT_RULES: readonly Rule<ImportCtx>[] = [
  {
    id: 'IMP_LFD_CRITICAL',
    precedence: PRECEDENCE.DEADLINE_RISK,
    when: (c) => !c.collected && c.daysUntilLfd !== null && c.daysUntilLfd <= c.ddCriticalDays,
    action: 'Prioritise collection',
    waitingOn: 'US',
    reason: (c) => {
      const d = c.daysUntilLfd;
      if (d === null) return 'Container not collected';
      if (d === 0) return 'Last free day is today, container not collected';
      if (d < 0) return `Last free day passed ${Math.abs(d)} day(s) ago, container not collected`;
      return `Last free day in ${d} day(s), container not collected`;
    },
  },
  {
    id: 'IMP_DETENTION_APPROACHING',
    precedence: PRECEDENCE.DEADLINE_RISK,
    when: (c) => c.delivered && !c.emptyReturned && c.detentionLfdApproaching,
    action: 'Prioritise empty return',
    waitingOn: 'US',
    reason: () => 'Detention last free day approaching, empty not returned',
  },
  {
    id: 'IMP_MOVEMENT_OVERDUE',
    precedence: PRECEDENCE.OVERDUE_MOVEMENT,
    when: (c) => c.deliveryOverdue,
    action: 'Chase collection',
    waitingOn: 'US',
    reason: () => 'Movement scheduled, planned time passed, not collected',
  },
  {
    id: 'IMP_MANDATORY_MISSING',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => !c.mandatoryComplete,
    action: 'Complete job information',
    waitingOn: 'US',
    reason: (c) => `Missing mandatory information: ${c.missingFields.join(', ')}`,
  },
  {
    id: 'IMP_PERMIT_REJECTED',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.permitRejected,
    action: 'Resolve permit rejection',
    waitingOn: 'US',
    reason: () => 'Permit was returned as rejected',
  },
  {
    id: 'IMP_PORTNET_UNCONFIRMED',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.mandatoryComplete && c.portnetRequired && !c.portnetReleased,
    action: 'Check Portnet release',
    waitingOn: 'US',
    reason: () => 'Portnet release has not been confirmed',
  },
  {
    id: 'IMP_DOCUMENT_CONFLICT',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.documentConflictOpen,
    action: 'Review document conflict',
    waitingOn: 'US',
    reason: () => 'An extracted value conflicts with a stored critical field',
  },
  {
    id: 'IMP_ASSIGN_TRANSPORT',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.collectionEligible && !c.hasScheduledDelivery && !c.collected,
    action: 'Assign transportation',
    waitingOn: 'US',
    reason: () => 'Container is eligible for collection with no movement scheduled',
  },
  {
    id: 'IMP_CAPTURE_POD',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.delivered && !c.podCaptured,
    action: 'Capture proof of delivery',
    waitingOn: 'US',
    reason: () => 'Container delivered, proof of delivery not captured',
  },
  {
    id: 'IMP_PERMIT_MISSING',
    precedence: PRECEDENCE.EXTERNAL_BLOCKER,
    when: (c) => c.mandatoryComplete && c.permitRequired && !c.permitReceived && !c.permitRejected,
    action: 'Request permit',
    waitingOn: 'CUSTOMER',
    reason: () => 'Permit is required and has not been received',
  },
  {
    id: 'IMP_ADDRESS_DISPUTED',
    precedence: PRECEDENCE.EXTERNAL_BLOCKER,
    when: (c) => c.deliveryAddressMissing,
    action: 'Confirm delivery address',
    waitingOn: 'CUSTOMER',
    reason: () => 'Delivery address is missing or disputed',
  },
  {
    id: 'IMP_EXCEPTION_OPEN',
    precedence: PRECEDENCE.EXTERNAL_BLOCKER,
    when: (c) => c.openExceptionWaitingOn !== null,
    action: 'Resolve exception',
    waitingOn: 'US',
    reason: () => 'An open exception requires intervention',
  },
  {
    id: 'IMP_DELIVER',
    precedence: PRECEDENCE.ROUTINE,
    when: (c) => c.collected && !c.delivered,
    action: 'Deliver container',
    waitingOn: 'US',
    reason: () => 'Container collected, not yet delivered',
  },
  {
    id: 'IMP_RETURN_EMPTY',
    precedence: PRECEDENCE.ROUTINE,
    when: (c) => c.delivered && c.podCaptured && !c.emptyReturned,
    action: 'Return empty container',
    waitingOn: 'US',
    reason: () => 'Container delivered, empty not yet returned',
  },
  {
    id: 'IMP_CLOSE_JOB',
    precedence: PRECEDENCE.ROUTINE,
    when: (c) => c.allMovementsComplete && c.jobOpen,
    action: 'Close job',
    waitingOn: 'US',
    reason: () => 'All movements complete, job still open',
  },
];
