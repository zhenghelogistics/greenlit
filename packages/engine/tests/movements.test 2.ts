import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAssign, canComplete, canCreateMovement, canEnterStandby, canSchedule,
  canTransition, nextMovementRef, appearsOnSchedule, PERMITTED_TRANSITIONS,
} from '../src/movements.ts';
import { planExportMovements, planImportMovements, NEVER_AUTO_CREATED } from '../src/auto-create.ts';
import { detectExportExceptions, detectImportExceptions } from '../src/exceptions.ts';
import type { ExportContainer, ExportJob, ImportContainer, ImportJob, Movement, Thresholds } from '../src/types.ts';

const mv = (o: Partial<Movement> = {}): Movement => ({
  movementId: 'm', movementRef: 'MOV-001', jobId: 'j', jobDomain: 'EXPORT',
  jobNumber: 'EXP-1', containerId: 'c', containerNumber: null,
  secondaryContainerId: null, isDoubleMounted: false,
  movementType: 'EMPTY_COLLECTION', cargoState: 'EMPTY',
  originType: 'YARD', origin: 'Yard', destinationType: 'CUSTOMER', destination: 'Cust',
  plannedDate: null, plannedTime: null, truck: null, driver: null, chassisId: null,
  movementStatus: 'PENDING', actualCollectionAt: null, actualDeliveryAt: null,
  standbyRequired: false, standbyStartedAt: null, standbyEndedAt: null,
  autoCreated: false, cancelledReason: null, ...o,
});

const THRESHOLDS: Thresholds = {
  movementOverdueHours: 4, emptyReadyConfirmationOverdueDays: 2,
  containerDetailsNotSentHours: 24, stuffingOverdueDays: 3, vgmOverdueDays: 2,
  transhipmentUnresolvedDays: 2, carparkDwellDays: 3, emptyReturnOverdueDays: 3,
  portnetNotProcessedDays: 1, ddCriticalDays: 1,
};

test('§20: the documented transitions are permitted', () => {
  assert.equal(canTransition('PENDING', 'READY_FOR_SCHEDULING').allowed, true);
  assert.equal(canTransition('SCHEDULED', 'COLLECTED').allowed, true, 'ASSIGNED may be skipped');
  assert.equal(canTransition('COLLECTED', 'IN_TRANSIT').allowed, true);
  assert.equal(canTransition('DELIVERED', 'COMPLETED').allowed, true);
});

test('§20: undocumented transitions are refused', () => {
  assert.equal(canTransition('PENDING', 'COLLECTED').allowed, false);
  assert.equal(canTransition('SCHEDULED', 'COMPLETED').allowed, false);
  assert.equal(canTransition('READY_FOR_SCHEDULING', 'DELIVERED').allowed, false);
});

test('§20: terminal statuses cannot transition', () => {
  assert.equal(canTransition('COMPLETED', 'DELIVERED').allowed, false);
  assert.equal(canTransition('CANCELLED', 'SCHEDULED').allowed, false);
  assert.deepEqual(PERMITTED_TRANSITIONS.COMPLETED, []);
});

test('§20: SCHEDULED -> DELIVERED writes an inferred COLLECTED rather than a hole', () => {
  const r = canTransition('SCHEDULED', 'DELIVERED');
  assert.equal(r.allowed, true);
  assert.equal(r.inferredCollected, true, 'the gap must be labelled, not silent');
});

test('§21.3: standby cannot be entered unless it was declared', () => {
  assert.equal(canEnterStandby(mv({ movementStatus: 'DELIVERED' })).allowed, false);
  assert.equal(canEnterStandby(mv({ movementStatus: 'DELIVERED', standbyRequired: true })).allowed, true);
});

