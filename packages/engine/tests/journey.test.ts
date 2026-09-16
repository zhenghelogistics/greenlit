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
