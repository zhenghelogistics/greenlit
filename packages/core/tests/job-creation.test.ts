import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepository } from '../src/memory.ts';

/**
 * A job created without a container was a permanent dead end.
 *
 * Free time is per container (§29.1) and every container command addresses
 * one, so a job with none could not progress — and there is no route to add a
 * container afterwards. Document intake made it worse: it showed the operator
 * the containers it had read, let them correct the numbers, and then did not
 * send them.
 */
test('a job carries the containers it was created with', async () => {
  const repo = createMemoryRepository();
  const job = await repo.createImportJob({
    customerCode: 'ABC',
    containers: [
      { containerNumber: 'HLXU1234567', sizeType: '40 HQ', sealNumber: 'SG1' },
      { containerNumber: 'HLXU7654321', sizeType: '20 GP' },
    ],
  }, 'tester');

  const containers = await repo.listContainersForImportJob(job.jobId);
  assert.equal(containers.length, 2);
  assert.equal(containers[0]?.containerNumber, 'HLXU1234567');
  assert.equal(containers[0]?.containerSize, '40');
  assert.equal(containers[0]?.containerType, 'HQ');
  assert.equal(containers[0]?.sealNumber, 'SG1');
  assert.equal(containers[1]?.containerNumber, 'HLXU7654321');
});

test('a job created before its notice still has somewhere to put the number', async () => {
  // Entered by hand, ahead of the paperwork. One empty container rather than
  // none, so the number has a home when it arrives.
  const repo = createMemoryRepository();
  const job = await repo.createImportJob({ customerCode: 'ABC' }, 'tester');
  const containers = await repo.listContainersForImportJob(job.jobId);
  assert.equal(containers.length, 1);
  assert.equal(containers[0]?.containerNumber, null);
});

test('§34: a new container asserts nothing about the carrier’s allowance', async () => {
  const repo = createMemoryRepository();
  const job = await repo.createImportJob({ customerCode: 'ABC' }, 'tester');
  const [container] = await repo.listContainersForImportJob(job.jobId);
  assert.equal(container?.freeTimeModel, 'NOT_CONFIRMED',
    'defaulting to SPLIT would assert a carrier rule nobody has read');
});

test('free-time terms read from the notice reach the container', async () => {
  const repo = createMemoryRepository();
  const job = await repo.createImportJob({
    customerCode: 'ABC',
    containers: [{ containerNumber: 'HLXU1111111', freeTimeModel: 'COMBINED',
                   combinedFreeDays: 14, freeTimeRemarks: '14 combined calendar days from discharge' }],
  }, 'tester');
  const [c] = await repo.listContainersForImportJob(job.jobId);
  assert.equal(c?.freeTimeModel, 'COMBINED');
  assert.equal(c?.combinedFreeDays, 14);
  assert.equal(c?.freeTimeRemarks, '14 combined calendar days from discharge');
});

/**
 * An export command aimed at an import record said the record was unknown.
 *
 * It exists; the command simply does not apply to it. The difference matters:
 * "unknown" sends a controller looking for a missing job, which is a longer
 * and more alarming search than reading that they picked the wrong action.
 */
test('an export command on an import job says so', async () => {
  const repo = createMemoryRepository();
  const job = await repo.createImportJob({ customerCode: 'ABC' }, 'tester');

  await assert.rejects(() => repo.recordCms(job.jobId, 'COMPLETED', 'tester'),
    /CMS applies to export jobs/);
  await assert.rejects(() => repo.recordTranshipment(job.jobId, 'AVAILABLE', 'tester'),
    /transhipment check applies to export jobs/);
});

test('an export command on an import container says so', async () => {
  const repo = createMemoryRepository();
  const job = await repo.createImportJob({
    customerCode: 'ABC', containers: [{ containerNumber: 'HLXU2222222' }],
  }, 'tester');
  const [c] = await repo.listContainersForImportJob(job.jobId);

  await assert.rejects(() => repo.recordContainerReady(c!.containerId, 'tester'),
    /import container \(HLXU2222222\)/);
});

test('a genuinely unknown id is still reported as unknown', async () => {
  const repo = createMemoryRepository();
  await assert.rejects(() => repo.recordCms('no-such-job', 'COMPLETED', 'tester'),
    /Unknown export job/);
  await assert.rejects(() => repo.recordContainerReady('no-such-container', 'tester'),
    /Unknown container/);
});

test('§29: twenty containers are accepted, twenty-one refused', async () => {
  // The limit lived only in the browser. A caller reaching the API directly,
  // or a notice listing more than twenty, went straight past it.
  const repo = createMemoryRepository();
  const boxes = (n: number) => Array.from({ length: n }, (_, i) => ({
    containerNumber: `HLXU${String(7000000 + i).padStart(7, '0')}`,
  }));

  const job = await repo.createImportJob({ customerCode: 'ABC', containers: boxes(20) }, 'tester');
  assert.equal((await repo.listContainersForImportJob(job.jobId)).length, 20);

  await assert.rejects(
    () => repo.createImportJob({ customerCode: 'ABC', containers: boxes(21) }, 'tester'),
    /at most 20 containers; this one has 21/);
});

test('a refused job leaves nothing behind', async () => {
  const repo = createMemoryRepository();
  const before = (await repo.listImportJobs()).length;
  await assert.rejects(() => repo.createImportJob({
    customerCode: 'ABC',
    containers: Array.from({ length: 25 }, (_, i) => ({ containerNumber: `AAAU${1000000 + i}` })),
  }, 'tester'));
  assert.equal((await repo.listImportJobs()).length, before,
    'a job refused for too many containers must not be half-created');
});