test('§20: DELIVERED and COMPLETED are distinct, per movement type', () => {
  const empty = mv({ movementType: 'EMPTY_COLLECTION', movementStatus: 'DELIVERED' });
  assert.equal(canComplete(empty, {}).allowed, false, 'needs container identity');
  assert.equal(canComplete(empty, { containerIdentityCaptured: true }).allowed, true);

  const delivery = mv({ movementType: 'IMPORT_DELIVERY', movementStatus: 'DELIVERED' });
  assert.equal(canComplete(delivery, {}).allowed, false, 'needs POD');
  assert.equal(canComplete(delivery, { podCaptured: true }).allowed, true);
});

test('§23.1: a duplicate active movement of the same type is rejected', () => {
  const existing = [mv({ movementType: 'EMPTY_COLLECTION', movementStatus: 'SCHEDULED' })];
  assert.equal(canCreateMovement(existing, 'j', 'EMPTY_COLLECTION').allowed, false);
  assert.equal(canCreateMovement(existing, 'j', 'DIRECT_LADEN_TO_PORT').allowed, true);
});

test('§23.1: a cancelled movement never blocks re-creation', () => {
  const cancelled = [mv({ movementType: 'EMPTY_COLLECTION', movementStatus: 'CANCELLED' })];
  assert.equal(canCreateMovement(cancelled, 'j', 'EMPTY_COLLECTION').allowed, true);
});

test('§18: movement_ref is never reused, including after cancellation', () => {
  const ms = [mv({ movementRef: 'MOV-001' }), mv({ movementRef: 'MOV-002', movementStatus: 'CANCELLED' })];
  assert.equal(nextMovementRef(ms), 'MOV-003', 'not a replacement MOV-002');
});

test('§21: a PENDING movement never appears on the schedule', () => {
  assert.equal(appearsOnSchedule(mv({ movementStatus: 'PENDING' })), false);
  assert.equal(appearsOnSchedule(mv({ movementStatus: 'READY_FOR_SCHEDULING' })), false);
  assert.equal(appearsOnSchedule(mv({ movementStatus: 'SCHEDULED' })), true);
});

test('§21: scheduling requires a planned date and resolved endpoints', () => {
  assert.equal(canSchedule(mv({ movementStatus: 'READY_FOR_SCHEDULING' })).allowed, false);
  assert.equal(canSchedule(mv({ movementStatus: 'READY_FOR_SCHEDULING', plannedDate: '2026-09-02' })).allowed, true);
});

test('§20: truck and driver are required only to reach ASSIGNED', () => {
  assert.equal(canAssign(mv({ movementStatus: 'SCHEDULED' })).allowed, false);
  assert.equal(canAssign(mv({ movementStatus: 'SCHEDULED', truck: 'TRA7727Y', driver: 'Tan' })).allowed, true);
});

// ---- §22 automatic creation ----

const importJob: ImportJob = {
  jobId: 'j', jobNumber: 'JOB-1', customer: 'ABC', blNumber: 'BL', vesselName: 'V',
  voyageNumber: '1E', eta: '2026-09-01', jobType: 'std', deliveryAddress: '12 Tuas',
  permitRequired: false, permitReceived: true, permitRejected: false,
  portnetRequired: false, portnetReleased: true, assignedController: 'S',
  cancelled: false, onHold: false, createdAt: '2026-09-01T00:00:00Z',
};
const importContainer: ImportContainer = {
  containerId: 'c', containerNumber: 'ABCU1234567', jobId: 'j', containerSize: '40',
  containerType: 'HQ', sealNumber: null, grossWeight: 1, cargoDescription: 'x',
  portTerminal: 'PSA', emptyReturnYard: 'Jurong', freeTimeModel: 'SPLIT',
  freeTimeCountsFrom: 'VESSEL_ETA', demurrageFreeDays: 7, demurrageLfd: null,
  detentionFreeDays: 7, detentionLfd: null, combinedFreeDays: null, combinedLfd: null,
  internalLfd: null, carparkReason: null, carparkArrivedAt: null,
  emptyReadyConfirmed: false, emptyReadyConfirmedAt: null, emptyReadySource: null,
  chassisId: null, chassisMountedAt: null, chassisReleasedAt: null,
  cancelled: false, onHold: false,
};

