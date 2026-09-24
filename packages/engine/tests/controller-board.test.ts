import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  controllerStage, pendingReasons, canPlanCollection,
} from '../src/controller-board.ts';

const facts = (o = {}) => ({
  portnetReleased: false, dischargedAt: null, deliveredAt: null, emptyReadyAt: null, ...o,
});

test('ready means released AND discharged, not either', () => {
  // The two facts that have to be true before a truck can fetch the box, and
  // the reason neither belongs on a status dropdown: nobody decides them.
  assert.equal(controllerStage(facts()), 'PENDING');
  assert.equal(controllerStage(facts({ portnetReleased: true })), 'PENDING', 'released, still on the ship');
  assert.equal(controllerStage(facts({ dischargedAt: '2026-09-24T02:00:00Z' })), 'PENDING', 'landed, not cleared');
  assert.equal(
    controllerStage(facts({ portnetReleased: true, dischargedAt: '2026-09-24T02:00:00Z' })),
    'READY');
});

test('the later facts win, so a delivered box does not fall back to ready', () => {
  // Read latest-first: a container that is empty was necessarily delivered,
  // and one that was delivered was necessarily released and discharged.
  const landed = { portnetReleased: true, dischargedAt: '2026-09-24T02:00:00Z' };
  assert.equal(controllerStage(facts({ ...landed, deliveredAt: '2026-09-25T09:00:00Z' })), 'DELIVERED');
  assert.equal(controllerStage(facts({
    ...landed, deliveredAt: '2026-09-25T09:00:00Z', emptyReadyAt: '2026-09-27T09:00:00Z',
  })), 'EMPTY');
});

test('a pending container says which of the two it is waiting for', () => {
  // "Awaiting Portnet" alone sends a controller chasing the wrong one.
  assert.deepEqual(pendingReasons(facts()), ['Portnet', 'Discharge'], 'both outstanding');
  assert.deepEqual(pendingReasons(facts({ portnetReleased: true })), ['Discharge']);
  assert.deepEqual(pendingReasons(facts({ dischargedAt: '2026-09-24T02:00:00Z' })), ['Portnet']);
  assert.deepEqual(
    pendingReasons(facts({ portnetReleased: true, dischargedAt: '2026-09-24T02:00:00Z' })),
    [], 'not pending, so nothing to chase');
});

test('the plan button and the board agree, because one of them computes it', () => {
  const ready = facts({ portnetReleased: true, dischargedAt: '2026-09-24T02:00:00Z' });
  assert.equal(canPlanCollection(ready), true);
  assert.equal(canPlanCollection(facts({ portnetReleased: true })), false);
  // Delivered is past collecting: the trip already happened.
  assert.equal(canPlanCollection(facts({ ...ready, deliveredAt: '2026-09-25T09:00:00Z' })), false);
});

test('a blank timestamp is not an event', () => {
  assert.equal(controllerStage(facts({ portnetReleased: true, dischargedAt: '   ' })), 'PENDING');
});
