import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refusePermitSave } from '@greenlit/engine';
import { createMemoryRepository } from '../src/memory.ts';
import { JobService } from '../src/service.ts';

const job = (repo: ReturnType<typeof createMemoryRepository>) => repo.createImportJob({
  customerCode: 'ABC', deliveryAddress: '1 Tuas Avenue 1', vesselName: 'EVER GOLDEN',
  voyageNumber: '033W', eta: '2026-10-05', permitRequired: true,
  containers: [{ containerNumber: 'OOLU1234567', sizeType: '20 GP' }],
} as never, 'operations');

const shipment = { vesselName: 'EVER GOLDEN', voyageNumber: '033W', eta: '2026-10-05' };
const permit = (over = {}) => ({
  permitId: 'p', permitNumber: 'IG6I356324B', expiryDate: '2026-10-30',
  permitVesselVoyage: 'EVER GOLDEN 033W', fileName: null, linkedContainerIds: [], ...over,
});

test('a permit for another sailing or expiring by the ETA is refused', () => {
  assert.equal(refusePermitSave(permit(), shipment), null);
  assert.match(refusePermitSave(permit({ permitVesselVoyage: 'EVER GOLDEN 034W' }), shipment)!, /034W/);
  assert.match(refusePermitSave(permit({ expiryDate: '2026-10-05' }), shipment)!, /expires/);
  assert.equal(refusePermitSave(permit({ permitNumber: 'XX1' }), shipment), null,
    'an unfamiliar number shape is a warning, not a refusal');
});

test('a permit is corrected in place and keeps the containers it covers', async () => {
  const repo = createMemoryRepository();
  const j = await job(repo);
  const [box] = await repo.listContainersForImportJob(j.jobId);
  const p = await repo.recordPermit(j.jobId, { permitNumber: 'IG6I356324B', containerIds: [box!.containerId] }, 'operations');
  const fixed = await repo.amendPermit(p.permitId, { permitNumber: 'ig6i370558y' }, 'operations');
  assert.equal(fixed.permitNumber, 'IG6I370558Y');
  assert.deepEqual(fixed.linkedContainerIds, [box!.containerId]);
});

test('a job note is on the job log with who wrote it', async () => {
  const repo = createMemoryRepository();
  const j = await job(repo);
  await repo.addJobNote(j.jobId, 'Customer asked for morning delivery only', 'Sarah Lim');
  const view = await new JobService(repo).getJob(j.jobId);
  assert.ok(view!.activity.some((e) => e.actor === 'Sarah Lim' && e.description === 'Note: Customer asked for morning delivery only'));
});
