import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepository } from '../src/memory.ts';
import { JobService } from '../src/service.ts';
import { canHandOverExport, canCollect, canCollectEmpty } from '@greenlit/engine';
import { IMPORT_MANDATORY } from '../src/service.ts';

/**
 * The acceptance scenarios from the operations change request of
 * 28 September 2026, run rather than read.
 *
 * Written because a search for a string proves the string is there and not
 * that the behaviour is: the first pass over this document was a set of greps,
 * and it reported three things present that were not. Each test below is one
 * row of that document's acceptance table.
 */

const importJob = async (repo: ReturnType<typeof createMemoryRepository>, over = {}) =>
  repo.createImportJob({
    customerCode: 'ABC', carrier: 'OR', blNumber: 'B1',
    vesselName: 'EVER GOLDEN', voyageNumber: '0765-033W', eta: '2026-10-05',
    deliveryAddress: '1 Tuas Avenue 1',
    containers: [
      { containerNumber: 'OOLU1234567', sizeType: '20 GP' },
      { containerNumber: 'TCLU7654321', sizeType: '40 HQ' },
    ],
    ...over,
  } as never, 'tester');

test('two containers, one address: one job number, both boxes on it', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo);
  const containers = await repo.listContainersForImportJob(job.jobId);
  assert.equal(containers.length, 2);
  assert.ok(job.jobNumber, 'one number for the shipment');
  assert.equal(containers.every((c) => c.deliveryAddress === null), true,
    'null means the box uses the job address');
});

test('two containers, different addresses: editing one leaves the other', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo, {
    containers: [
      { containerNumber: 'OOLU1234567', sizeType: '20 GP', deliveryAddress: '1 Tuas Ave 1' },
      { containerNumber: 'TCLU7654321', sizeType: '40 HQ', deliveryAddress: '9 Gul Circle' },
    ],
  });
  const [a, b] = await repo.listContainersForImportJob(job.jobId);
  assert.equal(a!.deliveryAddress, '1 Tuas Ave 1');
  assert.equal(b!.deliveryAddress, '9 Gul Circle');

  await repo.amendContainer(a!.containerId, { deliveryAddress: '2 Benoi Crescent' }, 'tester');
  const [a2, b2] = await repo.listContainersForImportJob(job.jobId);
  assert.equal(a2!.deliveryAddress, '2 Benoi Crescent');
  assert.equal(b2!.deliveryAddress, '9 Gul Circle', 'the other is untouched');
});

test('a permit maps to the box it covers, and the uncovered box is blocked', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo, { permitRequired: true });
  const [a, b] = await repo.listContainersForImportJob(job.jobId);

  await repo.recordPermit(job.jobId,
    { permitNumber: 'IG6I356324B', containerIds: [a!.containerId] }, 'tester');

  const view = await new JobService(repo).getJob(job.jobId);
  const boxA = view!.containers.find((c) => c.containerId === a!.containerId);
  const boxB = view!.containers.find((c) => c.containerId === b!.containerId);

  assert.deepEqual(boxA!.handoverGaps, [], 'A is covered');
  assert.deepEqual(boxB!.handoverGaps, ['Permit'], 'B is not, and says so exactly');

  // Both permits stay on the job once a second is added.
  await repo.recordPermit(job.jobId,
    { permitNumber: 'IG6I370558Y', containerIds: [b!.containerId] }, 'tester');
  assert.equal((await repo.listPermitsForJob(job.jobId)).length, 2);
});

test('a release naming one box leaves the other pending', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo);
  const [a, b] = await repo.listContainersForImportJob(job.jobId);

  await repo.recordPortnetReleased(job.jobId, 'tester', [a!.containerId]);
  const [a2, b2] = await repo.listContainersForImportJob(job.jobId);
  assert.ok(a2!.portnetReleasedAt, 'A is released');
  assert.equal(b2!.portnetReleasedAt, null, 'B is not');

  // And the job flag does not lie about it.
  const after = await repo.getImportJob(job.jobId);
  assert.equal(after!.portnetReleased, false, 'not every box, so not the job');
});

