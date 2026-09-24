import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refuseEvent, movementGaps, wouldOverwrite } from '../src/controller-board.ts';

const facts = (o = {}) => ({
  portnetReleased: true, dischargedAt: null, deliveredAt: null, emptyReadyAt: null, ...o,
});

test('a container cannot be delivered before it left the ship', () => {
  // The one place refusing is right rather than warning. A box that reached
  // the customer without being discharged did not teleport — somebody clicked
  // the wrong row, and the date would then be on the job with nothing able to
  // contradict it.
  assert.match(refuseEvent('DELIVER', facts()) ?? '', /not been discharged/);
  assert.equal(refuseEvent('DELIVER', facts({
    dischargedAt: '2026-09-24T02:00:00Z', hasPlannedCollection: true,
  })), null);
});

test('a container cannot be delivered with no trip planned', () => {
  assert.match(
    refuseEvent('DELIVER', facts({ dischargedAt: '2026-09-24T02:00:00Z', hasPlannedCollection: false })) ?? '',
    /No collection has been planned/);
});

test('a container cannot be empty before it was delivered', () => {
  assert.match(refuseEvent('EMPTY', facts({ dischargedAt: '2026-09-24T02:00:00Z' })) ?? '', /not been delivered/);
  assert.equal(refuseEvent('EMPTY', facts({
    dischargedAt: '2026-09-24T02:00:00Z', deliveredAt: '2026-09-25T09:00:00Z',
  })), null);
});

test('discharge answers to nothing: it is the first fact', () => {
  assert.equal(refuseEvent('DISCHARGE', facts()), null);
});

test('a plan names which of the three is missing', () => {
  // "Incomplete" sends somebody back to the form to work out which.
  assert.deepEqual(movementGaps({}), ['Driver', 'Vehicle', 'Chassis']);
  assert.deepEqual(movementGaps({ driver: 'Tan BM', vehicle: 'XD1234A' }), ['Chassis']);
  assert.deepEqual(movementGaps({ driver: ' ', vehicle: 'X', chassis: 'C' }), ['Driver'],
    'whitespace is not a driver');
  assert.deepEqual(movementGaps({ driver: 'A', vehicle: 'B', chassis: 'C' }), []);
});

test('a bulk change names what it would overwrite, and ignores what it matches', () => {
  const containers = [
    { no: 'A', emptyReturnYard: 'DEPOT A' },
    { no: 'B', emptyReturnYard: '' },
    { no: 'C', emptyReturnYard: 'DEPOT B' },
    { no: 'D', emptyReturnYard: 'DEPOT A' },
  ];
  const names = wouldOverwrite(containers, ['emptyReturnYard'], { emptyReturnYard: 'DEPOT A' }, (c) => c.no);
  assert.deepEqual(names, ['C'],
    'only the one that disagrees: blank is not an overwrite, and the same value is not a change');
});

test('nothing set anywhere means nothing to ask about', () => {
  const blank = [{ no: 'A', emptyReturnYard: null }, { no: 'B', emptyReturnYard: '  ' }];
  assert.deepEqual(wouldOverwrite(blank, ['emptyReturnYard'], { emptyReturnYard: 'X' }, (c) => c.no), []);
});
