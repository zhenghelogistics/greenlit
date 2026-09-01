import type {
  ExportContainer, ExportJob, ImportContainer, ImportJob, Movement, Thresholds,
} from './types.ts';
import type { ExceptionSeverity, WaitingOn } from './enums.ts';
import { currentLocation, isLocationUnknown } from './location.ts';
import { isVgmPlausible } from './gates.ts';

/**
 * A condition the system has detected. §27.1 is explicit that exceptions are
 * records, not flags — they are opened, they age, and they are closed with a
 * note. This is the detection half: a pure function of stored state.
 */
export interface DetectedException {
  exceptionType: string;
  severity: ExceptionSeverity;
  description: string;
  blocking: boolean;
  actionRequired: string;
  waitingOn: WaitingOn;
  containerId: string | null;
  movementId: string | null;
}

const days = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const hours = (from: string, to: string) =>
  (Date.parse(to) - Date.parse(from)) / 3_600_000;

const MOVED = ['COLLECTED', 'IN_TRANSIT', 'DELIVERED', 'ON_STANDBY', 'COMPLETED'];
const ARRIVED = ['DELIVERED', 'ON_STANDBY', 'COMPLETED'];

/** §27.2. Movement overdue: planned time passed, movement not COLLECTED. */
function overdueMovements(movements: readonly Movement[], now: string): DetectedException[] {
  return movements
    .filter((m) => {
      if (m.plannedDate === null) return false;
      if (!['SCHEDULED', 'ASSIGNED'].includes(m.movementStatus)) return false;
      return Date.parse(`${m.plannedDate}T${m.plannedTime ?? '23:59'}:00Z`) < Date.parse(now);
    })
    .map((m) => ({
      exceptionType: 'Movement overdue',
      severity: 'HIGH' as const,
      description: `${m.movementRef} was planned for ${m.plannedDate} and has not been collected`,
      blocking: false,
      actionRequired: 'Chase collection',
      waitingOn: 'US' as const,
      containerId: m.containerId,
      movementId: m.movementId,
    }));
}

/** §24. A container whose location cannot be determined is an operational problem. */
function locationUnknown(
  movements: readonly Movement[], domain: 'IMPORT' | 'EXPORT', containerId: string,
): DetectedException[] {
  if (!isLocationUnknown(currentLocation(movements, domain))) return [];
  return [{
    exceptionType: 'Location unknown',
    severity: 'CRITICAL',
    description: 'Movement records are contradictory; the container position cannot be derived',
    blocking: true,
    actionRequired: 'Reconstruct the movement history',
    waitingOn: 'US',
    containerId,
    movementId: null,
  }];
}

