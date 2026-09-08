import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeTimeClocks, carrierLastFreeDay, contradictoryFreeTime } from '../src/free-time.ts';

const base = {
  demurrageFreeDays: 5, demurrageLfd: '2026-09-14',
  detentionFreeDays: 7, detentionLfd: '2026-09-21',
  combinedFreeDays: 14, combinedLfd: '2026-09-28',
};

test('§34.3: a combined carrier shows one countdown, never two', () => {
  // "Splitting a single allowance in two invents a deadline that does not
  // exist and hides the one that does."
  const clocks = freeTimeClocks({ ...base, freeTimeModel: 'COMBINED' });
  assert.equal(clocks.length, 1);
  assert.equal(clocks[0]?.label, 'Combined D&D');
  assert.equal(clocks[0]?.lastFreeDay, '2026-09-28');
});

test('a split carrier shows both clocks, even with a combined value stored', () => {
  const clocks = freeTimeClocks({ ...base, freeTimeModel: 'SPLIT' });
  assert.deepEqual(clocks.map((c) => c.label), ['Demurrage', 'Detention']);
  assert.equal(clocks[1]?.lastFreeDay, '2026-09-21');
});

test('an unconfirmed model shows no countdown at all', () => {
  // A job exists before its arrival notice is read. A countdown from a rule
  // nobody has verified is worse than saying it is unverified.
  assert.deepEqual(freeTimeClocks({ ...base, freeTimeModel: 'NOT_CONFIRMED' }), []);
  assert.equal(carrierLastFreeDay({ ...base, freeTimeModel: 'NOT_CONFIRMED' }), null);
});

test('the chargeable deadline follows the model, not a fallback chain', () => {
  // The regression this guards: `demurrageLfd ?? combinedLfd` returned the
  // demurrage date for a combined carrier, two weeks before the real one.
  assert.equal(carrierLastFreeDay({ ...base, freeTimeModel: 'COMBINED' }), '2026-09-28');
  assert.equal(carrierLastFreeDay({ ...base, freeTimeModel: 'SPLIT' }), '2026-09-14');
});

test('detention is not a substitute for demurrage', () => {
  // Different clocks against different events. A missing demurrage date is
  // missing, not silently replaced by the later one.
  const noDemurrage = { ...base, freeTimeModel: 'SPLIT' as const, demurrageLfd: null };
  assert.equal(carrierLastFreeDay(noDemurrage), null);
});

test('values the model says do not apply are reported, not hidden', () => {
  assert.deepEqual(contradictoryFreeTime({ ...base, freeTimeModel: 'SPLIT' }),
    ['Carrier issues split allowances, but a combined figure is also stored']);
  assert.equal(contradictoryFreeTime({ ...base, freeTimeModel: 'COMBINED' }).length, 1);
});

test('a container carrying only its own model’s values is not flagged', () => {
  assert.deepEqual(contradictoryFreeTime({
    freeTimeModel: 'COMBINED', combinedFreeDays: 14, combinedLfd: '2026-09-28',
    demurrageFreeDays: null, demurrageLfd: null, detentionFreeDays: null, detentionLfd: null,
  }), []);
});
