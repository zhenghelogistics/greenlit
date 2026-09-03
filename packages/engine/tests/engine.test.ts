import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canCollect, canCollectEmpty, canStartLaden, isVgmPlausible, missingMandatoryFields } from '../src/gates.ts';
import { currentLocation, isLocationUnknown } from '../src/location.ts';
import { exportContainerStatus, exportJobStatus, importJobStatus } from '../src/status.ts';
import type { ExportContainer, ExportJob, ImportContainer, ImportJob, Movement } from '../src/types.ts';

const movement = (over: Partial<Movement>): Movement => ({
  movementId: 'm', movementRef: 'MOV-001', jobId: 'j', jobDomain: 'EXPORT',
  jobNumber: 'EXP-1', containerId: 'c', containerNumber: null,
  secondaryContainerId: null, isDoubleMounted: false,
  movementType: 'EMPTY_COLLECTION', cargoState: 'EMPTY',
  originType: 'YARD', origin: 'Yard', destinationType: 'CUSTOMER', destination: 'Cust',
  plannedDate: null, plannedTime: null, truck: null, driver: null, chassisId: null,
  movementStatus: 'PENDING', actualCollectionAt: null, actualDeliveryAt: null,
  standbyRequired: false, standbyStartedAt: null, standbyEndedAt: null,
  autoCreated: false, cancelledReason: null, ...over,
});

const importJob = (over: Partial<ImportJob> = {}): ImportJob => ({
  jobId: 'j', jobNumber: 'JOB-1', customer: 'ABC', blNumber: 'BL1',
  vesselName: 'V', voyageNumber: '1E', eta: '2026-09-01', jobType: 'standard',
  deliveryAddress: '12 Tuas', permitRequired: true, permitReceived: true,
  permitRejected: false, portnetRequired: true, portnetReleased: true,
  assignedController: 'sarah', cancelled: false, onHold: false,
  createdAt: '2026-09-01T00:00:00Z', ...over,
});

const exportJob = (over: Partial<ExportJob> = {}): ExportJob => ({
  exportJobId: 'e', jobNumber: 'EXP-1', customer: 'ABC', shipper: 'XYZ',
  bookingReference: 'BK1', exportClearanceReference: 'OP-1', carrier: 'ONE',
  vesselName: 'V', voyageNumber: '1E', etaSingapore: '2026-09-01',
  vesselClosingAt: null, emptyCollectionYard: 'Yard', cmsRequired: true,
  cmsStatus: 'COMPLETED', containerQuantity: 1, containerSizeType: '40 HQ',
  truckInDate: '2026-08-18', truckOutDate: '2026-08-20',
  standbyRequired: false, standbyInstructionSource: null, standbyExpectedMinutes: null,
  transhipmentStatus: 'AVAILABLE', transhipmentCheckedAt: null, carparkRequested: false,
  assignedController: 'winnie', cancelled: false, onHold: false,
  createdAt: '2026-09-01T00:00:00Z', ...over,
});

const exportContainer = (over: Partial<ExportContainer> = {}): ExportContainer => ({
  exportContainerId: 'c', exportJobId: 'e', containerRef: 'C1',
  containerNumber: 'ABCU1234567', sealNumber: '123456', tareWeightKg: 3850,
  sizeType: '40 HQ', isReefer: false, temperatureMode: null, temperatureSetpointC: null,
  stuffingLocation: 'A', containerDetailsSent: true, containerDetailsSentAt: null,
  containerReady: true, containerReadyAt: null, vgm: 24500, vgmReceivedAt: null,
  portnetProcessed: 'PROCESSED', chassisId: null,
  chassisMountedAt: null, chassisReleasedAt: null, carparkArrivedAt: null,
  cancelled: false, onHold: false, ...over,
});

