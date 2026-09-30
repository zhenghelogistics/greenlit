import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepository } from '../src/memory.ts';

/** The demo's Plan: a trip is planned with its crew, and delivery completes it. */

const readyBox = async () => {
  const repo = createMemoryRepository();
  const job = await repo.createImportJob({
    customerCode: 'ABC', deliveryAddress: '1 Tuas Avenue 1', permitRequired: false,
    containers: [{ containerNumber: 'OOLU1234567', sizeType: '20 GP', emptyReturnYard: 'ALLIED 1' }],
  } as never, 'operations');
  const [box] = await repo.listContainersForImportJob(job.jobId);
  await repo.recordPortnetReleased(job.jobId, 'operations');
  await repo.recordDischarged(box!.containerId, 'controller');
  return { repo, job, box: box! };
};

test('a trip planned with driver, vehicle and chassis keeps them and is scheduled', async () => {
  const { repo, job, box } = await readyBox();
  const trip = await repo.createMovement({
    jobId: job.jobId, containerId: box.containerId, movementType: 'IMPORT_DELIVERY',
    origin: 'PSA', originType: 'TERMINAL', destination: '1 Tuas Avenue 1', destinationType: 'CUSTOMER',
    plannedDate: '2026-10-06', plannedTime: '09:30', driver: 'TAN BM', truck: 'XD1234A', chassisId: 'CH-2038',
  }, 'controller');
  assert.equal(trip.driver, 'TAN BM');
  assert.equal(trip.truck, 'XD1234A');
  assert.equal(trip.chassisId, 'CH-2038');
  assert.equal(trip.movementStatus, 'SCHEDULED');
});

test('marking the box delivered completes its delivery trip', async () => {
  const { repo, job, box } = await readyBox();
  const trip = await repo.createMovement({
    jobId: job.jobId, containerId: box.containerId, movementType: 'IMPORT_DELIVERY',
    origin: 'PSA', originType: 'TERMINAL', destination: '1 Tuas Avenue 1', destinationType: 'CUSTOMER',
    driver: 'TAN BM', truck: 'XD1234A', chassisId: 'CH-2038',
  }, 'controller');
  await repo.recordDelivered(box.containerId, 'controller');
  const after = (await repo.listMovementsForJob(job.jobId)).find((m) => m.movementId === trip.movementId);
  assert.equal(after!.movementStatus, 'COMPLETED');
});

test('an empty return can be planned for a box the customer has finished with', async () => {
  const { repo, job, box } = await readyBox();
  await repo.recordDelivered(box.containerId, 'controller');
  await repo.confirmEmptyReady(box.containerId, 'MANUAL', 'controller');
  const back = await repo.createMovement({
    jobId: job.jobId, containerId: box.containerId, movementType: 'EMPTY_RETURN',
    origin: '1 Tuas Avenue 1', originType: 'CUSTOMER', destination: 'ALLIED 1', destinationType: 'YARD',
    driver: 'LIM', truck: 'XE9', chassisId: 'CH-2038',
  }, 'controller');
  assert.equal(back.movementType, 'EMPTY_RETURN');
});
