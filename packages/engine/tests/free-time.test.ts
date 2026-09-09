import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeTimeClocks, carrierLastFreeDay, contradictoryFreeTime, freeTimeCountdown, mostUrgentClock } from '../src/free-time.ts';

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

const split = (over: Partial<Parameters<typeof freeTimeCountdown>[0]> = {}) => ({
  freeTimeModel: 'SPLIT' as const,
  demurrageFreeDays: 3, demurrageLfd: '2026-09-14',
  detentionFreeDays: 4, detentionLfd: '2026-09-21',
  combinedFreeDays: null, combinedLfd: null,
  ...over,
});

test('§34.4: days remaining is counted from the container’s own last free day', () => {
  const [demurrage, detention] = freeTimeCountdown(split(), '2026-09-10', 3);
  assert.equal(demurrage?.daysRemaining, 4);
  assert.equal(detention?.daysRemaining, 11);
  assert.equal(demurrage?.summary, '4 days left');
});

test('the last free day itself is not yet overdue', () => {
  // Off by one here is a day of charges either invented or missed.
  const [demurrage] = freeTimeCountdown(split(), '2026-09-14', 3);
  assert.equal(demurrage?.daysRemaining, 0);
  assert.equal(demurrage?.standing, 'LAST_DAY');
  assert.equal(demurrage?.chargeableDays, 0, 'nothing is chargeable on the last free day');
  assert.equal(demurrage?.summary, 'Last free day is today');
});

test('past the last free day, charges are counted', () => {
  const [demurrage] = freeTimeCountdown(split(), '2026-09-17', 3);
  assert.equal(demurrage?.standing, 'OVERDUE');
  assert.equal(demurrage?.chargeableDays, 3);
  assert.match(demurrage?.summary ?? '', /3 days over — charges running/);
});

test('a clock inside the warning window is due soon, not merely fine', () => {
  const [demurrage] = freeTimeCountdown(split(), '2026-09-12', 3);
  assert.equal(demurrage?.standing, 'DUE_SOON');
  const [comfortable] = freeTimeCountdown(split(), '2026-09-01', 3);
  assert.equal(comfortable?.standing, 'OK');
});

test('§34.3: a combined carrier gets one countdown, never two', () => {
  const counts = freeTimeCountdown({
    freeTimeModel: 'COMBINED',
    demurrageFreeDays: 3, demurrageLfd: '2026-09-14',
    detentionFreeDays: 4, detentionLfd: '2026-09-21',
    combinedFreeDays: 14, combinedLfd: '2026-09-28',
  }, '2026-09-10', 3);
  assert.equal(counts.length, 1);
  assert.equal(counts[0]?.label, 'Combined D&D');
  assert.equal(counts[0]?.daysRemaining, 18, 'the combined date, not the stale demurrage one');
});

test('an unconfirmed model produces no countdown at all', () => {
  assert.deepEqual(freeTimeCountdown({ ...split(), freeTimeModel: 'NOT_CONFIRMED' }, '2026-09-10', 3), []);
});

test('a missing last free day says so rather than counting from nothing', () => {
  const [demurrage] = freeTimeCountdown(split({ demurrageLfd: null }), '2026-09-10', 3);
  assert.equal(demurrage?.daysRemaining, null);
  assert.equal(demurrage?.standing, 'UNKNOWN');
  assert.match(demurrage?.summary ?? '', /no last free day recorded/);
});

test('the most urgent clock is the one nearest its deadline', () => {
  const counts = freeTimeCountdown(split(), '2026-09-10', 3);
  assert.equal(mostUrgentClock(counts)?.label, 'Demurrage');
});

test('an overdue clock outranks one merely approaching', () => {
  // Detention is closer in absolute days, but demurrage is already costing money.
  const counts = freeTimeCountdown(
    split({ demurrageLfd: '2026-09-08', detentionLfd: '2026-09-11' }), '2026-09-10', 3);
  assert.equal(mostUrgentClock(counts)?.label, 'Demurrage');
  assert.equal(mostUrgentClock(counts)?.standing, 'OVERDUE');
});

test('I-25: returning the empty stops the detention clock', () => {
  // Returned on the 18th, three days inside its free time. However long the
  // job stays open afterwards, it never becomes overdue.
  const [, detention] = freeTimeCountdown(split(), '2026-10-30', 3, '2026-09-18');
  assert.equal(detention?.standing, 'SETTLED');
  assert.equal(detention?.chargeableDays, 0);
  assert.equal(detention?.summary, 'Returned within free time');
});

test('I-25: a late return settles at what it cost, not at today', () => {
  // Back on the 24th, three days past its last free day. Six weeks later it is
  // still three chargeable days, not forty.
  const [, detention] = freeTimeCountdown(split(), '2026-10-30', 3, '2026-09-24');
  assert.equal(detention?.standing, 'OVERDUE');
  assert.equal(detention?.chargeableDays, 3);
  assert.match(detention?.summary ?? '', /Returned 3 days late — 3 chargeable/);
});

test('I-25: demurrage is not stopped by the empty return', () => {
  // Demurrage ends at gate-out, long before the empty goes back. Stopping it
  // on empty return would forgive charges already incurred at the port.
  const [demurrage] = freeTimeCountdown(split(), '2026-09-20', 3, '2026-09-18');
  assert.equal(demurrage?.standing, 'OVERDUE');
  assert.equal(demurrage?.chargeableDays, 6);
});

test('I-25: a combined allowance also closes on empty return', () => {
  const [combined] = freeTimeCountdown({
    freeTimeModel: 'COMBINED', combinedFreeDays: 14, combinedLfd: '2026-09-28',
    demurrageFreeDays: null, demurrageLfd: null, detentionFreeDays: null, detentionLfd: null,
  }, '2026-10-30', 3, '2026-09-25');
  assert.equal(combined?.standing, 'SETTLED');
  assert.equal(combined?.chargeableDays, 0);
});

test('a container still out counts to today as before', () => {
  // Three days left against a three-day warning window is DUE_SOON, not OK:
  // the window is inclusive, which is the point of having one.
  const [, detention] = freeTimeCountdown(split(), '2026-09-18', 3, null);
  assert.equal(detention?.standing, 'DUE_SOON');
  assert.equal(detention?.summary, '3 days left');

  const [, comfortable] = freeTimeCountdown(split(), '2026-09-10', 3, null);
  assert.equal(comfortable?.standing, 'OK');
});