test('§22: eligibility creates the import delivery, once', () => {
  const first = planImportMovements(importJob, importContainer, [], true);
  assert.equal(first.length, 1);
  assert.equal(first[0]!.movementType, 'IMPORT_DELIVERY');

  const existing = [mv({ movementType: 'IMPORT_DELIVERY', movementStatus: 'SCHEDULED', containerId: 'c', jobId: 'j' })];
  assert.equal(planImportMovements(importJob, importContainer, existing, true).length, 0);
});

test('§22: nothing is created while the trigger is false', () => {
  assert.deepEqual(planImportMovements(importJob, importContainer, [], false), []);
});

test('§36.3: empty return is created but held until the customer confirms', () => {
  const delivered = [mv({
    movementType: 'IMPORT_DELIVERY', movementStatus: 'COMPLETED',
    containerId: 'c', jobId: 'j', jobDomain: 'IMPORT',
  })];
  const [proposal] = planImportMovements(importJob, importContainer, delivered, false);
  assert.equal(proposal?.movementType, 'EMPTY_RETURN');
  assert.ok(proposal?.heldUntil, 'must be held, not schedulable');

  const confirmed = { ...importContainer, emptyReadyConfirmed: true };
  const [ready] = planImportMovements(importJob, confirmed, delivered, false);
  assert.equal(ready?.heldUntil, null);
});

test('§22: three movement types are never auto-created', () => {
  assert.deepEqual([...NEVER_AUTO_CREATED].sort(),
    ['CARPARK_TO_CUSTOMER', 'IMPORT_TO_CARPARK', 'LADEN_SITE_TO_SITE']);
});

const exportJob: ExportJob = {
  exportJobId: 'e', jobNumber: 'EXP-1', customer: 'ABC', shipper: 'XYZ',
  bookingReference: 'BK', exportClearanceReference: 'OP', carrier: 'ONE',
  vesselName: 'V', voyageNumber: '1E', etaSingapore: '2026-09-03',
  vesselClosingAt: null, emptyCollectionYard: 'EK11', cmsRequired: true,
  cmsStatus: 'COMPLETED', containerQuantity: 1, containerSizeType: '40 HQ',
  truckInDate: '2026-08-18', truckOutDate: '2026-08-20', standbyRequired: false,
  standbyInstructionSource: null, standbyExpectedMinutes: null,
  transhipmentStatus: 'AVAILABLE', transhipmentCheckedAt: null, carparkRequested: false,
  assignedController: 'W', cancelled: false, onHold: false, createdAt: '2026-08-18T00:00:00Z',
};
const exportContainer: ExportContainer = {
  exportContainerId: 'xc', exportJobId: 'e', containerRef: 'C1',
  containerNumber: 'ABCU1', sealNumber: '1', tareWeightKg: 3850, sizeType: '40 HQ',
  isReefer: false, temperatureMode: null, temperatureSetpointC: null,
  stuffingLocation: 'Site A', containerDetailsSent: true, containerDetailsSentAt: null,
  containerReady: true, containerReadyAt: null, vgm: 24500, vgmReceivedAt: null,
  portnetProcessed: 'PROCESSED', chassisId: null,
  chassisMountedAt: null, chassisReleasedAt: null, carparkArrivedAt: null,
  cancelled: false, onHold: false,
};

test('§44.3: transhipment available routes direct to port', () => {
  const [p] = planExportMovements(exportJob, exportContainer, [], false, true);
  assert.equal(p?.movementType, 'DIRECT_LADEN_TO_PORT');
});

test('§44.4: unavailable plus carpark requested routes one-way loaded', () => {
  const job = { ...exportJob, transhipmentStatus: 'NOT_AVAILABLE' as const, carparkRequested: true };
  const [p] = planExportMovements(job, exportContainer, [], false, true);
  assert.equal(p?.movementType, 'ONE_WAY_LOADED');
});

