import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepository } from '../src/memory.ts';
import { JobService } from '../src/service.ts';

/**
 * The acceptance scenarios of the import handover brief and the meeting of
 * 29 September 2026, run against the store and the service — where the rules
 * are enforced — rather than read off the screens.
 */

const ten = Array.from({ length: 10 }, (_, i) => ({
  containerNumber: `TCLU${String(1000000 + i)}`, sizeType: '40 HQ',
}));

const importJob = (repo: ReturnType<typeof createMemoryRepository>, over = {}) =>
  repo.createImportJob({
    customerCode: 'ABC', carrier: 'OR', blNumber: 'B1',
    vesselName: 'EVER GOLDEN', voyageNumber: '0765-033W', eta: '2026-10-05',
    deliveryAddress: '1 Tuas Avenue 1', permitRequired: true, containers: ten,
    ...over,
  } as never, 'operations');

const view = (repo: ReturnType<typeof createMemoryRepository>, id: string) =>
  new JobService(repo).getJob(id);

test('A: permit A covers boxes 1-5 and permit B boxes 6-10, and all ten can be handed over', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo);
  const ids = (await repo.listContainersForImportJob(job.jobId)).map((c) => c.containerId);
  await repo.recordPermit(job.jobId, { permitNumber: 'IG6I356324B', containerIds: ids.slice(0, 5) }, 'operations');
  await repo.recordPermit(job.jobId, { permitNumber: 'IG6I370558Y', containerIds: ids.slice(5) }, 'operations');
  const v = await view(repo, job.jobId);
  assert.equal(v!.containers.filter((c) => c.readyForHandover).length, 10);
  assert.equal(v!.permitCovered, true, 'no "missing permit" once every box is mapped');
});

test('B: one permit applied to all ten covers them without editing each box', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo, { permits: [{ permitNumber: 'IG6I356324B' }] });
  const v = await view(repo, job.jobId);
  assert.equal(v!.containers.every((c) => c.readyForHandover), true);
});

test('an uploaded permit with no number yet still allows handover', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo);
  const ids = (await repo.listContainersForImportJob(job.jobId)).map((c) => c.containerId);
  await repo.recordPermit(job.jobId, { permitNumber: null, fileName: 'permit.pdf', containerIds: ids }, 'operations');
  const v = await view(repo, job.jobId);
  assert.equal(v!.containers.every((c) => c.readyForHandover), true);
  assert.ok(v!.documentGaps.some((g) => g.field === 'Permit number'),
    'the number is still asked for before documents are ready');
});

test('C: handover puts the same job on the controller board, and creates no second job', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo, { permitRequired: false });
  const before = (await repo.listImportJobs()).length;
  for (const c of await repo.listContainersForImportJob(job.jobId)) {
    await repo.handContainerToController(c.containerId, 'operations');
  }
  assert.equal((await repo.listImportJobs()).length, before, 'no duplicate');
  const v = await view(repo, job.jobId);
  assert.equal(v!.containers.every((c) => c.handedOver), true);
  assert.equal(v!.jobId, job.jobId, 'the same record');
});

test('D: one job-level release marks all ten released, on the job log', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo);
  await repo.recordPortnetReleased(job.jobId, 'operations');
  const v = await view(repo, job.jobId);
  assert.equal(v!.containers.every((c) => c.portnetReleasedAt), true);
  assert.equal(v!.containers[0]!.planBlockedReason, 'Waiting for Discharge');
});

test('a release naming one box leaves the rest pending, and both roles see it on the job log', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo);
  const [a] = await repo.listContainersForImportJob(job.jobId);
  await repo.recordPortnetReleased(job.jobId, 'operations', [a!.containerId]);
  const v = await view(repo, job.jobId);
  assert.equal(v!.containers.filter((c) => c.portnetReleasedAt).length, 1);
  assert.ok(v!.activity.some((e) => e.actor === 'operations' && /Portnet/.test(e.description)
    && e.description.includes(a!.containerNumber!)), 'the partial release is on the job log');
});

test('E: Plan stays unavailable until release and discharge are both ready', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo, { permitRequired: false });
  const [a] = await repo.listContainersForImportJob(job.jobId);
  const trip = {
    jobId: job.jobId, containerId: a!.containerId, movementType: 'IMPORT_DELIVERY',
    origin: 'PSA', originType: 'TERMINAL', destination: '1 Tuas Avenue 1', destinationType: 'CUSTOMER',
  };
  await assert.rejects(() => repo.createMovement(trip, 'controller'), /Waiting for Portnet Release and Discharge/);
  await repo.recordPortnetReleased(job.jobId, 'operations');
  await assert.rejects(() => repo.createMovement(trip, 'controller'), /Waiting for Discharge/);
  await repo.recordDischarged(a!.containerId, 'controller');
  const v = await view(repo, job.jobId);
  assert.equal(v!.containers.find((c) => c.containerId === a!.containerId)!.canPlanCollection, true);
  await repo.createMovement(trip, 'controller');
});

test('F: staggered delivery keeps each box\'s date, and the customer\'s requested date beside it', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo, {
    permitRequired: false,
    containers: ten.map((c) => ({ ...c, requestedDeliveryDate: '2026-10-20' })),
  });
  const ids = (await repo.listContainersForImportJob(job.jobId)).map((c) => c.containerId);
  for (const id of ids.slice(0, 5)) await repo.amendContainer(id, { plannedDeliveryDate: '2026-10-15' }, 'controller');
  for (const id of ids.slice(5)) await repo.amendContainer(id, { plannedDeliveryDate: '2026-10-16' }, 'controller');
  const boxes = await repo.listContainersForImportJob(job.jobId);
  assert.deepEqual(boxes.map((c) => c.plannedDeliveryDate),
    [...Array(5).fill('2026-10-15'), ...Array(5).fill('2026-10-16')]);
  assert.equal(boxes.every((c) => c.requestedDeliveryDate === '2026-10-20'), true, 'what was asked is kept');
});

test('G: the controller\'s confirmed last free day is the one the job runs on', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo, { permitRequired: false });
  const [a] = await repo.listContainersForImportJob(job.jobId);
  await repo.recordFreeTime(a!.containerId, {
    freeTimeModel: 'COMBINED', combinedFreeDays: 10, combinedLfd: '2026-10-20',
    lfdOverrideReason: 'Carrier confirmed by email',
  } as never, 'controller');
  const box = (await view(repo, job.jobId))!.containers.find((c) => c.containerId === a!.containerId)!;
  const clock = box.freeTime[0]!;
  assert.equal(clock.countedLastFreeDay, '2026-10-14', 'estimated from the ETA, ETA as day one');
  assert.equal(clock.overriddenLastFreeDay, '2026-10-20');
  assert.equal(box.carrierLastFreeDay, '2026-10-20', 'confirmed outranks estimated');
});

test('handover needs customer, delivery, vessel, voyage and permit, and not the free days or yard', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo, {
    permitRequired: false, voyageNumber: null,
  });
  const v = await view(repo, job.jobId);
  assert.deepEqual(v!.handoverShipmentGaps, ['Voyage']);
  assert.equal(v!.containers.every((c) => c.handoverGaps.length === 0), true,
    'no empty return yard, no free days, no last free day, and nothing else is asked');
});
