import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepository } from '../src/memory.ts';
import { JobService } from '../src/service.ts';

const at = (iso: string) => () => iso;
const svc = (now = '2026-09-01T00:00:00Z') =>
  new JobService(createMemoryRepository(), at(now));

test('every fixture job derives a status, location, action and owner', async () => {
  const jobs = await svc().listJobs();
  assert.ok(jobs.length >= 5, 'fixtures should cover both domains');
  for (const j of jobs) {
    assert.ok(j.jobStatus, `${j.jobNumber} has no status`);
    assert.ok(j.location, `${j.jobNumber} has no location`);
    assert.ok(j.nextActionRequired, `${j.jobNumber} has no next action`);
    assert.ok(['US', 'CUSTOMER', 'CARRIER', 'NOBODY'].includes(j.waitingOn));
  }
});

test('both domains are represented and keep their own numbering', async () => {
  const jobs = await svc().listJobs();
  const imports = jobs.filter((j) => j.domain === 'IMPORT');
  const exports_ = jobs.filter((j) => j.domain === 'EXPORT');
  assert.ok(imports.length > 0 && exports_.length > 0);
  assert.ok(imports.every((j) => j.jobNumber.startsWith('JOB-')));
  assert.ok(exports_.every((j) => j.jobNumber.startsWith('EXP-')));
});

test('§41: a CMS-pending job is blocked, and completing CMS unblocks it', async () => {
  const repo = createMemoryRepository();
  const service = new JobService(repo, at('2026-09-01T00:00:00Z'));

  const before = await service.getJob('ej3');
  assert.equal(before?.jobStatus, 'Awaiting CMS');
  assert.equal(before?.nextActionRequired, 'Complete CMS');

  await repo.recordCms('ej3', 'COMPLETED', 'winnie');

  const after = await service.getJob('ej3');
  assert.notEqual(after?.jobStatus, 'Awaiting CMS', 'the gate must reopen');
  assert.notEqual(after?.nextActionRequired, 'Complete CMS');
});

test('§40.2: CMS Not Required also satisfies the gate', async () => {
  const repo = createMemoryRepository();
  const service = new JobService(repo, at('2026-09-01T00:00:00Z'));
  await repo.recordCms('ej3', 'NOT_REQUIRED', 'winnie', 'Customer exempt');
  const after = await service.getJob('ej3');
  assert.notEqual(after?.jobStatus, 'Awaiting CMS');
});

test('§31: recording permit and Portnet moves an import job to Ready', async () => {
  const repo = createMemoryRepository();
  const service = new JobService(repo, at('2026-08-19T00:00:00Z'));

  const before = await service.getJob('ij1');
  assert.ok(['Awaiting Permit', 'Awaiting Portnet'].includes(String(before?.jobStatus)));

  await repo.recordPermitReceived('ij1', 'PRM-1', 'sarah');
  await repo.recordPortnetReleased('ij1', 'sarah');

  const after = await service.getJob('ij1');
  assert.equal(after?.jobStatus, 'Ready for Collection');
  assert.equal(after?.containers[0]?.gatePassed, true);
});

test('§39: capturing container identity advances the export job', async () => {
  const repo = createMemoryRepository();
  const service = new JobService(repo, at('2026-08-25T00:00:00Z'));

  const before = await service.getJob('ej2');
  assert.equal(before?.nextActionRequired, 'Enter container, seal and tare');

  await repo.captureContainerIdentity('xc2',
    { containerNumber: 'TGHU1234567', sealNumber: '998877', tareWeightKg: 2200 }, 'winnie');

  const after = await service.getJob('ej2');
  assert.equal(after?.containers[0]?.containerNumber, 'TGHU1234567');
  assert.notEqual(after?.nextActionRequired, 'Enter container, seal and tare');
});

test('§44: transhipment availability routes the carpark job onward', async () => {
  const repo = createMemoryRepository();
  const service = new JobService(repo, at('2026-08-26T00:00:00Z'));

  const before = await service.getJob('ej1');
  assert.equal(before?.jobStatus, 'Awaiting T/T', '§45.2 rule 13: at carpark + PENDING');

  await repo.recordTranshipment('ej1', 'AVAILABLE', 'winnie');

  const after = await service.getJob('ej1');
  assert.equal(after?.jobStatus, 'Ready for Port Delivery');
  assert.equal(after?.nextActionRequired, 'Arrange carpark to port');
});

test('§26.2: the action queue filters by waiting_on', async () => {
  const service = svc();
  const all = await service.actionRequired();
  const us = await service.actionRequired('US');
  assert.ok(all.length >= us.length);
  assert.ok(us.every((j) => j.waitingOn === 'US'));
});