test('release and discharge decide collection; the permit does not', async () => {
  const repo = createMemoryRepository();
  const job = await importJob(repo, { permitRequired: true });
  const [a] = await repo.listContainersForImportJob(job.jobId);

  await repo.recordPortnetReleased(job.jobId, 'tester', [a!.containerId]);
  await repo.recordDischarged(a!.containerId, 'tester');

  const fresh = await repo.getImportJob(job.jobId);
  const [box] = await repo.listContainersForImportJob(job.jobId);
  // No permit recorded at all, and collection is still eligible.
  assert.equal(canCollect(fresh!, box!, IMPORT_MANDATORY).passed, true);
});

test('optional information missing does not block handover', async () => {
  // Yard, weight, tri-axle and free days all blank, and no permit needed for
  // this customer. None of them is a reason to keep the job off the
  // controller's board.
  const repo = createMemoryRepository();
  const job = await importJob(repo, { permitRequired: false });
  const view = await new JobService(repo).getJob(job.jobId);
  for (const c of view!.containers) {
    assert.deepEqual(c.handoverGaps, [], 'nothing optional holds the box back');
  }
  assert.deepEqual(view!.handoverShipmentGaps, []);
});

test('an export hands over with CMS pending, and the collection stays blocked', async () => {
  const repo = createMemoryRepository();
  const job = await repo.createExportJob({
    customerCode: 'ABC', shipper: 'SHIPPER', bookingReference: 'BK1',
    exportClearanceReference: 'CLR1', vesselName: 'V', voyageNumber: '1',
    etaSingapore: '2026-10-05', emptyCollectionYard: 'Allied 1',
    deliveryAddress: '1 Tuas Avenue 1',
    containerQuantity: 1, containerSizeType: '20GP',
  } as never, 'tester');

  const containers = await repo.listContainersForExportJob(job.exportJobId);
  for (const c of containers) {
    await repo.amendExportContainer(c.exportContainerId, { grossWeightKg: 18000 }, 'tester');
  }

  const ready = await repo.getExportJob(job.exportJobId);
  const boxes = await repo.listContainersForExportJob(job.exportJobId);
  assert.equal(canHandOverExport(ready!, boxes).passed, true, 'CMS pending does not block handover');

  await repo.handExportToController(job.exportJobId, 'tester');
  assert.ok((await repo.getExportJob(job.exportJobId))!.handedOverAt);

  // ...and the empty collection is still refused until CMS is done.
  const withCms = await repo.getExportJob(job.exportJobId);
  assert.equal(canCollectEmpty(withCms!, { fields: [] }).passed, false,
    'CMS pending blocks the collection it is for');
});

test('an export with a core field missing says which', async () => {
  const repo = createMemoryRepository();
  const job = await repo.createExportJob({
    customerCode: 'ABC', shipper: 'S', bookingReference: 'BK2',
    exportClearanceReference: 'CLR2', vesselName: 'V', voyageNumber: '1',
    etaSingapore: '2026-10-05', emptyCollectionYard: 'Allied 1',
    deliveryAddress: '1 Tuas Avenue 1',
    containerQuantity: 1, containerSizeType: '20GP',
  } as never, 'tester');

  // Weight never entered.
  const boxes = await repo.listContainersForExportJob(job.exportJobId);
  const gate = canHandOverExport((await repo.getExportJob(job.exportJobId))!, boxes);
  assert.equal(gate.passed, false);
  assert.match(gate.failures.join(' '), /weight/i);

  await assert.rejects(
    () => repo.handExportToController(job.exportJobId, 'tester'), /weight/i);
});

test('completing CMS for one collection never clears another', () => {
  // The document's own acceptance check, and the one item that could not pass
  // while CMS was a single field on the job: a job collecting from two yards
  // had one status, so booking either made both read as ready — including the
  // yard nobody had booked.
  const job = { customer: 'ABC', cmsRequired: true, cmsStatus: 'PENDING' } as never;
  const NO_FIELDS = { fields: [] };

  const allied = canCollectEmpty(job, NO_FIELDS, { cmsStatus: 'COMPLETED' });
  const cwt = canCollectEmpty(job, NO_FIELDS, { cmsStatus: 'PENDING' });

  assert.equal(allied.passed, true, 'the booked yard may be dispatched');
  assert.equal(cwt.passed, false, 'the unbooked one may not');
  assert.match(cwt.failures.join(' '), /CMS/);
});
