import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeOpportunities, sameLocation, describeOpportunity } from '../src/routing.ts';
import type { Movement } from '../src/types.ts';

const mv = (o: Partial<Movement> = {}): Movement => ({
  movementId: 'm1', movementRef: 'MOV-1', jobId: 'j1',
  jobDomain: 'IMPORT', jobNumber: 'IMP-260916-001',
  containerId: 'c1', containerNumber: null, secondaryContainerId: null,
  isDoubleMounted: false, movementType: 'IMPORT_DELIVERY', cargoState: 'LADEN',
  originType: 'PORT', origin: 'PSA', destinationType: 'CUSTOMER', destination: 'Tuas Ave 13',
  plannedDate: null, plannedTime: null, truck: 'XA1234B', driver: 'Tan',
  chassisId: null, movementStatus: 'SCHEDULED',
  actualCollectionAt: null, actualDeliveryAt: null,
  standbyRequired: false, standbyStartedAt: null, standbyEndedAt: null,
  autoCreated: false, cancelledReason: null,
  ...o,
});

test('§17: a truck finishing where another job starts is an opportunity', () => {
  // The empty leg this exists to remove: a truck standing at Tuas with
  // nothing to do, and a job at Tuas with no truck.
  const [found] = routeOpportunities([
    mv({ movementId: 'a', movementRef: 'MOV-1', destination: 'Tuas Ave 13' }),
    mv({ movementId: 'b', movementRef: 'MOV-2', jobId: 'j2', containerId: 'c2',
         origin: 'Tuas Ave 13', destination: 'Jurong Depot',
         movementStatus: 'READY_FOR_SCHEDULING', truck: null, driver: null }),
  ]);

  assert.equal(found?.finishing.movementRef, 'MOV-1');
  assert.equal(found?.waiting.movementRef, 'MOV-2');
  assert.match(describeOpportunity(found!), /XA1234B ends at Tuas Ave 13, where MOV-2 starts/);
});

test('punctuation and case are the same gate', () => {
  assert.equal(sameLocation('Tuas Ave 13', 'TUAS AVE 13,'), true);
  assert.equal(sameLocation('tuas ave. 13', 'Tuas Ave 13'), true);
});

test('a near miss is not a match', () => {
  // Ave 13 and Ave 14 are a different company. A chain offered on a near match
  // sends a truck to the wrong gate, which is worse than offering nothing.
  assert.equal(sameLocation('Tuas Ave 13', 'Tuas Ave 14'), false);
});

test('an empty location matches nothing, including another empty one', () => {
  assert.equal(sameLocation('', ''), false);
  assert.equal(sameLocation(null, null), false);
  assert.deepEqual(routeOpportunities([
    mv({ movementId: 'a', destination: '' }),
    mv({ movementId: 'b', containerId: 'c2', origin: '', movementStatus: 'PENDING' }),
  ]), []);
});

test('a container is never chained onto its own next leg', () => {
  // The second leg of one container's journey is a sequence the engine
  // already knows about, and a box cannot be in two places.
  assert.deepEqual(routeOpportunities([
    mv({ movementId: 'a', movementRef: 'MOV-1', containerId: 'c1', destination: 'Tuas Ave 13' }),
    mv({ movementId: 'b', movementRef: 'MOV-2', containerId: 'c1',
         origin: 'Tuas Ave 13', movementStatus: 'PENDING' }),
  ]), []);
});

test('a movement already collected is not offered as waiting work', () => {
  // Its truck has left. Offering to chain onto it is offering a slot that was
  // taken before the controller opened the screen.
  assert.deepEqual(routeOpportunities([
    mv({ movementId: 'a', destination: 'Tuas Ave 13' }),
    mv({ movementId: 'b', containerId: 'c2', origin: 'Tuas Ave 13',
         movementStatus: 'COMPLETED' }),
  ]), []);
});

test('an unscheduled movement is not yet a truck finishing anywhere', () => {
  assert.deepEqual(routeOpportunities([
    mv({ movementId: 'a', destination: 'Tuas Ave 13', movementStatus: 'PENDING' }),
    mv({ movementId: 'b', containerId: 'c2', origin: 'Tuas Ave 13',
         movementStatus: 'READY_FOR_SCHEDULING' }),
  ]), []);
});

test('one truck finishing near several waiting jobs offers each of them', () => {
  const found = routeOpportunities([
    mv({ movementId: 'a', movementRef: 'MOV-1', destination: 'Tuas Ave 13' }),
    mv({ movementId: 'b', movementRef: 'MOV-2', containerId: 'c2',
         origin: 'TUAS AVE 13', movementStatus: 'PENDING' }),
    mv({ movementId: 'c', movementRef: 'MOV-3', containerId: 'c3',
         origin: 'Tuas Ave 13', movementStatus: 'READY_FOR_SCHEDULING' }),
  ]);
  assert.deepEqual(found.map((f) => f.waiting.movementRef), ['MOV-2', 'MOV-3']);
});