const importContainer = (): ImportContainer => ({
  containerId: 'c', containerNumber: 'ABCU1234567', jobId: 'j',
  containerSize: '40', containerType: 'HQ', sealNumber: null, grossWeight: 20000,
  cargoDescription: 'Goods', portTerminal: 'PSA', emptyReturnYard: 'Yard',
  freeTimeModel: 'SPLIT', freeTimeCountsFrom: 'VESSEL_ETA',
  demurrageFreeDays: 7, demurrageLfd: null, detentionFreeDays: 7, detentionLfd: null,
  combinedFreeDays: null, combinedLfd: null, internalLfd: null,
  carparkReason: null, carparkArrivedAt: null, emptyReadyConfirmed: false,
  emptyReadyConfirmedAt: null, emptyReadySource: null,
  chassisId: null, chassisMountedAt: null, chassisReleasedAt: null,
  cancelled: false, onHold: false,
});

const NO_FIELDS = { fields: [] as const };

test('§31: collection blocked until permit and Portnet both satisfied', () => {
  assert.equal(canCollect(importJob(), importContainer(), NO_FIELDS).passed, true);

  const noPermit = canCollect(importJob({ permitReceived: false }), importContainer(), NO_FIELDS);
  assert.equal(noPermit.passed, false);
  assert.deepEqual(noPermit.failures, ['Permit has not been received']);

  const noPortnet = canCollect(importJob({ portnetReleased: false }), importContainer(), NO_FIELDS);
  assert.equal(noPortnet.passed, false);
  assert.deepEqual(noPortnet.failures, ['Portnet release not confirmed']);
});

test('§31: a not-required gate does not block', () => {
  const job = importJob({ permitRequired: false, permitReceived: false });
  assert.equal(canCollect(job, importContainer(), NO_FIELDS).passed, true);
});

test('§41: CMS pending blocks empty collection, and names itself', () => {
  const blocked = canCollectEmpty(exportJob({ cmsStatus: 'PENDING' }), NO_FIELDS);
  assert.equal(blocked.passed, false);
  assert.ok(blocked.failures.includes('CMS'));
});

test('§40.2: CMS Not Required satisfies the gate', () => {
  assert.equal(canCollectEmpty(exportJob({ cmsStatus: 'NOT_REQUIRED' }), NO_FIELDS).passed, true);
});

test('§44.2: laden gate needs identity, ready, VGM, stuffing and transhipment', () => {
  assert.equal(canStartLaden(exportJob(), exportContainer(), true).passed, true);

  assert.equal(canStartLaden(exportJob({ transhipmentStatus: 'PENDING' }), exportContainer(), true).passed, false);
  assert.equal(canStartLaden(exportJob(), exportContainer({ vgm: null }), true).passed, false);
  assert.equal(canStartLaden(exportJob(), exportContainer({ containerReady: false }), true).passed, false);
  assert.equal(canStartLaden(exportJob(), exportContainer({ containerNumber: null }), true).passed, false);
});

test('§43.1: part-laden container cannot pass the laden gate', () => {
  const r = canStartLaden(exportJob(), exportContainer(), false);
  assert.equal(r.passed, false);
  assert.ok(r.failures.some((f) => /Stuffing not complete/.test(f)));
});

test('§44.2.1: Portnet failure warns but does not block the laden gate', () => {
  const failed = exportContainer({ portnetProcessed: 'FAILED' });
  assert.equal(canStartLaden(exportJob(), failed, true).passed, true);
});

test('§43: VGM at or below tare is implausible', () => {
  assert.equal(isVgmPlausible(3851, 3850), true);
  assert.equal(isVgmPlausible(3850, 3850), false, 'exactly tare is impossible');
  assert.equal(isVgmPlausible(3000, 3850), false);
});

test('§30: mandatory fields report what is missing, not just a count', () => {
  const missing = missingMandatoryFields(
    { customer: 'ABC', deliveryAddress: null, grossWeight: '' },
    { fields: ['customer', 'deliveryAddress', 'grossWeight'] },
  );
  assert.deepEqual(missing, ['deliveryAddress', 'grossWeight']);
});

