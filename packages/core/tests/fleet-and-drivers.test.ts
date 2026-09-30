import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chassisStatus } from '@greenlit/engine';
import { createMemoryRepository } from '../src/memory.ts';

test('a driver is added once, and taken out of use rather than deleted', async () => {
  const repo = createMemoryRepository();
  const added = await repo.saveDriver({ name: 'ong kl', vehicle: 'xg1' }, 'controller');
  assert.equal(added.name, 'ONG KL');
  assert.equal(added.vehicle, 'XG1');
  await assert.rejects(() => repo.saveDriver({ name: 'ONG KL' }, 'controller'), /already on file/);
  const out = await repo.saveDriver({ driverId: added.driverId, name: 'ONG KL', active: false }, 'controller');
  assert.equal(out.active, false);
  assert.equal(out.vehicle, 'XG1', 'the vehicle is kept');
  assert.ok((await repo.listDrivers()).some((d) => d.driverId === added.driverId));
});

test('a chassis named on a trip still to do reads as planned, and maintenance outranks it', () => {
  const unit = { chassisId: 'c1', chassisNo: 'CH-2038', active: true, manualStatus: null, inspectionDueDate: null } as never;
  assert.equal(chassisStatus(unit, [], '2026-10-01'), 'AVAILABLE');
  assert.equal(chassisStatus(unit, [], '2026-10-01', new Set(['CH-2038'])), 'PLANNED');
  const down = { ...(unit as object), manualStatus: 'MAINTENANCE' } as never;
  assert.equal(chassisStatus(down, [], '2026-10-01', new Set(['CH-2038'])), 'MAINTENANCE');
});