/** §27.2 import table, plus the §27.2A additions from edition 2.1. */
export function detectImportExceptions(
  job: ImportJob,
  container: ImportContainer,
  movements: readonly Movement[],
  thresholds: Thresholds,
  now: string,
): DetectedException[] {
  const own = movements.filter((m) => m.containerId === container.containerId);
  const out: DetectedException[] = [
    ...overdueMovements(own, now),
    ...locationUnknown(own, 'IMPORT', container.containerId),
  ];
  const today = now.slice(0, 10);
  const push = (e: DetectedException) => out.push(e);

  if (job.permitRejected) {
    push({
      exceptionType: 'Permit rejected', severity: 'CRITICAL',
      description: 'The permit was returned as rejected',
      blocking: true, actionRequired: 'Resolve permit rejection',
      waitingOn: 'US', containerId: container.containerId, movementId: null,
    });
  } else if (job.permitRequired && !job.permitReceived && job.eta
    && days(today, job.eta) <= thresholds.ddCriticalDays) {
    push({
      exceptionType: 'Permit missing', severity: 'HIGH',
      description: `Permit not received and ETA is ${job.eta}`,
      blocking: true, actionRequired: 'Request permit',
      waitingOn: 'CUSTOMER', containerId: container.containerId, movementId: null,
    });
  }

  if (job.portnetRequired && !job.portnetReleased && job.eta
    && days(today, job.eta) <= thresholds.ddCriticalDays) {
    push({
      exceptionType: 'Portnet release missing', severity: 'HIGH',
      description: `Portnet release not confirmed and ETA is ${job.eta}`,
      blocking: true, actionRequired: 'Check Portnet release',
      waitingOn: 'US', containerId: container.containerId, movementId: null,
    });
  }

  // §34.6. "Overdue" is reserved for the carrier last free date. Passing the
  // internal target is a different sentence and a different severity.
  const carrierLfd = container.demurrageLfd ?? container.combinedLfd;
  const collected = own.some((m) => m.movementType === 'IMPORT_DELIVERY'
    && MOVED.includes(m.movementStatus));

  if (carrierLfd && !collected) {
    const remaining = days(today, carrierLfd);
    if (remaining < 0) {
      push({
        exceptionType: 'Charge incurred', severity: 'CRITICAL',
        description: `Carrier last free day ${carrierLfd} passed ${Math.abs(remaining)} day(s) ago. Money is owed`,
        blocking: false, actionRequired: 'Prioritise collection and quantify the charge',
        waitingOn: 'US', containerId: container.containerId, movementId: null,
      });
    } else if (remaining <= thresholds.ddCriticalDays) {
      push({
        exceptionType: 'Charge risk', severity: 'HIGH',
        description: `Carrier last free day ${carrierLfd} is ${remaining} day(s) away`,
        blocking: false, actionRequired: 'Prioritise collection',
        waitingOn: 'US', containerId: container.containerId, movementId: null,
      });
    }
  }

  if (container.internalLfd && !collected && days(today, container.internalLfd) < 0
    && (!carrierLfd || days(today, carrierLfd) >= 0)) {
    push({
      exceptionType: 'Past internal free time target', severity: 'MEDIUM',
      description: `Internal target ${container.internalLfd} reached; carrier free time has not expired`,
      blocking: false, actionRequired: 'Review collection priority',
      waitingOn: 'US', containerId: container.containerId, movementId: null,
    });
  }

  // §36.3. Without this, a container accrues detention while everyone assumes
  // the customer will call.
  const deliveredAt = own.find((m) => m.movementType === 'IMPORT_DELIVERY'
    && m.movementStatus === 'COMPLETED')?.actualDeliveryAt;
  if (deliveredAt && !container.emptyReadyConfirmed
    && days(deliveredAt.slice(0, 10), today) > thresholds.emptyReadyConfirmationOverdueDays) {
    push({
      exceptionType: 'Empty ready not confirmed', severity: 'HIGH',
      description: `Delivered ${deliveredAt.slice(0, 10)}; customer has not confirmed the container is empty`,
      blocking: false, actionRequired: 'Chase empty-ready confirmation',
      waitingOn: 'CUSTOMER', containerId: container.containerId, movementId: null,
    });
  }

  // §36.2. Free time keeps running at our carpark; dwell must be visible.
  if (container.carparkArrivedAt
    && days(container.carparkArrivedAt.slice(0, 10), today) > thresholds.carparkDwellDays) {
    push({
      exceptionType: 'Import carpark dwell exceeded', severity: 'HIGH',
      description: `Laden import held at the company carpark since ${container.carparkArrivedAt.slice(0, 10)}`,
      blocking: false, actionRequired: 'Move the container onward',
      waitingOn: container.carparkReason === 'CUSTOMER_NO_SPACE' ? 'CUSTOMER' : 'US',
      containerId: container.containerId, movementId: null,
    });
  }

  return out;
}

