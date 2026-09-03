import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Repository } from '../src/repository.ts';

/**
 * The Repository contract.
 *
 * These tests are written against the *interface*, never against an
 * implementation. Any adapter must pass them unchanged — the in-memory one
 * today, a Supabase/Postgres one later. That is what makes "swapping storage
 * changes nothing else" a guarantee rather than an architectural hope.
 *
 * A test belongs here only if it asserts something every implementation must
 * honour. Fixture-specific expectations belong in service.test.ts.
 *
 * @param name      label for the implementation under test
 * @param create    returns a fresh, independent repository
 * @param seeded    ids that must exist in the implementation's dataset
 */
export function runRepositoryContract(
  name: string,
  create: () => Repository | Promise<Repository>,
  seeded: { importJobId: string; exportJobId: string; exportContainerId: string },
) {
  const fresh = async () => await create();

  test(`[${name}] reads are consistent between list and get`, async () => {
    const repo = await fresh();
    for (const job of await repo.listImportJobs()) {
      const one = await repo.getImportJob(job.jobId);
      assert.equal(one?.jobId, job.jobId, 'get must return what list advertised');
    }
    for (const job of await repo.listExportJobs()) {
      const one = await repo.getExportJob(job.exportJobId);
      assert.equal(one?.exportJobId, job.exportJobId);
    }
  });

  test(`[${name}] an unknown id reads as null, never throws`, async () => {
    const repo = await fresh();
    assert.equal(await repo.getImportJob('no-such-id'), null);
    assert.equal(await repo.getExportJob('no-such-id'), null);
  });

  test(`[${name}] unknown parents return empty collections, not null`, async () => {
    const repo = await fresh();
    assert.deepEqual(await repo.listContainersForImportJob('no-such-id'), []);
    assert.deepEqual(await repo.listMovementsForJob('no-such-id'), []);
    assert.deepEqual(await repo.listOpenExceptionsForJob('no-such-id'), []);
  });

  test(`[${name}] callers cannot corrupt stored state through returned objects`, async () => {
    const repo = await fresh();
    const before = await repo.listImportJobs();
    assert.ok(before.length > 0, 'contract requires a non-empty dataset');
    before[0]!.customer = '__MUTATED__';
    const after = await repo.listImportJobs();
    assert.notEqual(after[0]!.customer, '__MUTATED__');
  });

  test(`[${name}] instances are independent`, async () => {
    const a = await fresh();
    const b = await fresh();
    await a.recordPortnetReleased(seeded.importJobId, 'tester');
    const fromB = await b.getImportJob(seeded.importJobId);
    assert.equal(fromB?.portnetReleased, false,
      'a write to one instance must not be visible in another');
  });

  test(`[${name}] movements returned for a job belong to that job`, async () => {
    const repo = await fresh();
    for (const job of await repo.listExportJobs()) {
      const movements = await repo.listMovementsForJob(job.exportJobId);
      for (const m of movements) {
        assert.equal(m.jobId, job.exportJobId, `${m.movementRef} is on the wrong job`);
      }
    }
  });

  test(`[${name}] only unresolved exceptions are returned as open`, async () => {
    const repo = await fresh();
    for (const job of await repo.listImportJobs()) {
      const open = await repo.listOpenExceptionsForJob(job.jobId);
      assert.ok(open.every((e) => e.resolvedAt === null));
    }
  });

  test(`[${name}] thresholds are complete`, async () => {
    const repo = await fresh();
    const t = await repo.getThresholds();
    for (const [key, value] of Object.entries(t)) {
      assert.equal(typeof value, 'number', `${key} must be a number`);
      assert.ok(Number.isFinite(value), `${key} must be finite`);
    }
  });

  // ---- Commands. Each must be durable within its instance and observable
  // through the read side, which is the only thing callers depend on. ----

  test(`[${name}] recordCms persists and is readable`, async () => {
    const repo = await fresh();
    await repo.recordCms(seeded.exportJobId, 'COMPLETED', 'tester');
    assert.equal((await repo.getExportJob(seeded.exportJobId))?.cmsStatus, 'COMPLETED');
    await repo.recordCms(seeded.exportJobId, 'NOT_REQUIRED', 'tester', 'Exempt customer');
    assert.equal((await repo.getExportJob(seeded.exportJobId))?.cmsStatus, 'NOT_REQUIRED');
  });

  test(`[${name}] recordPermitReceived clears a prior rejection`, async () => {
    const repo = await fresh();
    await repo.recordPermitReceived(seeded.importJobId, 'PRM-1', 'tester');
    const job = await repo.getImportJob(seeded.importJobId);
    assert.equal(job?.permitReceived, true);
    assert.equal(job?.permitRejected, false);
  });

  test(`[${name}] captureContainerIdentity sets all three values together`, async () => {
    const repo = await fresh();
    await repo.captureContainerIdentity(seeded.exportContainerId,
      { containerNumber: 'ABCU1111111', sealNumber: 'S-1', tareWeightKg: 2200 }, 'tester');
    const containers = await repo.listContainersForExportJob(seeded.exportJobId);
    const c = containers.find((x) => x.exportContainerId === seeded.exportContainerId);
    assert.equal(c?.containerNumber, 'ABCU1111111');
    assert.equal(c?.sealNumber, 'S-1');
    assert.equal(c?.tareWeightKg, 2200);
  });

  test(`[${name}] recordTranshipment stamps when the check happened`, async () => {
    const repo = await fresh();
    await repo.recordTranshipment(seeded.exportJobId, 'AVAILABLE', 'tester');
    const job = await repo.getExportJob(seeded.exportJobId);
    assert.equal(job?.transhipmentStatus, 'AVAILABLE');
    assert.ok(job?.transhipmentCheckedAt, '§44.1 requires a timestamp, not just an answer');
  });

  test(`[${name}] recordVgm and recordContainerReady stamp their times`, async () => {
    const repo = await fresh();
    await repo.recordContainerReady(seeded.exportContainerId, 'tester');
    await repo.recordVgm(seeded.exportContainerId, 24500, 'tester');
    const c = (await repo.listContainersForExportJob(seeded.exportJobId))
      .find((x) => x.exportContainerId === seeded.exportContainerId);
    assert.equal(c?.containerReady, true);
    assert.ok(c?.containerReadyAt);
    assert.equal(c?.vgm, 24500);
    assert.ok(c?.vgmReceivedAt);
  });

  test(`[${name}] commands against unknown ids fail loudly`, async () => {
    const repo = await fresh();
    await assert.rejects(() => repo.recordPortnetReleased('no-such-id', 'tester'));
    await assert.rejects(() => repo.recordCms('no-such-id', 'COMPLETED', 'tester'));
    await assert.rejects(() => repo.recordVgm('no-such-id', 1, 'tester'));
  });

  test(`[${name}] §13: commands leave an audit trail with a named actor`, async () => {
    const repo = await fresh();
    assert.deepEqual(await repo.listAuditEvents(seeded.exportJobId), [],
      'no history before anything happened');

    await repo.recordCms(seeded.exportJobId, 'COMPLETED', 'Sarah Lim');
    const events = await repo.listAuditEvents(seeded.exportJobId);
    assert.ok(events.length > 0, 'a command must leave a record');
    const [first] = events;
    assert.equal(first?.actor, 'Sarah Lim', '§13 forbids an anonymous change');
    assert.ok(first?.createdAt, 'an event carries when it happened');
  });

  test(`[${name}] §13: the audit stream is append-only`, async () => {
    const repo = await fresh();
    // There is deliberately no update or delete on the port; that is the
    // enforcement, not a convention.
    const surface = Object.keys(repo);
    for (const forbidden of ['updateAuditEvent', 'deleteAuditEvent', 'clearAuditEvents']) {
      assert.equal((repo as unknown as Record<string, unknown>)[forbidden], undefined,
        `${forbidden} must not exist: critical events cannot be deleted or edited`);
    }
    await repo.recordPortnetReleased(seeded.importJobId, 'tester');
    const before = await repo.listAuditEvents(seeded.importJobId);
    // Mutating what a read returned must not affect the stored stream.
    before.length = 0;
    assert.ok((await repo.listAuditEvents(seeded.importJobId)).length > 0);
  });

  test(`[${name}] audit events are attributed to the right entity`, async () => {
    const repo = await fresh();
    await repo.recordCms(seeded.exportJobId, 'COMPLETED', 'W');
    assert.deepEqual(await repo.listAuditEvents(seeded.importJobId), [],
      'an export job command must not appear on an import job');
  });

  test(`[${name}] §12: a discrepancy outlives the screen that raised it`, async () => {
    const repo = await fresh();
    const d = {
      field: 'eta', storedValue: '2026-08-17', extractedValue: '2026-08-18',
      source: 'NOA.pdf', confidence: 0.95, detectedAt: '2026-09-01T00:00:00Z',
      reason: 'Extracted eta conflicts with the stored value',
    };
    await repo.raiseDiscrepancy(seeded.importJobId, d, 'intake');
    const open = await repo.listOpenDiscrepancies(seeded.importJobId);
    assert.equal(open.length, 1);
    assert.equal(open[0]?.resolvedAt, null, 'it stays open until someone decides');
  });

  test(`[${name}] §12: resolving records who decided and which way`, async () => {
    const repo = await fresh();
    const d = {
      field: 'eta', storedValue: '2026-08-17', extractedValue: '2026-08-18',
      source: 'NOA.pdf', confidence: 0.95, detectedAt: '2026-09-01T00:00:00Z',
      reason: 'conflict',
    };
    await repo.raiseDiscrepancy(seeded.importJobId, d, 'intake');
    await repo.resolveDiscrepancy(seeded.importJobId, 'eta', 'extracted', 'Brandon');

    assert.deepEqual(await repo.listOpenDiscrepancies(seeded.importJobId), [],
      'a resolved discrepancy is no longer open');

    const events = await repo.listAuditEvents(seeded.importJobId);
    const resolved = events.find((e) => e.event === 'discrepancy.resolved');
    assert.ok(resolved, '§12 requires the decision to be audited');
    assert.equal(resolved?.actor, 'Brandon');
    assert.equal(resolved?.newValue, '2026-08-18', 'the chosen value is recorded');
  });

  test(`[${name}] §12: one open discrepancy per field`, async () => {
    const repo = await fresh();
    const base = {
      field: 'eta', storedValue: '2026-08-17', source: 'a.pdf',
      confidence: 0.9, detectedAt: '2026-09-01T00:00:00Z', reason: 'conflict',
    };
    await repo.raiseDiscrepancy(seeded.importJobId, { ...base, extractedValue: '2026-08-18' }, 'intake');
    await repo.raiseDiscrepancy(seeded.importJobId, { ...base, extractedValue: '2026-08-19', source: 'b.pdf' }, 'intake');
    const open = await repo.listOpenDiscrepancies(seeded.importJobId);
    assert.equal(open.length, 1, 'a second document updates the standing question');
    assert.equal(open[0]?.extractedValue, '2026-08-19');
  });

  test(`[${name}] resolving an unknown discrepancy fails loudly`, async () => {
    const repo = await fresh();
    await assert.rejects(() => repo.resolveDiscrepancy(seeded.importJobId, 'nope', 'stored', 'W'));
  });

  test(`[${name}] writing a derived value is impossible by construction`, async () => {
    const repo = await fresh();
    for (const forbidden of ['setJobStatus', 'setNextAction', 'setLocation',
      'setWaitingOn', 'setContainerStatus', 'setCollectionEligible']) {
      assert.equal((repo as unknown as Record<string, unknown>)[forbidden], undefined,
        `§54: ${forbidden} must not exist on any implementation`);
    }
  });
}
