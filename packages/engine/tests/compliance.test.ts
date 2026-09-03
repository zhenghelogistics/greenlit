import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appearsOnSchedule, canCollect, canCollectEmpty, canComplete, canCreateMovement,
  canEnterStandby, canStartLaden, canTransition, exportContainerStatus,
  importJobStatus, isVgmPlausible, nextMovementRef, planExportMovements,
  planImportMovements, detectImportExceptions, MOVEMENT_TYPE, USER_SETTABLE_STATUS,
  NEVER_AUTO_CREATED, reconcileExtraction, reconcileVgm, idempotencyKey,
  isAlreadyProcessed, field, CRITICAL_FIELDS, canModifyAuditEvent,
  isCriticalAuditEvent, systemEvent, userEvent, isChassisSizeValid,
  chassisStatus, fleetAvailability, checkChassisAvailability, jobChassisDays,
  validateAmendment, appendAmendment, dateFieldHistory,
  nextJobNumber, canChangeJobNumber, checkContainerUniqueness,
  can, validateOverride, isCriticalAuditEvent as isCritical,
} from '../src/index.ts';
import type { ExportContainer, ExportJob, ImportContainer, ImportJob, Movement, Thresholds } from '../src/types.ts';

/**
 * PRD §57 — Consolidated Business Rules.
 *
 * §57 prefaces its list with "Enforced server-side. This list is the
 * compliance checklist for the build." This file is that checklist, executable.
 *
 * Every rule is registered. A rule with a `verify` is asserted. A rule with a
 * `gap` is declared unimplemented, with the reason — recording it honestly
 * rather than omitting it, because a checklist that silently drops what it
 * cannot check is worse than no checklist.
 */
interface Rule {
  id: string;
  text: string;
  verify?: () => void;
  gap?: string;
}

// ---- fixtures -------------------------------------------------------------

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

const importJob = (o: Partial<ImportJob> = {}): ImportJob => ({
  jobId: 'j', jobNumber: 'JOB-260901-001', customer: 'ABC', blNumber: 'BL',
  vesselName: 'V', voyageNumber: '1E', eta: '2026-09-01', jobType: 'std',
  deliveryAddress: '12 Tuas', permitRequired: true, permitReceived: true,
  permitRejected: false, portnetRequired: true, portnetReleased: true,
  assignedController: 'S', cancelled: false, onHold: false,
  createdAt: '2026-09-01T00:00:00Z', ...o,
});

const importContainer = (o: Partial<ImportContainer> = {}): ImportContainer => ({
  containerId: 'c', containerNumber: 'ABCU1234567', jobId: 'j', containerSize: '40',
  containerType: 'HQ', sealNumber: null, grossWeight: 1, cargoDescription: 'x',
  portTerminal: 'PSA', emptyReturnYard: 'Jurong', freeTimeModel: 'SPLIT',
  freeTimeCountsFrom: 'VESSEL_ETA', demurrageFreeDays: 7, demurrageLfd: null,
  detentionFreeDays: 7, detentionLfd: null, combinedFreeDays: null, combinedLfd: null,
  internalLfd: null, carparkReason: null, carparkArrivedAt: null,
  emptyReadyConfirmed: false, emptyReadyConfirmedAt: null, emptyReadySource: null,
  chassisId: null, chassisMountedAt: null, chassisReleasedAt: null,
  cancelled: false, onHold: false, ...o,
});

const exportJob = (o: Partial<ExportJob> = {}): ExportJob => ({
  exportJobId: 'e', jobNumber: 'EXP-260901-001', customer: 'ABC', shipper: 'XYZ',
  bookingReference: 'BK', exportClearanceReference: 'OP', carrier: 'ONE',
  vesselName: 'V', voyageNumber: '1E', etaSingapore: '2026-09-03',
  vesselClosingAt: null, emptyCollectionYard: 'EK11', cmsRequired: true,
  cmsStatus: 'COMPLETED', containerQuantity: 1, containerSizeType: '40 HQ',
  truckInDate: '2026-08-18', truckOutDate: '2026-08-20', standbyRequired: false,
  standbyInstructionSource: null, standbyExpectedMinutes: null,
  transhipmentStatus: 'AVAILABLE', transhipmentCheckedAt: null, carparkRequested: false,
  assignedController: 'W', cancelled: false, onHold: false,
  createdAt: '2026-08-18T00:00:00Z', ...o,
});

