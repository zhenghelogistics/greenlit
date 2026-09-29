import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canCollectEmpty } from '../src/gates.ts';

// §41, operations 28 September 2026: completing CMS for one empty collection
// must never clear the blocker for another.

const job = (over = {}) => ({
  customer: 'ABC', cmsRequired: true, cmsStatus: 'PENDING', ...over,
} as never);
const NO_FIELDS = { fields: [] };

test('a collection with its own CMS is judged on that', () => {
  // One truck to Allied, booked. The job says pending because another
  // collection is not, and this one must not be held by it.
  const gate = canCollectEmpty(job(), NO_FIELDS, { cmsStatus: 'COMPLETED' });
  assert.equal(gate.passed, true);
});

test('completing one collection does not release another', () => {
  // The whole reason this moved off the job. A job collecting from two yards
  // had one field, so booking either made both look ready — and the yard
  // nobody had booked read as ready to dispatch.
  const allied = canCollectEmpty(job(), NO_FIELDS, { cmsStatus: 'COMPLETED' });
  const cwt = canCollectEmpty(job(), NO_FIELDS, { cmsStatus: 'PENDING' });
  assert.equal(allied.passed, true);
  assert.equal(cwt.passed, false);
  assert.match(cwt.failures.join(' '), /CMS/);
});

test('a collection with no status of its own follows the job', () => {
  // What every job with a single collection has always meant, so nothing
  // recorded before this changes.
  assert.equal(canCollectEmpty(job({ cmsStatus: 'COMPLETED' }), NO_FIELDS,
    { cmsStatus: null }).passed, true);
  assert.equal(canCollectEmpty(job({ cmsStatus: 'PENDING' }), NO_FIELDS,
    { cmsStatus: null }).passed, false);
  assert.equal(canCollectEmpty(job({ cmsStatus: 'COMPLETED' }), NO_FIELDS).passed, true,
    'and asking without naming a collection still works');
});

test('a job that needs no CMS is not held by either', () => {
  assert.equal(canCollectEmpty(job({ cmsRequired: false }), NO_FIELDS,
    { cmsStatus: 'PENDING' }).passed, true);
});
