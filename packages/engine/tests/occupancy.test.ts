import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  standbyMinutes, vehicleOccupancy, doubleBookings,
  standbyOutranksOtherCustomerWaits,
} from '../src/occupancy.ts';
import type { Movement } from '../src/types.ts';

const mv = (o: Partial<Movement> = {}): Movement => ({
  movementId: 'm1', movementRef: 'MOV-1', jobId: 'j1',
  jobDomain: 'IMPORT', jobNumber: 'IMP-260916-001', containerId: 'c1',
  containerNumber: null,
  secondaryContainerId: null, isDoubleMounted: false,
  movementType: 'EMPTY_COLLECTION', cargoState: 'EMPTY',
  originType: 'YARD', origin: 'Yard', destinationType: 'CUSTOMER', destination: 'Site',
  plannedDate: null, plannedTime: null, truck: 'XA1234B', driver: 'Tan',
  chassisId: null, movementStatus: 'IN_TRANSIT',
  actualCollectionAt: '2026-09-16T01:00:00Z', actualDeliveryAt: null,
  standbyRequired: false, standbyStartedAt: null, standbyEndedAt: null,
  autoCreated: false, cancelledReason: null,
  ...o,
});

test('§21.3.1: a standby still running already has a duration', () => {
  // Reporting zero until somebody remembers to close it is how the cost stays
  // invisible, which is the thing §21.3.4 says must not happen.
  const running = mv({
    movementStatus: 'ON_STANDBY', standbyRequired: true,
    standbyStartedAt: '2026-09-16T01:00:00Z', standbyEndedAt: null,
  });
  assert.equal(standbyMinutes(running, '2026-09-16T04:30:00Z'), 210);
});

test('§21.3.1: standby that never started is null, not zero minutes', () => {
  assert.equal(standbyMinutes(mv(), '2026-09-16T04:00:00Z'), null);
});

test('§21.3.1: a released standby counts to the release, not to now', () => {
  const done = mv({
    movementStatus: 'ON_STANDBY', standbyRequired: true,
    standbyStartedAt: '2026-09-16T01:00:00Z', standbyEndedAt: '2026-09-16T03:00:00Z',
  });
  assert.equal(standbyMinutes(done, '2026-09-17T09:00:00Z'), 120);
});

test('§21.3.2: a truck on standby is occupied, exactly as one in transit', () => {
  // "Otherwise the vehicle appears free and is double-booked."
  const [engagement] = vehicleOccupancy([mv({
    movementStatus: 'ON_STANDBY', standbyRequired: true,
    standbyStartedAt: '2026-09-16T01:00:00Z',
  })], '2026-09-16T03:00:00Z');

  assert.equal(engagement?.reason, 'ON_STANDBY');
  assert.equal(engagement?.truck, 'XA1234B');
  assert.equal(engagement?.minutes, 120);
  assert.equal(engagement?.openEnded, true, 'nobody can say when this truck comes free');
});

test('§21.3.2: an unreleased engagement is open-ended, never a guessed end', () => {
  const [engagement] = vehicleOccupancy([mv({
    movementStatus: 'ON_STANDBY', standbyRequired: true,
    standbyStartedAt: '2026-09-16T01:00:00Z',
  })], '2026-09-16T03:00:00Z');
  assert.equal(engagement?.until, null,
    '§21.3.2: the schedule shows that as open-ended rather than guessing a figure');
});

test('standby beginning on arrival survives a missing standby stamp', () => {
  // Standby begins when the truck arrives. Dropping the engagement because
  // one stamp is missing would show the vehicle as free, which is the exact
  // failure this module exists to prevent.
  const [engagement] = vehicleOccupancy([mv({
    movementStatus: 'ON_STANDBY', standbyRequired: true,
    standbyStartedAt: null, actualDeliveryAt: '2026-09-16T02:00:00Z',
  })], '2026-09-16T03:00:00Z');
  assert.equal(engagement?.minutes, 60);
});

test('a movement with no truck assigned engages nobody', () => {
  // Work nobody has been given yet. Blocking a vehicle that was never chosen
  // would take capacity out of the schedule for a trip that has no driver.
  assert.deepEqual(vehicleOccupancy([mv({ truck: null })], '2026-09-16T03:00:00Z'), []);
});

test('§21.3.2: a truck held on standby cannot also be sent on the next job', () => {
  const clashes = doubleBookings(vehicleOccupancy([
    mv({ movementRef: 'MOV-1', movementStatus: 'ON_STANDBY', standbyRequired: true,
         standbyStartedAt: '2026-09-16T01:00:00Z' }),
    mv({ movementRef: 'MOV-2', movementId: 'm2', jobId: 'j2',
         actualCollectionAt: '2026-09-16T02:00:00Z' }),
  ], '2026-09-16T04:00:00Z'));

  assert.equal(clashes.length, 1);
  assert.equal(clashes[0]?.truck, 'XA1234B');
  assert.match(clashes[0]?.reason ?? '', /still on standby on MOV-1 with no release/);
});

test('a released truck is free for the next job', () => {
  const clashes = doubleBookings(vehicleOccupancy([
    mv({ movementRef: 'MOV-1', movementStatus: 'ON_STANDBY', standbyRequired: true,
         standbyStartedAt: '2026-09-16T01:00:00Z', standbyEndedAt: '2026-09-16T02:00:00Z' }),
    mv({ movementRef: 'MOV-2', movementId: 'm2', jobId: 'j2',
         actualCollectionAt: '2026-09-16T03:00:00Z' }),
  ], '2026-09-16T04:00:00Z'));
  assert.deepEqual(clashes, []);
});

test('two different trucks never clash with one another', () => {
  const clashes = doubleBookings(vehicleOccupancy([
    mv({ movementRef: 'MOV-1', truck: 'XA1111A' }),
    mv({ movementRef: 'MOV-2', movementId: 'm2', truck: 'XB2222B' }),
  ], '2026-09-16T04:00:00Z'));
  assert.deepEqual(clashes, []);
});

test('§21.3.3: a running standby outranks ordinary customer waits', () => {
  // "Our own vehicle is burning while we wait."
  const running = vehicleOccupancy([mv({
    movementStatus: 'ON_STANDBY', standbyRequired: true,
    standbyStartedAt: '2026-09-16T01:00:00Z',
  })], '2026-09-16T03:00:00Z');
  assert.equal(standbyOutranksOtherCustomerWaits(running), true);

  const released = vehicleOccupancy([mv({
    movementStatus: 'ON_STANDBY', standbyRequired: true,
    standbyStartedAt: '2026-09-16T01:00:00Z', standbyEndedAt: '2026-09-16T02:00:00Z',
  })], '2026-09-16T03:00:00Z');
  assert.equal(standbyOutranksOtherCustomerWaits(released), false);
});

test('§56: no stored standby duration exists to be typed', () => {
  assert.ok(!('standbyMinutes' in mv()),
    'a standby duration a controller can type is one that will be reconstructed from memory');
});