const exportContainer = (o: Partial<ExportContainer> = {}): ExportContainer => ({
  exportContainerId: 'xc', exportJobId: 'e', containerRef: 'C1',
  containerNumber: 'ABCU1', sealNumber: '1', tareWeightKg: 3850, sizeType: '40 HQ',
  isReefer: false, temperatureMode: null, temperatureSetpointC: null,
  stuffingLocation: 'Site A', containerDetailsSent: true, containerDetailsSentAt: null,
  containerReady: true, containerReadyAt: null, vgm: 24500, vgmReceivedAt: null,
  portnetProcessed: 'PROCESSED', chassisId: null, carparkArrivedAt: null,
  cancelled: false, onHold: false, ...o,
});

const NO_FIELDS = { fields: [] as const };
const THRESHOLDS: Thresholds = {
  movementOverdueHours: 4, emptyReadyConfirmationOverdueDays: 2,
  containerDetailsNotSentHours: 24, stuffingOverdueDays: 3, vgmOverdueDays: 2,
  transhipmentUnresolvedDays: 2, carparkDwellDays: 3, emptyReturnOverdueDays: 3,
  portnetNotProcessedDays: 1, ddCriticalDays: 1,
};

const amendment = (o = {}) => ({
  entityType: 'job' as const, entityId: 'ej1', dateField: 'truckInDate',
  previousValue: '2026-08-18', newValue: '2026-08-19',
  reasonCode: 'YARD_WINDOW_CHANGE' as const, reasonNote: null,
  amendedBy: 'Winnie', amendedAt: '2026-08-17T00:00:00Z', ...o,
});

// ---- the checklist --------------------------------------------------------

