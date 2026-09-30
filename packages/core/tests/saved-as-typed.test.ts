import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepository } from '../src/memory.ts';

/**
 * What the forms ask is what the store keeps. Each of these was typed on a
 * form and dropped on save until the demo comparison of 29 September 2026.
 */

test('an import job keeps the empty return depot typed at creation', async () => {
  const repo = createMemoryRepository();
  const job = await repo.createImportJob({
    customerCode: 'ABC', deliveryAddress: '1 Tuas Avenue 1',
    containers: [{ containerNumber: 'OOLU1234567', sizeType: '20 GP', emptyReturnYard: 'ALLIED 1' }],
  } as never, 'operations');
  const [box] = await repo.listContainersForImportJob(job.jobId);
  assert.equal(box!.emptyReturnYard, 'ALLIED 1');
});

test('an export job keeps stuffing, CMS, classes, collection date and reefer settings', async () => {
  const repo = createMemoryRepository();
  const job = await repo.createExportJob({
    customerCode: 'ABC', vesselName: 'V', bookingReference: 'BK7',
    etaSingapore: '2026-10-20', emptyCollectionDate: '2026-10-05', emptyCollectionTime: '09:00',
    cmsStatus: 'COMPLETED', class2S: true, class2C: false,
    stuffingCompany: 'ABC WAREHOUSE', stuffingAddress: '9 Gul Circle',
    slots: [{ quantity: 1, sizeType: '40RF', reeferMode: 'PRE_COOL', reeferTemperature: '-18', triAxle: true }],
  } as never, 'operations');
  const saved = await repo.getExportJob(job.exportJobId);
  assert.equal(saved!.etaSingapore, '2026-10-20', 'the vessel ETA, not the collection date');
  assert.equal(saved!.emptyCollectionDate, '2026-10-05');
  assert.equal(saved!.cmsStatus, 'COMPLETED');
  assert.equal(saved!.class2S, true);
  const [box] = await repo.listContainersForExportJob(job.exportJobId);
  assert.equal(box!.stuffingLocation, '9 Gul Circle');
  assert.equal(box!.stuffingCompany, 'ABC WAREHOUSE');
  assert.equal(box!.isReefer, true);
  assert.equal(box!.temperatureMode, 'PRE_COOL');
  assert.equal(box!.temperatureSetpointC, -18);
  assert.equal(box!.triAxle, true);
});

test('a container added to a job starts with nothing done to it', async () => {
  const repo = createMemoryRepository();
  const job = await repo.createImportJob({
    customerCode: 'ABC', deliveryAddress: '1 Tuas Avenue 1',
    containers: [{ containerNumber: 'OOLU1234567', sizeType: '20 GP' }],
  } as never, 'operations');
  const added = await repo.addContainerToJob(job.jobId, { containerNumber: 'TCLU7654321', sizeType: '40 HQ' }, 'operations');
  assert.equal(added.portnetReleasedAt, null, 'not already released');
  assert.equal(added.handedOverAt, null);
});

test('renaming a customer keeps its jobs with it', async () => {
  const repo = createMemoryRepository();
  const job = await repo.createImportJob({
    customerCode: 'ABC', deliveryAddress: '1 Tuas Avenue 1',
    containers: [{ containerNumber: 'OOLU1234567', sizeType: '20 GP' }],
  } as never, 'operations');
  await repo.amendCustomer('ABC', { companyName: 'ABC Holdings' }, 'operations');
  assert.equal((await repo.getImportJob(job.jobId))!.customer, 'ABC Holdings');
});