/** §27.2 export table, plus the §27.2A additions. */
export function detectExportExceptions(
  job: ExportJob,
  container: ExportContainer,
  movements: readonly Movement[],
  thresholds: Thresholds,
  now: string,
): DetectedException[] {
  const own = movements.filter((m) =>
    m.containerId === container.exportContainerId
    || m.secondaryContainerId === container.exportContainerId);
  const out: DetectedException[] = [
    ...overdueMovements(own, now),
    ...locationUnknown(own, 'EXPORT', container.exportContainerId),
  ];
  const today = now.slice(0, 10);
  const id = container.exportContainerId;
  const push = (e: DetectedException) => out.push(e);

  const emptyDelivered = own.find((m) => m.movementType === 'EMPTY_COLLECTION'
    && ARRIVED.includes(m.movementStatus));

  // §58.3 — the failure the system exists to catch. Without it, a delivered
  // empty with no container number simply looks finished.
  if (emptyDelivered && container.containerNumber === null) {
    const since = emptyDelivered.actualDeliveryAt ?? `${today}T00:00:00Z`;
    if (hours(since, now) > thresholds.containerDetailsNotSentHours) {
      push({
        exceptionType: 'Empty delivered without container details', severity: 'HIGH',
        description: 'Empty was delivered but container number, seal and tare were never recorded',
        blocking: true, actionRequired: 'Enter container, seal and tare',
        waitingOn: 'US', containerId: id, movementId: emptyDelivered.movementId,
      });
    }
  }

  if (container.containerNumber !== null && !container.containerDetailsSent) {
    push({
      exceptionType: 'Container details not sent', severity: 'MEDIUM',
      description: 'Details captured but not sent, so the customer cannot begin stuffing',
      blocking: false, actionRequired: 'Send container details to customer',
      waitingOn: 'US', containerId: id, movementId: null,
    });
  }

  if (container.containerDetailsSentAt && !container.containerReady
    && days(container.containerDetailsSentAt.slice(0, 10), today) > thresholds.stuffingOverdueDays) {
    push({
      exceptionType: 'Stuffing overdue', severity: 'MEDIUM',
      description: `Details sent ${container.containerDetailsSentAt.slice(0, 10)}; customer has not confirmed ready`,
      blocking: false, actionRequired: 'Follow up customer stuffing',
      waitingOn: 'CUSTOMER', containerId: id, movementId: null,
    });
  }

  if (container.containerReadyAt && container.vgm === null
    && days(container.containerReadyAt.slice(0, 10), today) > thresholds.vgmOverdueDays) {
    push({
      exceptionType: 'VGM overdue', severity: 'MEDIUM',
      description: `Ready since ${container.containerReadyAt.slice(0, 10)}, VGM not received`,
      blocking: false, actionRequired: 'Obtain VGM',
      waitingOn: 'CUSTOMER', containerId: id, movementId: null,
    });
  }

  if (container.vgm !== null && container.tareWeightKg !== null
    && !isVgmPlausible(container.vgm, container.tareWeightKg)) {
    push({
      exceptionType: 'VGM implausible', severity: 'HIGH',
      description: `VGM ${container.vgm}kg is at or below tare ${container.tareWeightKg}kg`,
      blocking: true, actionRequired: 'Resolve VGM discrepancy',
      waitingOn: 'CUSTOMER', containerId: id, movementId: null,
    });
  }

  if (job.transhipmentStatus === 'PENDING' && job.transhipmentCheckedAt
    && days(job.transhipmentCheckedAt.slice(0, 10), today) > thresholds.transhipmentUnresolvedDays) {
    push({
      exceptionType: 'Transhipment unresolved', severity: 'MEDIUM',
      description: `Transhipment pending since ${job.transhipmentCheckedAt.slice(0, 10)}`,
      blocking: false, actionRequired: 'Chase transhipment availability',
      waitingOn: 'CARRIER', containerId: id, movementId: null,
    });
  }

  // §44.5. The state most likely to be forgotten, at company cost and risk.
  if (container.carparkArrivedAt
    && days(container.carparkArrivedAt.slice(0, 10), today) > thresholds.carparkDwellDays) {
    push({
      exceptionType: 'Carpark dwell exceeded', severity: 'HIGH',
      description: `At the carpark since ${container.carparkArrivedAt.slice(0, 10)}`,
      blocking: false, actionRequired: 'Escalate carpark dwell',
      waitingOn: 'US', containerId: id, movementId: null,
    });
  }

  // §44.2.1. Warns, never blocks — the cause is usually carrier-side.
  if (container.portnetProcessed !== 'PROCESSED' && container.containerReady) {
    push({
      exceptionType: 'Portnet not processed', severity: 'MEDIUM',
      description: `Container is ready but Portnet state is ${container.portnetProcessed}`,
      blocking: false, actionRequired: 'Chase Portnet processing',
      waitingOn: 'CARRIER', containerId: id, movementId: null,
    });
  }

  // §9.4. A setpoint that lives nowhere cannot be checked against what the
  // driver actually set.
  if (container.isReefer && (container.temperatureMode === null || container.temperatureSetpointC === null)) {
    push({
      exceptionType: 'Reefer setpoint missing', severity: 'HIGH',
      description: 'Reefer container has no temperature mode or setpoint recorded',
      blocking: true, actionRequired: 'Record temperature mode and setpoint',
      waitingOn: 'US', containerId: id, movementId: null,
    });
  }

  if (job.vesselClosingAt && !own.some((m) =>
    ['DIRECT_LADEN_TO_PORT', 'CARPARK_TO_PORT'].includes(m.movementType)
    && ARRIVED.includes(m.movementStatus))
    && Date.parse(job.vesselClosingAt) - Date.parse(now) < 86_400_000) {
    push({
      exceptionType: 'Vessel closing at risk', severity: 'CRITICAL',
      description: `Vessel closes ${job.vesselClosingAt} and the container is not at the port`,
      blocking: false, actionRequired: 'Escalate, closing at risk',
      waitingOn: 'US', containerId: id, movementId: null,
    });
  }

  return out;
}