test('§54: the service exposes no way to write a derived value', async () => {
  const repo = createMemoryRepository();
  const surface = Object.keys(repo);
  for (const forbidden of ['setJobStatus', 'setNextAction', 'setLocation', 'setWaitingOn']) {
    assert.ok(!surface.includes(forbidden), `${forbidden} must not exist on the port`);
  }
  // Commands are narrow and milestone-shaped only.
  assert.ok(surface.every((k) => !/^set[A-Z]/.test(k)));
});

test('the repository does not leak fixtures by reference', async () => {
  const repo = createMemoryRepository();
  const first = await repo.listImportJobs();
  first[0]!.customer = 'MUTATED';
  const second = await repo.listImportJobs();
  assert.notEqual(second[0]!.customer, 'MUTATED', 'callers must not corrupt stored state');
});

test('two repositories do not share state', async () => {
  const a = createMemoryRepository();
  const b = createMemoryRepository();
  await a.recordPortnetReleased('ij1', 'sarah');
  const fromB = await b.getImportJob('ij1');
  assert.equal(fromB?.portnetReleased, false);
});

test('an unknown job id returns null rather than throwing', async () => {
  assert.equal(await svc().getJob('does-not-exist'), null);
});

test('a command against an unknown id fails loudly', async () => {
  const repo = createMemoryRepository();
  await assert.rejects(() => repo.recordPortnetReleased('nope', 'sarah'), /Unknown import job/);
});

test('§26.1: the incomplete queue is driven by the mandatory field engine', async () => {
  const service = svc();
  const incomplete = await service.incomplete();
  assert.ok(incomplete.every((j) => j.missingInformation.length > 0),
    'a job in the queue must be able to say what is missing');
});

test('§13: a command appears on the job as a narrative entry', async () => {
  const repo = createMemoryRepository();
  const service = new JobService(repo, at('2026-09-01T00:00:00Z'));

  assert.deepEqual((await service.getJob('ej3'))?.activity, [],
    'nothing has happened yet');

  await repo.recordCms('ej3', 'COMPLETED', 'Sarah Lim');

  const after = await service.getJob('ej3');
  assert.ok((after?.activity.length ?? 0) > 0);
  const entry = after!.activity[0]!;
  assert.equal(entry.actor, 'Sarah Lim');
  assert.match(entry.description, /cmsStatus/, 'the entry says what changed');
});

test('§13: activity is chronological, oldest first', async () => {
  const repo = createMemoryRepository();
  const service = new JobService(repo, at('2026-09-01T00:00:00Z'));
  await repo.recordCms('ej3', 'COMPLETED', 'Sarah');
  await new Promise((r) => setTimeout(r, 2));
  await repo.recordTranshipment('ej3', 'AVAILABLE', 'Winnie');

  const activity = (await service.getJob('ej3'))!.activity;
  const times = activity.map((a) => a.at);
  assert.deepEqual(times, [...times].sort(), 'a narrative reads forwards');
});

test('§13: one job’s history never leaks into another', async () => {
  const repo = createMemoryRepository();
  const service = new JobService(repo, at('2026-09-01T00:00:00Z'));
  await repo.recordCms('ej3', 'COMPLETED', 'Sarah');
  assert.deepEqual((await service.getJob('ij1'))?.activity, []);
});

test('§35: the fleet reports 89 units with derived status', async () => {
  const view = await svc().fleet();
  assert.equal(view.units.length, 89, '§9.1: 47 twenty-foot and 42 forty-foot');
  assert.equal(view.units.filter((u) => u.size === '20FT').length, 47);
  assert.equal(view.units.filter((u) => u.size === '40FT').length, 42);
  for (const u of view.units) {
    assert.ok(['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INSPECTION', 'RETIRED'].includes(u.status));
  }
});

test('§35.3: a unit under a container reports IN_USE with its job', async () => {
  const view = await svc().fleet();
  const held = view.units.filter((u) => u.status === 'IN_USE');
  assert.ok(held.length > 0, 'the fixtures mount chassis on containers');
  for (const u of held) {
    assert.ok(u.jobNumber, 'an in-use unit names the job holding it');
    assert.ok(u.daysHeld >= 0);
  }
});

test('§35.4: availability is reported per size and adds up', async () => {
  const view = await svc().fleet();
  const a = view.availability;
  assert.equal(a.available20ft + a.inUse20ft + a.unavailable20ft, 47);
  assert.equal(a.available40ft + a.inUse40ft + a.unavailable40ft, 42);
});

test('§35.6: capacity follows from average job duration', async () => {
  const view = await svc().fleet();
  assert.ok(view.monthlyCapacity20ft > 0);
  assert.ok(view.averageJobDays >= 1);
});
