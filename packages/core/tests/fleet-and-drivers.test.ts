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

test('a driver with no trips can be deleted; one on a trip cannot', async () => {
  const repo = createMemoryRepository();
  const spare = await repo.saveDriver({ name: 'NEW GUY' }, 'controller');
  await repo.deleteDriver(spare.driverId, 'controller');
  assert.ok(!(await repo.listDrivers()).some((d) => d.driverId === spare.driverId));

  const busy = await repo.saveDriver({ name: 'BUSY ONE' }, 'controller');
  const job = await repo.createImportJob({
    customerCode: 'ABC', deliveryAddress: '1 Tuas Avenue 1', permitRequired: false,
    containers: [{ containerNumber: 'OOLU1234567', sizeType: '20 GP' }],
  } as never, 'operations');
  const [box] = await repo.listContainersForImportJob(job.jobId);
  await repo.recordPortnetReleased(job.jobId, 'operations');
  await repo.recordDischarged(box!.containerId, 'controller');
  await repo.createMovement({ jobId: job.jobId, containerId: box!.containerId, movementType: 'IMPORT_DELIVERY',
    origin: 'PSA', originType: 'TERMINAL', destination: 'X', destinationType: 'CUSTOMER',
    driver: 'BUSY ONE', truck: 'T1', chassisId: 'CH-1' }, 'controller');
  await assert.rejects(() => repo.deleteDriver(busy.driverId, 'controller'), /Take them out of use/);
});
