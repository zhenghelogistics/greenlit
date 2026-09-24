import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  importHandoverShipmentGaps, exportHandoverShipmentGaps, containerHandoverGaps,
  canHandOver, isHandedOver, handoverSurvivesEdit, documentGaps, documentsComplete,
} from '../src/handover.ts';
import type { ImportJob, ExportJob } from '../src/types.ts';
import type { PermitRecord } from '../src/permits.ts';

const importJob = (o: Partial<ImportJob> = {}): ImportJob => ({
  customer: 'DKSH Singapore',
  deliveryAddress: '12 Jurong Port Road',
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

test('a controller needs the customer and the address, and that is all', () => {
  assert.deepEqual(importHandoverShipmentGaps(importJob()), []);
  assert.deepEqual(importHandoverShipmentGaps(importJob({ customer: '' })), ['Customer']);
  assert.deepEqual(importHandoverShipmentGaps(importJob({ deliveryAddress: null })), ['Delivery address']);
});

test('what the controller does NOT need before the job becomes theirs', () => {
  // The whole point of the short list. Each of these is real work and none of
  // it blocks: it lands while the container is already on the board. Holding
  // the handover for any of them means the controller cannot see next week
  // until operations have finished this week.
  const bare = importJob({
    vesselName: null, eta: null, blNumber: null, carrier: null,
    portnetReleased: false,
  } as Partial<ImportJob>);
  assert.deepEqual(importHandoverShipmentGaps(bare), [],
    'no vessel, no ETA, no bill of lading, no Portnet — and still handed over');
});

test('Portnet is a gate on planning and no gate at all on handover', () => {
  // The one most often got wrong, and the one that matters most: a container
  // waiting on Portnet is exactly the container a controller wants to see,
  // because seeing it is how the chasing starts.
  const waiting = importJob({ portnetReleased: false } as Partial<ImportJob>);
  assert.equal(canHandOver(waiting, container, []).passed, true);
});

test('a permit is required only when the job says one is', () => {
  assert.deepEqual(containerHandoverGaps({ permitRequired: false }, container, []), []);
  assert.deepEqual(containerHandoverGaps({ permitRequired: true }, container, []), ['Permit'],
    'required and none on file');
});

test('a permit counts only when it is allocated to THIS container', () => {
  const job = { permitRequired: true };
  assert.deepEqual(
    containerHandoverGaps(job, container, [permit({ linkedContainerIds: ['ic2'] })]),
    ['Permit'],
    'somebody else’s permit does not clear this box at the gate');
  assert.deepEqual(containerHandoverGaps(job, container, [permit()]), []);
});

test('a permit with no number is a permit nobody can present', () => {
  assert.deepEqual(
    containerHandoverGaps({ permitRequired: true }, container, [permit({ permitNumber: null })]),
    ['Permit'],
    'an allocated record with no number is not a permit yet');
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
  } as Partial<ImportJob>);
  const container = {
    containerId: 'ic1', containerNumber: 'SEGU3218850', containerSize: '40',
    emptyReturnYard: 'Jurong Depot', freeTimeModel: 'COMBINED', combinedFreeDays: 14,
  } as never;

  assert.deepEqual(documentGaps(job, [container], []), [], 'nothing outstanding');
  assert.equal(documentsComplete(job, [container], []), true);

  // Handover needs two fields; readiness needs all of them.
  const bare = importJob();
  assert.deepEqual(importHandoverShipmentGaps(bare), [], 'the controller could start');
  assert.ok(documentGaps(bare, [container], []).length > 0, 'operations have not finished');
});

test('an unconfirmed free-time model is itself the gap', () => {
  // Not "no free days" but "nobody has read the carrier's terms yet", which is
  // a different thing to chase and a different person to ask.
  const job = importJob({ vesselName: 'X', eta: '2026-09-23', blNumber: 'B' } as Partial<ImportJob>);
  const unread = { containerId: 'ic1', containerNumber: 'A', containerSize: '20',
    emptyReturnYard: 'Yard', freeTimeModel: 'NOT_CONFIRMED' } as never;
  const gaps = documentGaps(job, [unread], []);
  assert.ok(gaps.some((g) => g.field === 'Free time terms'));
});

test('a job with no containers is not ready, whatever else is filled in', () => {
  const job = importJob({ vesselName: 'X', eta: '2026-09-23', blNumber: 'B' } as Partial<ImportJob>);
  assert.deepEqual(documentGaps(job, [], []), [{ area: 'Container', field: 'At least one container' }]);
});

test('confirming the documents is a different claim from the list being empty', () => {
  // "No field is empty" is arithmetic and the system can work it out. "I have
  // checked this against the paperwork" is a judgement and it cannot. The
  // controller plans free time against the second, so both have to be true
  // before the mark means anything — which is why the command refuses while
  // anything is outstanding.
  const job = importJob({
    vesselName: 'X', eta: '2026-09-24', blNumber: 'B',
  } as Partial<ImportJob>);
  const container = { containerId: 'ic1', containerNumber: 'A', containerSize: '20',
    emptyReturnYard: 'Yard', freeTimeModel: 'COMBINED', combinedFreeDays: 14 } as never;

  assert.equal(documentsComplete(job, [container], []), true, 'the arithmetic passes');
  // The judgement is a stored instant, and nothing here sets it: a rule cannot
  // confirm on somebody's behalf.
  assert.equal(job.documentsCompletedAt ?? null, null);
});
