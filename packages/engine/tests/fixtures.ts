import type { ImportCtx } from '../src/rules-import.ts';
import type { ExportCtx } from '../src/rules-export.ts';

/** A job progressing normally with nothing outstanding. Rules override from here. */
export const importBase: ImportCtx = {
  mandatoryComplete: true, missingFields: [],
  permitRequired: false, permitReceived: true, permitRejected: false,
  portnetRequired: false, portnetReleased: true,
  deliveryAddressMissing: false,
  collectionEligible: false, hasScheduledDelivery: true, deliveryOverdue: false,
  daysUntilLfd: null, ddCriticalDays: 1,
  collected: true, delivered: true, podCaptured: true, emptyReturned: true,
  detentionLfdApproaching: false, documentConflictOpen: false,
  openExceptionWaitingOn: null, allMovementsComplete: false, jobOpen: true,
};

export const exportBase: ExportCtx = {
  mandatoryComplete: true, missingFields: [],
  cmsRequired: false, cmsCompleted: true,
  emptyGatePassed: false, emptyScheduled: true, emptyOverdue: false,
  emptyCollected: true, emptyDelivered: true,
  containerNumberCaptured: true, detailsSent: true,
  stuffingOverdue: false, containerReady: true,
  vgmReceived: true, vgmImplausible: false,
  transhipmentStatus: 'AVAILABLE', carparkRequested: false,
  atCarpark: false, carparkDwellDays: 0, carparkDwellThreshold: 3,
  ladenGatePassed: false, hasLadenMovement: true,
  movementOverdue: false, vesselClosingAtRisk: false,
  deliveredToPort: false, jobOpen: true,
};
