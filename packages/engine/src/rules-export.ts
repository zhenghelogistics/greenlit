import { PRECEDENCE, type Rule } from './next-action.ts';

/** §47. Export next-action rules, one row per PRD table row. */
export interface ExportCtx {
  mandatoryComplete: boolean;
  missingFields: readonly string[];
  cmsRequired: boolean;
  cmsCompleted: boolean;
  emptyGatePassed: boolean;
  emptyScheduled: boolean;
  emptyOverdue: boolean;
  emptyCollected: boolean;
  emptyDelivered: boolean;
  containerNumberCaptured: boolean;
  detailsSent: boolean;
  stuffingOverdue: boolean;
  containerReady: boolean;
  vgmReceived: boolean;
  vgmImplausible: boolean;
  transhipmentStatus: 'PENDING' | 'AVAILABLE' | 'NOT_AVAILABLE';
  carparkRequested: boolean;
  atCarpark: boolean;
  carparkDwellDays: number;
  carparkDwellThreshold: number;
  ladenGatePassed: boolean;
  hasLadenMovement: boolean;
  movementOverdue: boolean;
  vesselClosingAtRisk: boolean;
  deliveredToPort: boolean;
  jobOpen: boolean;
}

export const EXPORT_RULES: readonly Rule<ExportCtx>[] = [
  {
    id: 'EXP_VESSEL_CLOSING',
    precedence: PRECEDENCE.DEADLINE_RISK,
    when: (c) => c.vesselClosingAtRisk && !c.deliveredToPort,
    action: 'Escalate, closing at risk',
    waitingOn: 'US',
    reason: () => 'Vessel closing time approaching, container not at port',
  },
  {
    id: 'EXP_MOVEMENT_OVERDUE',
    precedence: PRECEDENCE.OVERDUE_MOVEMENT,
    when: (c) => c.movementOverdue,
    action: 'Chase movement',
    waitingOn: 'US',
    reason: () => 'Movement scheduled, planned time passed, not collected',
  },
  {
    id: 'EXP_EMPTY_OVERDUE',
    precedence: PRECEDENCE.OVERDUE_MOVEMENT,
    when: (c) => c.emptyOverdue,
    action: 'Chase empty collection',
    waitingOn: 'US',
    reason: () => 'Empty collection scheduled, date passed, not collected',
  },
  {
    id: 'EXP_MANDATORY_MISSING',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => !c.mandatoryComplete,
    action: 'Complete job information',
    waitingOn: 'US',
    reason: (c) => `Missing mandatory information: ${c.missingFields.join(', ')}`,
  },
  {
    id: 'EXP_CMS_PENDING',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.mandatoryComplete && c.cmsRequired && !c.cmsCompleted,
    action: 'Complete CMS',
    waitingOn: 'US',
    reason: () => 'CMS is required and has not been completed',
  },
  {
    id: 'EXP_CAPTURE_DETAILS',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.emptyDelivered && !c.containerNumberCaptured,
    action: 'Enter container, seal and tare',
    waitingOn: 'US',
    reason: () => 'Empty delivered, container identity not captured',
  },
  {
    id: 'EXP_SEND_DETAILS',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.containerNumberCaptured && !c.detailsSent,
    action: 'Send container details to customer',
    waitingOn: 'US',
    reason: () => 'Container details captured but not sent, so stuffing cannot begin',
  },
  {
    id: 'EXP_ARRANGE_EMPTY',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.emptyGatePassed && !c.emptyScheduled && !c.emptyCollected,
    action: 'Arrange empty collection',
    waitingOn: 'US',
    reason: () => 'Empty collection gate passed with no movement scheduled',
  },
  {
    id: 'EXP_CHECK_TRANSHIPMENT',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.vgmReceived && c.transhipmentStatus === 'PENDING' && !c.atCarpark,
    action: 'Check transhipment',
    waitingOn: 'US',
    reason: () => 'VGM received, transhipment availability not yet established',
  },
  {
    id: 'EXP_ARRANGE_LADEN',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.ladenGatePassed && c.transhipmentStatus === 'AVAILABLE' && !c.hasLadenMovement && !c.atCarpark,
    action: 'Arrange laden collection to port',
    waitingOn: 'US',
    reason: () => 'Laden gate passed and transhipment available, no movement created',
  },
  {
    id: 'EXP_ARRANGE_ONE_WAY',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.ladenGatePassed && c.transhipmentStatus === 'NOT_AVAILABLE'
      && c.carparkRequested && !c.hasLadenMovement,
    action: 'Arrange one-way loaded trip',
    waitingOn: 'US',
    reason: () => 'Customer requested carpark positioning, transhipment unavailable',
  },
  {
    id: 'EXP_ARRANGE_CARPARK_TO_PORT',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.atCarpark && c.transhipmentStatus === 'AVAILABLE',
    action: 'Arrange carpark to port',
    waitingOn: 'US',
    reason: () => 'Container at carpark and transhipment now available',
  },
  {
    id: 'EXP_CARPARK_DWELL',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.atCarpark && c.carparkDwellDays > c.carparkDwellThreshold,
    action: 'Escalate carpark dwell',
    waitingOn: 'US',
    reason: (c) => `Container at carpark ${c.carparkDwellDays} days, threshold ${c.carparkDwellThreshold}`,
  },
  {
    id: 'EXP_CLOSE_JOB',
    precedence: PRECEDENCE.INTERNAL_BLOCKER,
    when: (c) => c.deliveredToPort && c.jobOpen,
    action: 'Close export job',
    waitingOn: 'US',
    reason: () => 'Container delivered to port, job still open',
  },
  {
    id: 'EXP_VGM_IMPLAUSIBLE',
    precedence: PRECEDENCE.EXTERNAL_BLOCKER,
    when: (c) => c.vgmImplausible,
    action: 'Resolve VGM discrepancy',
    waitingOn: 'CUSTOMER',
    reason: () => 'VGM is at or below tare weight, which is impossible',
  },
  {
    id: 'EXP_OBTAIN_VGM',
    precedence: PRECEDENCE.EXTERNAL_BLOCKER,
    when: (c) => c.containerReady && !c.vgmReceived,
    action: 'Obtain VGM',
    waitingOn: 'CUSTOMER',
    reason: () => 'Customer confirmed container ready, VGM not received',
  },
  {
    id: 'EXP_STUFFING_OVERDUE',
    precedence: PRECEDENCE.EXTERNAL_BLOCKER,
    when: (c) => c.detailsSent && !c.containerReady && c.stuffingOverdue,
    action: 'Follow up customer stuffing',
    waitingOn: 'CUSTOMER',
    reason: () => 'Awaiting customer stuffing beyond threshold',
  },
  {
    id: 'EXP_CHECK_CARPARK_REQUIREMENT',
    precedence: PRECEDENCE.EXTERNAL_BLOCKER,
    when: (c) => c.transhipmentStatus === 'NOT_AVAILABLE' && !c.carparkRequested && !c.atCarpark,
    action: 'Check carpark requirement',
    waitingOn: 'CUSTOMER',
    reason: () => 'Transhipment unavailable, carpark positioning not yet decided',
  },
  {
    id: 'EXP_AWAIT_TRANSHIPMENT',
    precedence: PRECEDENCE.EXTERNAL_BLOCKER,
    when: (c) => c.atCarpark && c.transhipmentStatus !== 'AVAILABLE',
    action: 'Await transhipment',
    waitingOn: 'CARRIER',
    reason: () => 'Container at carpark, transhipment not available',
  },
  {
    id: 'EXP_AWAIT_STUFFING',
    precedence: PRECEDENCE.ROUTINE,
    when: (c) => c.emptyDelivered && c.detailsSent && !c.containerReady,
    action: 'Await customer stuffing',
    waitingOn: 'CUSTOMER',
    reason: () => 'Container details sent, customer stuffing in progress',
  },
];
