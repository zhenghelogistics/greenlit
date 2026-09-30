import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  importHandoverShipmentGaps, exportHandoverShipmentGaps, containerHandoverGaps,
  canHandOver, canHandOverExport, isHandedOver, handoverSurvivesEdit, documentGaps, documentsComplete,
} from '../src/handover.ts';
import type { ImportJob, ExportJob } from '../src/types.ts';
import type { PermitRecord } from '../src/permits.ts';

const importJob = (o: Partial<ImportJob> = {}): ImportJob => ({
  customer: 'DKSH Singapore',
  deliveryAddress: '12 Jurong Port Road',
  vesselName: 'DALLAS EXPRESS',
  voyageNumber: '632S',
  permitRequired: false,
  ...o,
} as ImportJob);

const container = { containerId: 'ic1' };

const permit = (o: Partial<PermitRecord> = {}): PermitRecord => ({
  permitId: 'p1',
  permitNumber: 'IG6I789494H',
  expiryDate: '2026-10-30',
  permitVesselVoyage: 'DALLAS EXPRESS 632S',
  fileName: 'permit.pdf',
  linkedContainerIds: ['ic1'],
  ...o,
});

test('a controller needs the customer and where the box goes, and that is all', () => {
  // The PM's demo is the specification: vessel, ETA, carrier and MBL are not
  // handover gateways. The address is asked of the container, because a job
  // may deliver each box somewhere different and then has none of its own.
  assert.deepEqual(importHandoverShipmentGaps(importJob()), []);
  assert.deepEqual(importHandoverShipmentGaps(importJob({ customer: '' })), ['Customer']);
  assert.deepEqual(importHandoverShipmentGaps(importJob({ vesselName: null, voyageNumber: null })), [],
    'no vessel or voyage, and still handed over');
  assert.deepEqual(
    containerHandoverGaps(importJob({ deliveryAddress: null }), container, []), ['Delivery address']);
  assert.deepEqual(
    containerHandoverGaps(importJob({ deliveryAddress: null }),
      { ...container, deliveryAddress: '9 Gul Circle' }, []), [],
    'a box with its own address needs no job address');
});

test('what the controller does NOT need before the job becomes theirs', () => {
  // The whole point of the short list. Each of these is real work and none of
  // it blocks: it lands while the container is already on the board. Holding
  // the handover for any of them means the controller cannot see next week
  // until operations have finished this week.
  const bare = importJob({
    eta: null, blNumber: null, carrier: null,
    portnetReleased: false,
  } as Partial<ImportJob>);
  assert.deepEqual(importHandoverShipmentGaps(bare), [],
    'no ETA, no bill of lading, no Portnet — and still handed over');
});

test('Portnet is a gate on planning and no gate at all on handover', () => {
  // The one most often got wrong, and the one that matters most: a container
  // waiting on Portnet is exactly the container a controller wants to see,
  // because seeing it is how the chasing starts.
  const waiting = importJob({ portnetReleased: false } as Partial<ImportJob>);
  assert.equal(canHandOver(waiting, container, []).passed, true);
});

test('a permit is required only when the job says one is', () => {
  assert.deepEqual(containerHandoverGaps(importJob(), container, []), []);
  assert.deepEqual(containerHandoverGaps(importJob({ permitRequired: true }), container, []), ['Permit'],
    'required and none on file');
});

test('a permit counts only when it is allocated to THIS container', () => {
  const job = importJob({ permitRequired: true });
  assert.deepEqual(
    containerHandoverGaps(job, container, [permit({ linkedContainerIds: ['ic2'] })]),
    ['Permit'],
    'somebody else’s permit does not clear this box at the gate');
  assert.deepEqual(containerHandoverGaps(job, container, [permit()]), []);
});

test('a permit counts only when it has a number', () => {
  // The demo: "a permit counts only when this container actually stores a
  // permit reference with a number". An upload with no number yet does not.
  const job = importJob({ permitRequired: true });
  assert.deepEqual(
    containerHandoverGaps(job, container, [permit({ permitNumber: null })]), ['Permit'],
    'uploaded and mapped, but no number yet');
  assert.deepEqual(containerHandoverGaps(job, container, [permit()]), []);
});

