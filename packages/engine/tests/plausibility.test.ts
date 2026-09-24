import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveryDateWarning, cmsWarning } from '../src/plausibility.ts';

test('the same day is fine; earlier than the ship is not', () => {
  // A box discharged in the morning going out in the afternoon is an ordinary
  // day, so only a date before the arrival is worth saying anything about.
  assert.equal(deliveryDateWarning('2026-09-24', '2026-09-24'), null, 'same day');
  assert.equal(deliveryDateWarning('2026-09-24', '2026-09-26'), null, 'after');
  const warned = deliveryDateWarning('2026-09-24', '2026-09-22');
  assert.equal(warned?.field, 'Delivery date');
  assert.match(warned?.says ?? '', /before the vessel arrives/);
});

test('nothing to compare means nothing to say', () => {
  assert.equal(deliveryDateWarning(null, '2026-09-22'), null);
  assert.equal(deliveryDateWarning('2026-09-24', null), null);
});

test('CMS is chased against the empty, not the vessel', () => {
  // The empty is usually wanted weeks before the ship sails. A job measured
  // against the sailing looks comfortable right up to the morning the truck
  // cannot go.
  assert.equal(cmsWarning('PENDING', '2026-10-30', '2026-09-24'), null, 'weeks away');
  assert.match(cmsWarning('PENDING', '2026-09-26', '2026-09-24')?.says ?? '', /due in 2 days/);
  assert.match(cmsWarning('PENDING', '2026-09-24', '2026-09-24')?.says ?? '', /due today/);
  assert.match(cmsWarning('PENDING', '2026-09-22', '2026-09-24')?.says ?? '', /due 2 days ago/);
});

test('CMS that is done, or was never needed, is never chased', () => {
  assert.equal(cmsWarning('COMPLETED', '2026-09-24', '2026-09-24'), null);
  assert.equal(cmsWarning('NOT_REQUIRED', '2026-09-24', '2026-09-24'), null);
  assert.equal(cmsWarning('PENDING', null, '2026-09-24'), null, 'no collection date to count to');
});