test('§24: location derives from the most progressed movement', () => {
  assert.equal(currentLocation([], 'IMPORT'), 'Terminal / Port of discharge');
  assert.equal(currentLocation([], 'EXPORT'), 'Empty Collection Yard');

  assert.equal(
    currentLocation([movement({ movementType: 'IMPORT_DELIVERY', movementStatus: 'IN_TRANSIT' })], 'IMPORT'),
    'In Transit to Customer');

  assert.equal(
    currentLocation([movement({ movementType: 'ONE_WAY_LOADED', movementStatus: 'COMPLETED' })], 'EXPORT'),
    'Company Carpark');

  assert.equal(
    currentLocation([movement({ movementType: 'EMPTY_RETURN', movementStatus: 'COMPLETED' })], 'IMPORT'),
    'Empty Returned');
});

test('§24: location recomputes when a movement is edited backwards', () => {
  const forward = [
    movement({ movementRef: 'MOV-001', movementType: 'ONE_WAY_LOADED', movementStatus: 'COMPLETED' }),
    movement({ movementRef: 'MOV-002', movementType: 'CARPARK_TO_PORT', movementStatus: 'DELIVERED' }),
  ];
  assert.equal(currentLocation(forward, 'EXPORT'), 'Port');

  const rewound = [forward[0]!, { ...forward[1]!, movementStatus: 'PENDING' as const }];
  assert.equal(currentLocation(rewound, 'EXPORT'), 'Company Carpark');
});

test('§24: cancelled movements do not describe location', () => {
  const ms = [
    movement({ movementType: 'ONE_WAY_LOADED', movementStatus: 'COMPLETED' }),
    movement({ movementRef: 'MOV-002', movementType: 'CARPARK_TO_PORT', movementStatus: 'CANCELLED' }),
  ];
  assert.equal(currentLocation(ms, 'EXPORT'), 'Company Carpark');
});

test('§45.2 rule 13: at carpark with transhipment PENDING is Awaiting T/T, not At Carpark', () => {
  const ms = [movement({ movementType: 'ONE_WAY_LOADED', movementStatus: 'COMPLETED' })];
  const pending = exportContainerStatus(
    exportJob({ transhipmentStatus: 'PENDING' }), exportContainer(), ms, [], true, false, true, false);
  assert.equal(pending, 'Awaiting T/T');

  const available = exportContainerStatus(
    exportJob({ transhipmentStatus: 'AVAILABLE' }), exportContainer(), ms, [], true, true, true, false);
  assert.equal(available, 'Ready for Port Delivery');
});

test('§45.4: multi-container export aggregates to partial states', () => {
  const job = exportJob({ containerQuantity: 3 });
  assert.equal(
    exportJobStatus(job, ['Delivered to Port', 'At Carpark', 'Awaiting VGM'], [], false),
    'Partially Delivered');
  assert.equal(
    exportJobStatus(job, ['Delivered to Port', 'Delivered to Port'], [], false),
    'Delivered to Port');
});

test('§45.4: single-container job behaves exactly as before', () => {
  assert.equal(exportJobStatus(exportJob(), ['Awaiting VGM'], [], false), 'Awaiting VGM');
});

test('§33: a job with any container outstanding is not Completed', () => {
  const status = importJobStatus(importJob(), ['Delivered', 'Ready for Collection'], [], [], false);
  assert.equal(status, 'Partially Delivered');
  assert.notEqual(status, 'Completed');
});

test('§27.3: an open blocking exception outranks progression', () => {
  const exc = [{
    exceptionId: 'x', jobId: 'j', jobDomain: 'IMPORT' as const, containerId: null,
    movementId: null, exceptionType: 'LFD passed', severity: 'CRITICAL' as const,
    blocking: true, waitingOn: 'US' as const,
    detectedAt: '2026-09-01T00:00:00Z', resolvedAt: null,
  }];
  assert.equal(importJobStatus(importJob(), ['Delivered'], [], exc, false), 'Exception');
});

test('§24: unknown location is detectable for the Critical exception', () => {
  assert.equal(isLocationUnknown('Unknown / Exception'), true);
  assert.equal(isLocationUnknown('Port'), false);
});