test('the shipment’s gaps are read before the container’s', () => {
  const result = canHandOver(
    importJob({ customer: '', permitRequired: true }), container, []);
  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, ['Customer', 'Permit'],
    'what is wrong with the shipment, then what is wrong with the box');
});

test('an export job needs more, because nothing exists yet', () => {
  // On import the box is coming whatever we do. On export the controller is
  // being asked to send a truck for an empty, and without the booking, the
  // yard and the vessel there is no trip to plan.
  const complete = {
    customer: 'Ansell', vesselName: 'DALLAS EXPRESS',
    bookingReference: '34416855', emptyCollectionYard: 'Jurong Depot',
  } as ExportJob;
  assert.deepEqual(exportHandoverShipmentGaps(complete), []);
  assert.deepEqual(
    exportHandoverShipmentGaps({ ...complete, bookingReference: null }),
    ['Booking reference']);
  assert.deepEqual(
    exportHandoverShipmentGaps({ ...complete, emptyCollectionYard: '' } as ExportJob),
    ['Empty collection yard']);
});

test('handed over is a thing that happened, not a thing worked out', () => {
  assert.equal(isHandedOver({ handedOverAt: null }), false);
  assert.equal(isHandedOver({ handedOverAt: '   ' }), false, 'blank is not an instant');
  assert.equal(isHandedOver({ handedOverAt: '2026-09-23T09:00:00Z' }), true);
});

test('an edit afterwards does not take the container back', () => {
  // The alternative was tried and is worse: a row vanishes from the
  // controller's board because operations corrected a typo, mid-plan, with no
  // explanation. A person hands over and a person unmakes it.
  assert.equal(handoverSurvivesEdit(), false);
});

test('document readiness is the longer list, and a different question', () => {
  // The pair only makes sense together: this asks whether operations have
  // finished, the handover asks the least a controller needs to start. A job
  // passes the second and fails the first all week.
  const job = importJob({
    vesselName: 'DALLAS EXPRESS', eta: '2026-09-23', blNumber: 'HLCU123',
    carrier: 'HL', deliveryCompany: 'DKSH',
  } as Partial<ImportJob>);
  const container = {
    containerId: 'ic1', containerNumber: 'SEGU3218850', containerSize: '40',
    emptyReturnYard: 'Jurong Depot', freeTimeModel: 'COMBINED', combinedFreeDays: 14,
  } as never;

  assert.deepEqual(documentGaps(job, [container], []), [], 'nothing outstanding');
  assert.equal(documentsComplete(job, [container], []), true);

  // Handover needs a few fields; readiness needs all of them.
  const bare = importJob({ eta: null, blNumber: null } as Partial<ImportJob>);
  assert.deepEqual(importHandoverShipmentGaps(bare), [], 'the controller could start');
  assert.ok(documentGaps(bare, [container], []).length > 0, 'operations have not finished');
});

test('a box with no last free day is itself the gap', () => {
  // The demo asks for an LFD per box: one set by hand, or one that can be
  // counted from the ETA and the carrier's allowance.
  const job = importJob({ vesselName: 'X', eta: '2026-09-23', blNumber: 'B', carrier: 'HL',
    deliveryCompany: 'DKSH' } as Partial<ImportJob>);
  const unread = { containerId: 'ic1', containerNumber: 'A', containerSize: '20',
    emptyReturnYard: 'Yard', freeTimeModel: 'NOT_CONFIRMED' } as never;
  assert.ok(documentGaps(job, [unread], []).some((g) => g.field === 'LFD'));
  const setByHand = { ...(unread as object), combinedLfd: '2026-10-02' } as never;
  assert.ok(!documentGaps(job, [setByHand], []).some((g) => g.field === 'LFD'));
});

test('a job with no containers is not ready, whatever else is filled in', () => {
  const job = importJob({ vesselName: 'X', eta: '2026-09-23', blNumber: 'B', carrier: 'HL',
    deliveryCompany: 'DKSH' } as Partial<ImportJob>);
  assert.deepEqual(documentGaps(job, [], []), [{ area: 'Container', field: 'At least one container' }]);
});