test('§44.4: at carpark, availability creates a NEW movement not an edit', () => {
  const atCarpark = [mv({
    movementType: 'ONE_WAY_LOADED', movementStatus: 'COMPLETED',
    containerId: 'xc', jobId: 'e', movementRef: 'MOV-002',
  })];
  const [p] = planExportMovements(exportJob, exportContainer, atCarpark, false, true);
  assert.equal(p?.movementType, 'CARPARK_TO_PORT');
});

// ---- §27 exception detection ----

test('§27.2: an overdue movement is detected', () => {
  const late = [mv({ movementStatus: 'SCHEDULED', plannedDate: '2026-08-01', containerId: 'c', jobId: 'j' })];
  const found = detectImportExceptions(importJob, importContainer, late, THRESHOLDS, '2026-09-01T00:00:00Z');
  assert.ok(found.some((e) => e.exceptionType === 'Movement overdue'));
});

test('§58.3: empty delivered without container details is caught', () => {
  const c = { ...exportContainer, containerNumber: null, containerDetailsSent: false };
  const ms = [mv({
    movementType: 'EMPTY_COLLECTION', movementStatus: 'DELIVERED', containerId: 'xc',
    jobId: 'e', actualDeliveryAt: '2026-08-20T02:00:00Z',
  })];
  const found = detectExportExceptions(exportJob, c, ms, THRESHOLDS, '2026-08-25T00:00:00Z');
  const exc = found.find((e) => e.exceptionType === 'Empty delivered without container details');
  assert.ok(exc, 'this is the failure the system exists to catch');
  assert.equal(exc?.blocking, true);
});

test('§34.6: overdue is reserved for the carrier date, not the internal target', () => {
  const c = {
    ...importContainer, internalLfd: '2026-08-25', demurrageLfd: '2026-09-10',
  };
  const found = detectImportExceptions(importJob, c, [], THRESHOLDS, '2026-09-01T00:00:00Z');
  assert.ok(found.some((e) => e.exceptionType === 'Past internal free time target'));
  assert.ok(!found.some((e) => e.exceptionType === 'Charge incurred'),
    'must not be called overdue while inside carrier free time');
});

test('§34.6: past the carrier date, money is owed', () => {
  const c = { ...importContainer, internalLfd: '2026-08-20', demurrageLfd: '2026-08-28' };
  const found = detectImportExceptions(importJob, c, [], THRESHOLDS, '2026-09-01T00:00:00Z');
  const exc = found.find((e) => e.exceptionType === 'Charge incurred');
  assert.equal(exc?.severity, 'CRITICAL');
});

test('§43: an implausible VGM is detected and blocks', () => {
  const c = { ...exportContainer, vgm: 3850, tareWeightKg: 3850 };
  const found = detectExportExceptions(exportJob, c, [], THRESHOLDS, '2026-09-01T00:00:00Z');
  const exc = found.find((e) => e.exceptionType === 'VGM implausible');
  assert.equal(exc?.blocking, true);
});

test('§9.4: a reefer with no setpoint is an exception', () => {
  const c = { ...exportContainer, isReefer: true };
  const found = detectExportExceptions(exportJob, c, [], THRESHOLDS, '2026-09-01T00:00:00Z');
  assert.ok(found.some((e) => e.exceptionType === 'Reefer setpoint missing'));
});

test('§44.5: carpark dwell beyond threshold escalates', () => {
  const c = { ...exportContainer, carparkArrivedAt: '2026-08-23T00:00:00Z' };
  const found = detectExportExceptions(exportJob, c, [], THRESHOLDS, '2026-09-01T00:00:00Z');
  assert.ok(found.some((e) => e.exceptionType === 'Carpark dwell exceeded'));
});

test('a clean job raises nothing', () => {
  assert.deepEqual(detectExportExceptions(exportJob, exportContainer, [], THRESHOLDS, '2026-08-19T00:00:00Z'), []);
});