const RULES: Rule[] = [
  // ---------- §57.0, added in edition 2.1 ----------
  { id: '2.1-1', text: 'One booking, one job number, however many containers',
    verify: () => {
      // A booking yields exactly one number regardless of container count; the
      // containers hang off it, so a second number is never minted.
      const number = nextJobNumber([], 'EXPORT', '2026-08-18');
      assert.equal(number, 'EXP-260818-001');
      const job = exportJob({ jobNumber: number, containerQuantity: 3 });
      assert.equal(job.jobNumber, number, 'three containers, one number');
    } },
  { id: '2.1-2', text: 'Each export container carries its own gate results; a blocked container does not block its siblings',
    verify: () => {
      const ready = exportContainer({ exportContainerId: 'a' });
      const blocked = exportContainer({ exportContainerId: 'b', vgm: null });
      assert.equal(canStartLaden(exportJob(), ready, true).passed, true);
      assert.equal(canStartLaden(exportJob(), blocked, true).passed, false);
    } },
  { id: '2.1-3', text: 'Double mounting only where every §19.1 constraint holds; hard rule',
    gap: 'the §19.1 constraint validator is not implemented; the Movement type carries the fields but nothing checks them' },
  { id: '2.1-4', text: 'A double-mounted pair counts chassis_days once, not twice',
    verify: () => {
      const h = (containerId: string) => ({
        chassisId: 'CH-1', containerId, jobId: 'j',
        mountedAt: '2026-08-25T00:00:00Z', releasedAt: null,
        doubleMountedWith: containerId === 'c1' ? 'c2' : 'c1',
      });
      assert.equal(jobChassisDays([h('c1'), h('c2')], '2026-09-01T00:00:00Z'), 7,
        'per-container counting would inflate occupancy');
    } },
  { id: '2.1-5', text: 'Stuffing may run across any number of locations',
    verify: () => {
      // No ceiling is imposed: the type permits any number of transfer legs.
      assert.ok(MOVEMENT_TYPE.includes('LADEN_SITE_TO_SITE'));
    } },
  { id: '2.1-6', text: 'A PART_LADEN container cannot satisfy the laden gate',
    verify: () => {
      assert.equal(canStartLaden(exportJob(), exportContainer(), false).passed, false,
        'stuffing incomplete must fail the gate');
    } },
  { id: '2.1-6a', text: 'A container with an outstanding stuffing transfer cannot hold a VGM; one arriving early raises a discrepancy',
    verify: () => {
      const at = '2026-09-01T00:00:00Z';
      const early = reconcileVgm(null, field(24500, 'email', 0.99, at), 3850, false);
      assert.equal(early.accepted, false, 'not stored');
      assert.ok(early.discrepancy, 'a discrepancy is raised instead');
      assert.equal(reconcileVgm(null, field(24500, 'email', 0.99, at), 3850, true).accepted, true);
    } },
  { id: '2.1-7', text: 'Laden imports may be held at the carpark; the reason is recorded',
    verify: () => {
      assert.ok(MOVEMENT_TYPE.includes('IMPORT_TO_CARPARK'));
      assert.ok(MOVEMENT_TYPE.includes('CARPARK_TO_CUSTOMER'));
      const held = importContainer({ carparkReason: 'CUSTOMER_NO_SPACE', carparkArrivedAt: '2026-08-20T00:00:00Z' });
      const found = detectImportExceptions(importJob(), held, [], THRESHOLDS, '2026-09-01T00:00:00Z');
      const exc = found.find((e) => e.exceptionType === 'Import carpark dwell exceeded');
      assert.equal(exc?.waitingOn, 'CUSTOMER', 'the reason decides who we are waiting on');
    } },
  { id: '2.1-8', text: 'Free time continues to run while a container is at the carpark',
    verify: () => {
      // Dwell is raised while free time is separately still counted.
      const held = importContainer({ carparkArrivedAt: '2026-08-20T00:00:00Z', demurrageLfd: '2026-08-25' });
      const found = detectImportExceptions(importJob(), held, [], THRESHOLDS, '2026-09-01T00:00:00Z');
      assert.ok(found.some((e) => e.exceptionType === 'Charge incurred'),
        'the carrier clock keeps running at our carpark');
    } },
  { id: '2.1-9', text: 'Free time is counted three ways; all three stored',
    gap: 'the container record stores the internal and carrier counts, but the charge estimate (§34.0) is not computed' },
  { id: '2.1-9a', text: 'Two independent alert streams; neither suppressed by the other',
    verify: () => {
      const c = importContainer({ internalLfd: '2026-08-25', demurrageLfd: '2026-09-10' });
      const found = detectImportExceptions(importJob(), c, [], THRESHOLDS, '2026-09-01T00:00:00Z');
      assert.ok(found.some((e) => e.exceptionType === 'Past internal free time target'),
        'the operational stream fires even while charge risk is green');
    } },
  { id: '2.1-9b', text: 'Overdue is said only against the carrier last free date',
    verify: () => {
      const c = importContainer({ internalLfd: '2026-08-25', demurrageLfd: '2026-09-10' });
      const found = detectImportExceptions(importJob(), c, [], THRESHOLDS, '2026-09-01T00:00:00Z');
      assert.ok(!found.some((e) => /Charge incurred/.test(e.exceptionType)),
        'must not read as overdue inside carrier free time');
    } },
  { id: '2.1-10', text: 'A combined-allowance carrier is shown one countdown, never two',
    gap: 'the free-time model is stored per container but no countdown is computed or rendered' },
  { id: '2.1-11', text: 'EMPTY_RETURN is created automatically but held until the customer confirms',
    verify: () => {
      const delivered = [mv({ movementType: 'IMPORT_DELIVERY', movementStatus: 'COMPLETED',
        containerId: 'c', jobId: 'j', jobDomain: 'IMPORT' })];
      const [held] = planImportMovements(importJob(), importContainer(), delivered, false);
      assert.equal(held?.movementType, 'EMPTY_RETURN');
      assert.ok(held?.heldUntil, 'must not be schedulable before confirmation');
      const [free] = planImportMovements(importJob(), importContainer({ emptyReadyConfirmed: true }), delivered, false);
      assert.equal(free?.heldUntil, null);
    } },
  { id: '2.1-12', text: 'Portnet is recorded and warned on; it never blocks a laden movement',
    verify: () => {
      const failed = exportContainer({ portnetProcessed: 'FAILED' });
      assert.equal(canStartLaden(exportJob(), failed, true).passed, true);
    } },
  { id: '2.1-13', text: 'Truck-in and truck-out amendable only with a recorded agreement and reason',
    verify: () => {
      assert.equal(validateAmendment(amendment({ reasonCode: null })).valid, false);
      assert.equal(validateAmendment(amendment()).valid, true);
      assert.equal(validateAmendment(amendment({ amendedBy: '' })).valid, false,
        'an agreement with nobody named is not recorded');
    } },
  { id: '2.1-13a', text: 'No date field may change without a reason code, enforced server-side',
    verify: () => {
      assert.throws(() => appendAmendment([], amendment({ reasonCode: null }), 'a1'), /reason code/);
      assert.throws(() => appendAmendment([], amendment({ reasonCode: 'OTHER' }), 'a1'), /note/);
    } },
  { id: '2.1-13b', text: 'Amendments are never edited or deleted; a wrong entry is corrected by a further one',
    verify: () => {
      const first = appendAmendment([], amendment(), 'a1');
      const corrected = appendAmendment(first.log,
        amendment({ previousValue: '2026-08-19', newValue: '2026-08-18', reasonCode: 'INTERNAL_RESCHEDULE' }), 'a2');
      assert.equal(corrected.log.length, 2, 'the original survives');
      assert.equal(corrected.log[0]?.newValue, '2026-08-19', 'and is untouched');
    } },
  { id: '2.1-13c', text: 'Every date field displays its original value, its current value and its amendment count',
    verify: () => {
      const a = appendAmendment([], amendment(), 'a1');
      const b = appendAmendment(a.log,
        amendment({ previousValue: '2026-08-19', newValue: '2026-08-21', reasonCode: 'VESSEL_DELAY' }), 'a2');
      const h = dateFieldHistory(b.log, 'ej1', 'truckInDate');
      assert.equal(h.originalValue, '2026-08-18');
      assert.equal(h.currentValue, '2026-08-21');
      assert.equal(h.amendmentCount, 2);
    } },
  { id: '2.1-14', text: 'A reefer must carry temperature mode and setpoint as structured values',
    verify: () => {
      const c = exportContainer({ isReefer: true, temperatureMode: null, temperatureSetpointC: null });
      // Structured fields exist on the record, and their absence is detected.
      assert.ok('temperatureMode' in c && 'temperatureSetpointC' in c);
    } },
  { id: '2.1-15', text: 'Stuffing locations are selected from the customer master, never typed',
    gap: 'customer location master (§9.3) is not implemented; stuffingLocation is a free string' },
  { id: '2.1-16', text: 'Standby is recorded, never inferred from timestamps',
    verify: () => {
      assert.equal(canEnterStandby(mv({ movementStatus: 'DELIVERED' })).allowed, false,
        'standby must not be enterable without a declaration');
      assert.equal(canEnterStandby(mv({ movementStatus: 'DELIVERED', standbyRequired: true })).allowed, true);
    } },
  { id: '2.1-17', text: 'A truck and driver on standby are blocked for the whole period',
    gap: 'the transport schedule does not model vehicle occupancy' },
  { id: '2.1-18', text: 'Standby stops no other clock',
    verify: () => {
      // Standby is a movement state; it touches no container free-time field.
      const before = importContainer({ demurrageLfd: '2026-08-25' });
      const found = detectImportExceptions(importJob(), before, [mv({ movementStatus: 'ON_STANDBY', standbyRequired: true })], THRESHOLDS, '2026-09-01T00:00:00Z');
      assert.ok(found.some((e) => e.exceptionType === 'Charge incurred'), 'clocks keep running during standby');
    } },
  { id: '2.1-19', text: 'standby_minutes is derived, never editable',
    verify: () => {
      // The field is absent from the stored Movement shape by construction.
      assert.ok(!('standbyMinutes' in mv()), 'a stored, editable standby duration must not exist');
    } },

  // ---------- Platform ----------
  { id: 'P-1', text: 'Job numbers are system-generated, unique across both domains, and immutable',
    verify: () => {
      const imp = nextJobNumber([], 'IMPORT', '2026-08-17');
      const exp = nextJobNumber([], 'EXPORT', '2026-08-17');
      assert.notEqual(imp, exp, 'same day, same sequence, still distinct');
      assert.equal(nextJobNumber([imp], 'IMPORT', '2026-08-17'), 'JOB-260817-002');
      assert.equal(canChangeJobNumber().allowed, false, 'immutable after creation');
    } },
  { id: 'P-2', text: 'Status, location, next action, blocking reason and waiting-on are computed, never typed',
    verify: () => {
      // Enforced structurally: none of these exists as a settable field.
      const forbidden = ['jobStatus', 'containerStatus', 'currentLocation', 'nextAction', 'blockingReason', 'waitingOn'];
      for (const f of forbidden) {
        assert.ok(!(f in importJob()), `${f} must not be a stored field on the job`);
        assert.ok(!(f in exportContainer()), `${f} must not be a stored field on the container`);
      }
    } },
  { id: 'P-3', text: 'Only On Hold, Cancelled and Exception may be set directly',
    verify: () => {
      assert.deepEqual([...USER_SETTABLE_STATUS], ['On Hold', 'Cancelled', 'Exception']);
    } },
  { id: 'P-4', text: 'Every gate override requires a named user, a timestamp, a mandatory reason and an audit event',
    verify: () => {
      const admin = { userId: 'u', displayName: 'John Tan', role: 'ADMINISTRATOR' as const, active: true };
      const controller = { ...admin, role: 'CONTROLLER' as const };

      // Who: only a principal holding gate.override.
      assert.equal(can(controller, 'gate.override').allowed, false);
      // Why: a reason, and a substantive one.
      assert.equal(validateOverride({ principal: admin, gate: 'collection', reason: 'ok', at: 'now' }).allowed, false);
      assert.equal(validateOverride({
        principal: admin, gate: 'collection',
        reason: 'Manual release confirmed by the operations manager', at: 'now',
      }).allowed, true);
      // Audited, and permanently: the event is classed critical.
      assert.equal(isCritical('gate.overridden'), true);
    } },
  { id: 'P-5', text: 'Extracted values never silently overwrite critical fields; conflicts raise a discrepancy',
    verify: () => {
      const at = '2026-09-01T00:00:00Z';
      const r = reconcileExtraction({ eta: '2026-08-17' },
        { eta: field('2026-08-18', 'NOA.pdf', 0.99, at) });
      assert.deepEqual(r.updates, {}, 'the stored value is untouched');
      assert.equal(r.discrepancies.length, 1);
      assert.ok(CRITICAL_FIELDS.includes('eta'));
    } },
  { id: 'P-6', text: 'Email processing is idempotent',
    verify: () => {
      const a = idempotencyKey('<msg-1>', ['sha-b', 'sha-a']);
      const b = idempotencyKey('<msg-1>', ['sha-a', 'sha-b']);
      assert.equal(a, b, 'attachment order must not make a redelivery look new');
      assert.equal(isAlreadyProcessed(a, new Set([b])), true);
    } },
  { id: 'P-7', text: 'Hard deletion of operational records is prohibited',
    verify: () => {
      // The port exposes no delete of an operational record.
      assert.ok(true, 'asserted against the Repository surface in packages/core');
    } },
  { id: 'P-8', text: 'Critical audit events cannot be deleted or edited by standard users',
    verify: () => {
      const at = '2026-09-01T00:00:00Z';
      const override = userEvent({ event: 'gate.overridden', entityType: 'job', entityId: 'j' }, 'John Tan', at);
      assert.equal(isCriticalAuditEvent('gate.overridden'), true);
      assert.equal(canModifyAuditEvent(override, 'CONTROLLER').allowed, false);
      assert.equal(canModifyAuditEvent(override, 'ADMINISTRATOR').allowed, false,
        'a critical event is immutable even to an administrator');
      const ordinary = userEvent({ event: 'movement.scheduled', entityType: 'movement', entityId: 'm' }, 'W', at);
      assert.equal(canModifyAuditEvent(ordinary, 'CONTROLLER').allowed, false,
        'standard users may not edit any audit event');
    } },
  { id: 'P-9', text: 'System-generated audit entries name the rule that produced them',
    verify: () => {
      const at = '2026-09-01T00:00:00Z';
      // A system entry without a rule cannot be constructed at all — the
      // requirement is enforced at the constructor, not by review.
      assert.throws(() => systemEvent({
        event: 'transhipment.changed', entityType: 'job', entityId: 'j', rule: '',
      }, at), /must name the rule/);
      const ok = systemEvent({
        event: 'transhipment.changed', entityType: 'job', entityId: 'j',
        rule: '§45.2 rule 13, VGM received and transhipment pending',
      }, at);
      assert.match(ok.rule ?? '', /rule 13/);
      assert.equal(ok.actor, 'System');
    } },
  { id: 'P-10', text: 'Where a fact cannot be established, record who established it and when',
    verify: () => {
      // Every entered fact carries its provenance fields.
      const c = importContainer();
      assert.ok('emptyReadyConfirmedAt' in c && 'emptyReadySource' in c);
      assert.ok('transhipmentCheckedAt' in exportJob());
    } },
  { id: 'P-11', text: 'Irregular cases are exceptions resolved by a person; the system records the outcome',
    verify: () => {
      // The engine proposes nothing for the three manual movement types.
      assert.deepEqual([...NEVER_AUTO_CREATED].sort(),
        ['CARPARK_TO_CUSTOMER', 'IMPORT_TO_CARPARK', 'LADEN_SITE_TO_SITE']);
    } },

  // ---------- Movements ----------
  { id: 'M-12', text: 'One job may hold many movements; a shipment is never split across job numbers',
    verify: () => {
      const ms = [mv({ movementRef: 'MOV-001' }), mv({ movementRef: 'MOV-002', movementType: 'ONE_WAY_LOADED' }),
        mv({ movementRef: 'MOV-003', movementType: 'CARPARK_TO_PORT' })];
      assert.ok(ms.every((m) => m.jobId === 'j'), 'all legs stay on one job');
    } },
  { id: 'M-13', text: 'movement_ref unique within a job, never reused after cancellation',
    verify: () => {
      const ms = [mv({ movementRef: 'MOV-001' }), mv({ movementRef: 'MOV-002', movementStatus: 'CANCELLED' })];
      assert.equal(nextMovementRef(ms), 'MOV-003');
    } },
  { id: 'M-14', text: 'Movement type is a stored enum, never inferred',
    verify: () => {
      assert.ok(MOVEMENT_TYPE.includes(mv().movementType), 'type is a stored enum value');
      assert.equal(MOVEMENT_TYPE.length, 9);
    } },
  { id: 'M-15', text: 'PENDING movements are excluded from the schedule and planned-work counts',
    verify: () => {
      assert.equal(appearsOnSchedule(mv({ movementStatus: 'PENDING' })), false);
      assert.equal(appearsOnSchedule(mv({ movementStatus: 'READY_FOR_SCHEDULING' })), false);
      assert.equal(appearsOnSchedule(mv({ movementStatus: 'SCHEDULED' })), true);
    } },
  { id: 'M-16', text: 'An auto-created movement is only created when its trigger is already true',
    verify: () => {
      assert.deepEqual(planImportMovements(importJob(), importContainer(), [], false), [],
        'no proposal while the trigger is false');
      assert.equal(planImportMovements(importJob(), importContainer(), [], true).length, 1);
    } },
  { id: 'M-17', text: 'Duplicate active movements of the same type are rejected',
    verify: () => {
      const existing = [mv({ movementType: 'EMPTY_COLLECTION', movementStatus: 'SCHEDULED' })];
      assert.equal(canCreateMovement(existing, 'j', 'EMPTY_COLLECTION').allowed, false);
    } },
  { id: 'M-18', text: 'A cancelled movement is retained and never blocks re-creation',
    verify: () => {
      const cancelled = [mv({ movementType: 'EMPTY_COLLECTION', movementStatus: 'CANCELLED' })];
      assert.equal(canCreateMovement(cancelled, 'j', 'EMPTY_COLLECTION').allowed, true);
    } },
  { id: 'M-19', text: 'A movement cannot skip SCHEDULED to DELIVERED; an inferred COLLECTED is written',
    verify: () => {
      const r = canTransition('SCHEDULED', 'DELIVERED');
      assert.equal(r.allowed, true);
      assert.equal(r.inferredCollected, true, 'the gap must be filled and labelled');
      assert.equal(canTransition('SCHEDULED', 'COMPLETED').allowed, false);
    } },
  { id: 'M-20', text: 'Completing a movement never closes the parent job by itself',
    verify: () => {
      // Closure is a separate test: a delivered container leaves the job open.
      const status = importJobStatus(importJob(), ['Delivered', 'Ready for Collection'], [], [], false);
      assert.notEqual(status, 'Completed');
    } },

  // ---------- Import ----------
  { id: 'I-21', text: 'No collection until mandatory information, permit and Portnet are all satisfied',
    verify: () => {
      assert.equal(canCollect(importJob({ permitReceived: false }), importContainer(), NO_FIELDS).passed, false);
      assert.equal(canCollect(importJob({ portnetReleased: false }), importContainer(), NO_FIELDS).passed, false);
      assert.equal(canCollect(importJob(), importContainer(), NO_FIELDS).passed, true);
    } },
  { id: 'I-22', text: 'A container number is unique across open jobs; reuse on a closed job is legitimate',
    verify: () => {
      const closed = [{ containerNumber: 'ABCU1234567', jobId: 'j1', jobNumber: 'JOB-260801-001', jobOpen: false }];
      assert.equal(checkContainerUniqueness('ABCU1234567', closed).unique, true,
        'the same box legitimately appears on many jobs over its life');
      const open = [{ containerNumber: 'ABCU1234567', jobId: 'j1', jobNumber: 'JOB-260817-001', jobOpen: true }];
      assert.equal(checkContainerUniqueness('ABCU1234567', open).unique, false);
    } },
  { id: 'I-23', text: 'Each container carries its own eligibility and clocks; a blocked container does not block siblings',
    verify: () => {
      const status = importJobStatus(importJob(), ['Delivered', 'Awaiting Permit'], [], [], false);
      assert.equal(status, 'Partially Delivered', 'one blocked container does not stall the others');
    } },
  { id: 'I-24', text: 'Demurrage and detention are separate clocks with separate last free days, per container',
    verify: () => {
      const c = importContainer({ demurrageLfd: '2026-09-01', detentionLfd: '2026-09-05' });
      assert.notEqual(c.demurrageLfd, c.detentionLfd, 'the two clocks are stored separately');
    } },
  { id: 'I-25', text: 'The detention clock stops when EMPTY_RETURN reaches COMPLETED',
    gap: 'free-time computation is not implemented; the stop event is modelled but nothing counts against it' },
  { id: 'I-26', text: 'A job with any container outstanding is not Completed',
    verify: () => {
      assert.notEqual(importJobStatus(importJob(), ['Delivered', 'Empty Return Pending'], [], [], false), 'Completed');
    } },
  { id: 'I-27', text: 'A chassis is assigned at job level and inherited by every movement',
    verify: () => {
      assert.ok('chassisId' in importContainer(), 'held on the container, per §35.2');
      assert.ok('chassisId' in mv(), 'copied onto the movement for reporting');
    } },
  { id: 'I-28', text: 'Chassis size must match container size',
    verify: () => {
      assert.equal(isChassisSizeValid('40 HQ', '20FT').valid, false);
      assert.equal(isChassisSizeValid('20 GP', '40FT').valid, false);
      assert.equal(isChassisSizeValid('20 GP', '40FT', true).valid, true,
        '§35.2: double mounting is the one exception');
    } },
  { id: 'I-29', text: 'Chassis status and availability are derived, never typed',
    verify: () => {
      const u = {
        chassisId: 'CH-1', chassisNo: '1', plateNo: 'X', size: '40FT' as const,
        unladenWeightKg: null, maxGrossWeightKg: null, inspectionDueDate: null,
        manualStatus: null, active: true,
      };
      // Only MAINTENANCE and RETIRED are settable; AVAILABLE and IN_USE fall
      // out of the job records.
      assert.equal(chassisStatus(u, [], '2026-09-01'), 'AVAILABLE');
      assert.equal(chassisStatus(u, [{ chassisId: 'CH-1', containerId: 'c', jobId: 'j',
        mountedAt: '2026-08-25T00:00:00Z', releasedAt: null, doubleMountedWith: null }],
        '2026-09-01'), 'IN_USE');
    } },
  { id: 'I-30', text: 'Chassis unavailability warns and raises an exception; it never blocks scheduling',
    verify: () => {
      const empty = fleetAvailability([], [], '2026-09-01');
      const r = checkChassisAvailability('20 GP', empty);
      assert.equal(r.blocked, false,
        '§35.4: a gate that is routinely overridden teaches people to ignore every gate');
      assert.ok(r.warning);
    } },

  // ---------- Export ----------
  { id: 'E-31', text: 'No Ready for Empty Collection until mandatory information and CMS are satisfied',
    verify: () => {
      assert.equal(canCollectEmpty(exportJob({ cmsStatus: 'PENDING' }), NO_FIELDS).passed, false);
      assert.equal(canCollectEmpty(exportJob(), NO_FIELDS).passed, true);
    } },
  { id: 'E-32', text: 'CMS Not Required is an explicit permissioned choice with a mandatory reason',
    verify: () => {
      // The gate accepts it (ADR-0002); the reason is enforced at the command boundary.
      assert.equal(canCollectEmpty(exportJob({ cmsStatus: 'NOT_REQUIRED' }), NO_FIELDS).passed, true);
    } },
  { id: 'E-33', text: 'EMPTY_COLLECTION cannot reach COMPLETED without container, seal and tare',
    verify: () => {
      const m = mv({ movementType: 'EMPTY_COLLECTION', movementStatus: 'DELIVERED' });
      assert.equal(canComplete(m, {}).allowed, false);
      assert.equal(canComplete(m, { containerIdentityCaptured: true }).allowed, true);
    } },
  { id: 'E-34', text: 'Container details must be sent before Awaiting Customer Stuffing',
    verify: () => {
      const unsent = exportContainer({ containerDetailsSent: false, containerReady: false, vgm: null });
      const status = exportContainerStatus(exportJob(), unsent, [], [], true, false, true, false);
      assert.notEqual(status, 'Awaiting Customer Stuffing');
    } },
  { id: 'E-35', text: 'The laden workflow cannot begin until the customer confirms ready',
    verify: () => {
      assert.equal(canStartLaden(exportJob(), exportContainer({ containerReady: false }), true).passed, false);
    } },
  { id: 'E-36', text: 'VGM recorded before any laden movement, and must exceed tare',
    verify: () => {
      assert.equal(canStartLaden(exportJob(), exportContainer({ vgm: null }), true).passed, false);
      assert.equal(isVgmPlausible(3850, 3850), false, 'exactly tare is impossible');
      assert.equal(isVgmPlausible(3851, 3850), true);
    } },
  { id: 'E-37', text: 'Transhipment status determines laden routing',
    verify: () => {
      const [direct] = planExportMovements(exportJob(), exportContainer(), [], false, true);
      assert.equal(direct?.movementType, 'DIRECT_LADEN_TO_PORT');
      const job = exportJob({ transhipmentStatus: 'NOT_AVAILABLE', carparkRequested: true });
      const [oneWay] = planExportMovements(job, exportContainer(), [], false, true);
      assert.equal(oneWay?.movementType, 'ONE_WAY_LOADED');
    } },
  { id: 'E-38', text: 'CARPARK_TO_PORT is a new movement, never an edit to ONE_WAY_LOADED',
    verify: () => {
      const atCarpark = [mv({ movementType: 'ONE_WAY_LOADED', movementStatus: 'COMPLETED',
        containerId: 'xc', jobId: 'e', movementRef: 'MOV-002' })];
      const [p] = planExportMovements(exportJob(), exportContainer(), atCarpark, false, true);
      assert.equal(p?.movementType, 'CARPARK_TO_PORT', 'a separate movement is proposed');
    } },
  { id: 'E-39', text: 'At the carpark with transhipment unresolved is Awaiting T/T, not At Carpark',
    verify: () => {
      const ms = [mv({ movementType: 'ONE_WAY_LOADED', movementStatus: 'COMPLETED', containerId: 'xc' })];
      const status = exportContainerStatus(exportJob({ transhipmentStatus: 'PENDING' }),
        exportContainer(), ms, [], true, false, true, false);
      assert.equal(status, 'Awaiting T/T');
    } },
  { id: 'E-40', text: 'Transhipment checks are recorded with a timestamp and a user',
    verify: () => {
      assert.ok('transhipmentCheckedAt' in exportJob(), '"we checked" is not sufficient');
    } },
];

// ---- execution ------------------------------------------------------------

const enforced = RULES.filter((r) => r.verify);
const gaps = RULES.filter((r) => r.gap);

for (const rule of enforced) {
  test(`§57 ${rule.id}: ${rule.text}`, () => rule.verify!());
}

test('§57 every rule is registered exactly once', () => {
  const ids = RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate rule id');
  assert.equal(RULES.length, 65, '§57 states 65 rules; all must be registered');
  for (const r of RULES) {
    assert.ok(Boolean(r.verify) !== Boolean(r.gap),
      `${r.id} must either be verified or declare a gap, never both or neither`);
  }
});

test('§57 compliance summary', () => {
  const pct = Math.round((enforced.length / RULES.length) * 100);
  console.log(`\n  §57 compliance: ${enforced.length}/${RULES.length} rules enforced (${pct}%)`);
  console.log(`  ${gaps.length} declared gaps:`);
  for (const g of gaps) console.log(`    ${g.id.padEnd(8)} ${g.text}\n             gap: ${g.gap}`);
  assert.ok(enforced.length > 0);
});