test('confirming the documents is a different claim from the list being empty', () => {
  // "No field is empty" is arithmetic and the system can work it out. "I have
  // checked this against the paperwork" is a judgement and it cannot. The
  // controller plans free time against the second, so both have to be true
  // before the mark means anything — which is why the command refuses while
  // anything is outstanding.
  const job = importJob({
    vesselName: 'X', eta: '2026-09-24', blNumber: 'B', carrier: 'HL', deliveryCompany: 'DKSH',
  } as Partial<ImportJob>);
  const container = { containerId: 'ic1', containerNumber: 'A', containerSize: '20',
    emptyReturnYard: 'Yard', freeTimeModel: 'COMBINED', combinedFreeDays: 14 } as never;

  assert.equal(documentsComplete(job, [container], []), true, 'the arithmetic passes');
  // The judgement is a stored instant, and nothing here sets it: a rule cannot
  // confirm on somebody's behalf.
  assert.equal(job.documentsCompletedAt ?? null, null);
});

// ---- exports, 28 September 2026 ------------------------------------------

const exportBox = (over = {}) => ({
  containerRef: 'C1', sizeType: '20GP', grossWeightKg: 18000,
  stuffingLocation: '1 Tuas Avenue 1', ...over,
});

test('an export hands over once the controller can plan it', () => {
  const gate = canHandOverExport(
    { customer: 'DKSH', deliveryAddress: '1 Tuas Ave 1' }, [exportBox()]);
  assert.equal(gate.passed, true);
});

test('CMS does not hold an export back', () => {
  // It often cannot be done until the day of collection. Blocking handover on
  // it would keep the job off the board for exactly the period the controller
  // needs to plan around it. It blocks the collection instead.
  const source = readFileSync(new URL('../src/handover.ts', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('export function canHandOverExport'));
  assert.doesNotMatch(fn.replace(/\/\*[\s\S]*?\*\//g, ''), /\bcms/i);
});

test('a box with no weight cannot be matched to a chassis, and says which box', () => {
  // "2 containers are incomplete" sends somebody looking. "C2: weight" is a
  // thing they can go and fix.
  const gate = canHandOverExport({ customer: 'DKSH', deliveryAddress: '1 Tuas Ave 1' }, [
    exportBox(), exportBox({ containerRef: 'C2', grossWeightKg: null }),
  ]);
  assert.equal(gate.passed, false);
  assert.deepEqual(gate.failures, ['C2: weight']);
});

test('an export with no containers has nothing to hand over', () => {
  const gate = canHandOverExport({ customer: 'DKSH' }, []);
  assert.equal(gate.passed, false);
  assert.match(gate.failures.join(' '), /At least one container/);
});

test('the customer and the stuffing address are named, not counted', () => {
  // An export's address is per container, because a customer may stuff at more
  // than one site. The job itself has no delivery address — the first version
  // of this gate read one and refused every export.
  const gate = canHandOverExport({ customer: null }, [
    exportBox({ stuffingLocation: null }),
  ]);
  assert.deepEqual(gate.failures, ['Customer', 'C1: stuffing address']);
});

test('a permit for another sailing asks for the permit to be updated', () => {
  const job = importJob({ vesselName: 'X', voyageNumber: '2W', eta: '2026-09-23', blNumber: 'B', carrier: 'HL',
    deliveryCompany: 'DKSH', permitRequired: true } as Partial<ImportJob>);
  const box = { containerId: 'ic1', containerNumber: 'A', containerSize: '20', emptyReturnYard: 'Yard',
    freeTimeModel: 'COMBINED', combinedFreeDays: 14 } as never;
  const stale = permit({ permitVesselVoyage: 'X 1W', expiryDate: '2026-10-30' });
  assert.ok(documentGaps(job, [box], [stale]).some((g) => g.field === 'Update Permit'));
  const current = permit({ permitVesselVoyage: 'X 2W', expiryDate: '2026-10-30' });
  assert.ok(!documentGaps(job, [box], [current]).some((g) => g.field === 'Update Permit'));
});
