import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importJourney, currentStep, type JourneyCtx } from '../src/journey.ts';

const ctx = (o: Partial<JourneyCtx> = {}): JourneyCtx => ({
  mandatoryComplete: true, missingFields: [],
  permitRequired: false, permitReceived: false,
  portnetRequired: true, portnetReleased: true,
  collectionEligible: true, scheduled: false,
  collected: false, delivered: false, emptyReturned: false, jobClosed: false,
  ...o,
});

test('§31: exactly one step is ever current', () => {
  // Incomplete information and a missing permit both qualify. Three "you are
  // here" markers is the same as none.
  const steps = importJourney(ctx({
    mandatoryComplete: false, missingFields: ['deliveryAddress'],
    permitRequired: true, permitReceived: false,
    portnetReleased: false, collectionEligible: false,
  }));
  assert.equal(steps.filter((s) => s.state === 'CURRENT').length, 1);
  assert.equal(currentStep(steps)?.id, 'info');
});

test('§31: what somebody else is holding is waiting, not blocked', () => {
  // A chase runs in parallel with the work; being blocked does not. Reading
  // them as the same thing turns a phone call into a full stop.
  const steps = importJourney(ctx({ portnetReleased: false, collectionEligible: false }));
  assert.equal(steps.find((s) => s.id === 'portnet')?.state, 'WAITING');
  assert.equal(steps.find((s) => s.id === 'collect')?.state, 'BLOCKED');
});

test('§24: a job that needs no permit says so rather than showing a gap', () => {
  const steps = importJourney(ctx({ permitRequired: false }));
  assert.equal(steps.find((s) => s.id === 'permit')?.state, 'SKIPPED');
  assert.equal(steps.find((s) => s.id === 'permit')?.action, null);
});

test('the journey walks forward as the box does', () => {
  const at = (o: Partial<JourneyCtx>) => currentStep(importJourney(ctx(o)))?.id;
  assert.equal(at({}), 'collect');
  assert.equal(at({ collected: true }), 'deliver');
  assert.equal(at({ collected: true, delivered: true }), 'empty');
  assert.equal(at({ collected: true, delivered: true, emptyReturned: true }), 'close');
});

test('a finished job has nothing current left', () => {
  const steps = importJourney(ctx({
    collected: true, delivered: true, emptyReturned: true, jobClosed: true,
  }));
  assert.equal(currentStep(steps), null);
  assert.ok(steps.every((s) => ['DONE', 'SKIPPED'].includes(s.state)));
});

test('every step that can be acted on names a command', () => {
  // A step that says what is wrong and offers no way to fix it is the screen
  // this replaces.
  const steps = importJourney(ctx({
    mandatoryComplete: false, missingFields: ['deliveryAddress'],
  }));
  const current = currentStep(steps);
  assert.equal(current?.action, 'job.edit');
});

import { exportJourney, type ExportJourneyCtx } from '../src/journey.ts';

const ex = (o: Partial<ExportJourneyCtx> = {}): ExportJourneyCtx => ({
  mandatoryComplete: true, missingFields: [],
  cmsRequired: true, cmsCompleted: true,
  emptyGatePassed: true, emptyScheduled: false, emptyCollected: false,
  emptyDelivered: false, containerNumberCaptured: false, detailsSent: false,
  containerReady: false, vgmReceived: false,
  transhipmentStatus: 'AVAILABLE', carparkRequested: false, atCarpark: false,
  ladenGatePassed: false, hasLadenMovement: false, deliveredToPort: false,
  jobClosed: false,
  ...o,
});

test('§45: the export journey is not the import one backwards', () => {
  // An import is taken apart; an export is assembled. The long wait sits in
  // the middle rather than at the start, and three steps are the customer's.
  const ids = exportJourney(ex()).map((s) => s.id);
  assert.deepEqual(ids, [
    'info', 'cms', 'empty-out', 'empty-in', 'identity',
    'notify', 'stuffing', 'vgm', 'tt', 'port', 'close',
  ]);
});

test('§42: telling the customer is a step, because it is the one that gets missed', () => {
  // The empty is delivered, nobody says which box it is, and a week passes
  // with each side believing it is waiting for the other.
  const steps = exportJourney(ex({
    emptyCollected: true, emptyDelivered: true, containerNumberCaptured: true,
  }));
  const notify = steps.find((s) => s.id === 'notify');
  assert.equal(notify?.state, 'CURRENT');
  assert.equal(notify?.action, 'container.notify');
  assert.match(notify?.detail ?? '', /cannot begin stuffing/);
});

test('§39: there is nothing to send before the box has a number', () => {
  const steps = exportJourney(ex({ emptyCollected: true, emptyDelivered: true }));
  assert.equal(steps.find((s) => s.id === 'identity')?.state, 'CURRENT');
  assert.equal(steps.find((s) => s.id === 'notify')?.state, 'UPCOMING');
});

test('§43: stuffing and VGM are the customer\'s, so they wait rather than block', () => {
  const steps = exportJourney(ex({
    emptyCollected: true, emptyDelivered: true,
    containerNumberCaptured: true, detailsSent: true,
  }));
  assert.equal(steps.find((s) => s.id === 'stuffing')?.state, 'WAITING');
});

test('§44.1: an unanswered transhipment is a chase, not a stop', () => {
  const steps = exportJourney(ex({ transhipmentStatus: 'PENDING' }));
  assert.equal(steps.find((s) => s.id === 'tt')?.state, 'WAITING');
  assert.equal(steps.find((s) => s.id === 'tt')?.action, 'transhipment.record');
});

test('§21: the carpark step appears only when the carpark was asked for', () => {
  assert.ok(!exportJourney(ex()).some((s) => s.id === 'carpark'));
  assert.ok(exportJourney(ex({ carparkRequested: true })).some((s) => s.id === 'carpark'));
});

test('§45: one step current on an export job too', () => {
  const steps = exportJourney(ex({ cmsCompleted: false, emptyGatePassed: false }));
  assert.equal(steps.filter((s) => s.state === 'CURRENT').length, 1);
});
