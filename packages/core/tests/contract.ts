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

  test(`[${name}] a write is visible to a later read`, async () => {
    // This replaced a test asserting that two instances were ISOLATED. That is
    // true of the in-memory adapter, which owns its own maps, and false — and
    // correctly so — of any shared database. It was an implementation detail
    // masquerading as a contract, and it failed the moment a second adapter
    // existed. What every implementation genuinely owes is durability: what
    // was written can be read back.
    const repo = await fresh();
    await repo.recordPortnetReleased(seeded.importJobId, 'tester');
    const after = await repo.getImportJob(seeded.importJobId);
    assert.equal(after?.portnetReleased, true, 'a write must be readable afterwards');
  });

  test(`[${name}] a batched read returns the same rows as the single-job reads`, async () => {
    // The board reads every job's containers, movements and exceptions in one
    // request each rather than three per job. That is only safe while the two
    // paths agree — a batched read that quietly filtered differently would
    // change what a board shows without changing what a job detail shows.
    const repo = await fresh();
    const ids = [seeded.importJobId];

    const [one, many] = await Promise.all([
      repo.listContainersForImportJob(seeded.importJobId),
      repo.listContainersForImportJobs(ids),
    ]);
    assert.deepEqual(many.map((c) => c.containerId).sort(), one.map((c) => c.containerId).sort());

    const [oneMove, manyMove] = await Promise.all([
      repo.listMovementsForJob(seeded.importJobId),
      repo.listMovementsForJobs(ids),
    ]);
    assert.deepEqual(manyMove.map((m) => m.movementId).sort(), oneMove.map((m) => m.movementId).sort());

    const [oneExc, manyExc] = await Promise.all([
      repo.listOpenExceptionsForJob(seeded.importJobId),
      repo.listOpenExceptionsForJobs(ids),
    ]);
    assert.deepEqual(manyExc.length, oneExc.length);
  });

  test(`[${name}] a batched read of nothing asks for nothing`, async () => {
    // An empty board must not become "every row", which is what an unguarded
    // `in ()` would mean.
    const repo = await fresh();
    assert.deepEqual(await repo.listContainersForImportJobs([]), []);
    assert.deepEqual(await repo.listContainersForExportJobs([]), []);
    assert.deepEqual(await repo.listMovementsForJobs([]), []);
    assert.deepEqual(await repo.listOpenExceptionsForJobs([]), []);
  });

  test(`[${name}] a batched read keeps each job's rows to that job`, async () => {
    const repo = await fresh();
    const movements = await repo.listMovementsForJobs([seeded.importJobId, seeded.exportJobId]);
    assert.ok(movements.every((m) => m.jobId === seeded.importJobId || m.jobId === seeded.exportJobId),
      'a batched read must not return rows from jobs that were not asked for');
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
    // Relative, not absolute: a persistent store carries history from earlier
    // work, and requiring an empty trail would only ever pass on a fresh
    // in-memory instance.
    const before = await repo.listAuditEvents(seeded.exportJobId);

    await repo.recordCms(seeded.exportJobId, 'COMPLETED', 'Sarah Lim');
    const after = await repo.listAuditEvents(seeded.exportJobId);

    assert.ok(after.length > before.length, 'a command must leave a record');
    const added = after.at(-1);
    assert.equal(added?.actor, 'Sarah Lim', '§13 forbids an anonymous change');
    assert.ok(added?.createdAt, 'an event carries when it happened');
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
    const importBefore = (await repo.listAuditEvents(seeded.importJobId)).length;

    await repo.recordCms(seeded.exportJobId, 'COMPLETED', 'W');

    const importAfter = await repo.listAuditEvents(seeded.importJobId);
    assert.equal(importAfter.length, importBefore,
      'an export job command must not appear on an import job');
    assert.ok(importAfter.every((e) => e.entityId === seeded.importJobId),
      'every event on a job names that job');
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

  test(`[${name}] a job's containers come back in the same order every time`, async () => {
    // Unordered meant a different order each read: the list reshuffled between
    // loads, and "the first container" was a different box each time anyone
    // asked for it — including the code that writes to it.
    const repo = await fresh();
    const [a, b, c] = await Promise.all([
      repo.listContainersForImportJob(seeded.importJobId),
      repo.listContainersForImportJob(seeded.importJobId),
      repo.listContainersForImportJob(seeded.importJobId),
    ]);
    const ids = (list: readonly { containerId: string }[]) => list.map((x) => x.containerId);
    assert.deepEqual(ids(b), ids(a));
    assert.deepEqual(ids(c), ids(a));
  });

  test(`[${name}] §7: first sign-in provisions a principal, later ones do not`, async () => {
    // Supabase knows a person exists and knows nothing about what they may do.
    // This runs on every sign-in, so only the first may create anything.
    const repo = await fresh();
    const first = await repo.ensurePrincipal('aaron@zhenghe.com.sg', 'Aaron Tan', 'OPERATIONS');
    assert.equal(first.displayName, 'Aaron Tan');
    assert.equal(first.role, 'OPERATIONS');
    assert.equal(first.active, true);

    const second = await repo.ensurePrincipal('aaron@zhenghe.com.sg', 'Someone Else', 'ADMINISTRATOR');
    assert.equal(second.userId, first.userId, 'signing in again must not create a second person');
    assert.equal(second.role, 'OPERATIONS',
      'a later sign-in must never raise a role — that is an administrator\'s act');
    assert.equal(second.displayName, 'Aaron Tan');
  });

  test(`[${name}] §7: a registered person is found by the address they signed up with`, async () => {
    const repo = await fresh();
    await repo.ensurePrincipal('siti@zhenghe.com.sg', 'Siti Rahman', 'OPERATIONS');
    const found = await repo.getPrincipalByEmail('Siti@ZhengHe.com.sg');
    assert.equal(found?.displayName, 'Siti Rahman', 'case is not identity');
  });

  test(`[${name}] §7: two people whose addresses suggest one username both get one`, async () => {
    // Derived usernames collide. A collision that overwrote the first person
    // would hand their audit trail to the second.
    const repo = await fresh();
    const a = await repo.ensurePrincipal('sarah@zhenghe.com.sg', 'Sarah Lim', 'OPERATIONS');
    const b = await repo.ensurePrincipal('sarah@zhenghe.com.sg.', 'Sarah Other', 'OPERATIONS');
    assert.notEqual(a.userId, b.userId);
    assert.equal((await repo.getPrincipalByEmail('sarah@zhenghe.com.sg'))?.displayName, 'Sarah Lim');
  });

  test(`[${name}] §34: confirming free time keeps only the model's own figures`, async () => {
    // The one §34 value a person supplies. Storing all six would keep the
    // contradiction §34.3 exists to prevent — a combined carrier with split
    // figures beside it and nothing to say which applies.
    const repo = await fresh();
    const [container] = await repo.listContainersForImportJob(seeded.importJobId);
    if (!container) return;

    await repo.recordFreeTime(container.containerId, {
      freeTimeModel: 'COMBINED', combinedFreeDays: 14, combinedLfd: '2026-09-28',
      demurrageFreeDays: 3, demurrageLfd: '2026-09-14',
      freeTimeRemarks: '14 combined calendar days from discharge',
    }, 'tester');

    const [after] = await repo.listContainersForImportJob(seeded.importJobId);
    assert.equal(after?.freeTimeModel, 'COMBINED');
    assert.equal(after?.combinedFreeDays, 14);
    assert.equal(after?.demurrageFreeDays, null,
      'split figures must not survive under a combined allowance');
    assert.equal(after?.demurrageLfd, null);
    assert.equal(after?.freeTimeRemarks, '14 combined calendar days from discharge');
  });

  test(`[${name}] §13: confirming free time is audited`, async () => {
    const repo = await fresh();
    const [container] = await repo.listContainersForImportJob(seeded.importJobId);
    if (!container) return;

    const before = (await repo.listAuditEvents(seeded.importJobId)).length;
    await repo.recordFreeTime(container.containerId,
      { freeTimeModel: 'SPLIT', demurrageFreeDays: 3, detentionFreeDays: 4 }, 'Sarah Lim');

    const after = await repo.listAuditEvents(seeded.importJobId);
    assert.ok(after.length > before, 'a carrier rule change must leave a record');
    assert.equal(after.at(-1)?.actor, 'Sarah Lim');
  });

  test(`[${name}] confirming free time on an unknown container fails loudly`, async () => {
    const repo = await fresh();
    await assert.rejects(
      () => repo.recordFreeTime('no-such-container', { freeTimeModel: 'SPLIT' }, 'tester'),
      /Unknown container/);
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
