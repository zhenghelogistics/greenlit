import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closureBlockers, reopenReasonProblem } from '../src/closure.ts';

const container = (containerId: string) => ({ containerId }) as never;
const movement = (containerId: string, movementType: string, movementStatus: string) =>
  ({ containerId, movementType, movementStatus }) as never;

test('§33: a job with everything finished may be closed', () => {
  const blockers = closureBlockers(
    [container('c1'), container('c2')],
    [
      movement('c1', 'EMPTY_RETURN', 'COMPLETED'),
      movement('c2', 'EMPTY_RETURN', 'COMPLETED'),
    ],
    0,
  );
  assert.deepEqual(blockers, []);
});

test('§33: a container still out is a container the carrier is charging for', () => {
  // Closing over it stops the countdown, which is the only thing that would
  // have made anyone notice.
  const blockers = closureBlockers(
    [container('c1'), container('c2')],
    [movement('c1', 'EMPTY_RETURN', 'COMPLETED')],
    0,
  );
  assert.equal(blockers.length, 1);
  assert.match(blockers[0] ?? '', /1 of 2 containers are not back/);
});

test('§33: none returned reads as none, not as a count', () => {
  const blockers = closureBlockers([container('c1')], [], 0);
  assert.match(blockers[0] ?? '', /No container has been returned/);
});

test('§33: a running trip and an open exception both hold it', () => {
  const blockers = closureBlockers(
    [container('c1')],
    [
      movement('c1', 'EMPTY_RETURN', 'COMPLETED'),
      movement('c1', 'IMPORT_DELIVERY', 'IN_TRANSIT'),
    ],
    2,
  );
  // Everything outstanding at once: someone about to close a job wants the
  // whole list, not to discover it one refusal at a time.
  assert.equal(blockers.length, 2);
  assert.match(blockers.join(' '), /1 trip is still running/);
  assert.match(blockers.join(' '), /2 open exceptions/);
});

test('§33: a cancelled trip does not hold the job open', () => {
  const blockers = closureBlockers(
    [container('c1')],
    [
      movement('c1', 'EMPTY_RETURN', 'COMPLETED'),
      movement('c1', 'IMPORT_DELIVERY', 'CANCELLED'),
    ],
    0,
  );
  assert.deepEqual(blockers, []);
});

test('§33: a job with no containers has not finished, it never started', () => {
  const blockers = closureBlockers([], [], 0);
  assert.match(blockers.join(' '), /no containers/);
});

test('§33.2: reopening needs a reason worth reading', () => {
  // Closing is what makes a job billable, so reopening changes what has
  // already been invoiced. This is the only record of why the invoice moved.
  assert.match(reopenReasonProblem('') ?? '', /needs a reason/);
  assert.match(reopenReasonProblem('   ') ?? '', /needs a reason/);
  assert.match(reopenReasonProblem('fix') ?? '', /Say what changed/);
  assert.match(reopenReasonProblem('Correction') ?? '', /Say what changed/);
  assert.equal(reopenReasonProblem('Detention was billed at 4 days, carrier says 6'), null);
});
