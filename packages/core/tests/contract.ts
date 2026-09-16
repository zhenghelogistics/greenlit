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

  test(`[${name}] §46: a booking's containers can change after it is taken`, async () => {
    // A booking is for a number of boxes and that number changes: the shipper
    // finds another pallet, or a slot is released. Import had these three
    // commands and export did not.
    const repo = await fresh();
    const before = (await repo.listContainersForExportJob(seeded.exportJobId)).length;

    const added = await repo.addExportContainer(seeded.exportJobId,
      { sizeType: "40'HC", stuffingLocation: '8 Tuas Ave 10' }, 'Max Ng');

    assert.match(added.containerRef, /^C\d+$/);
    assert.equal(added.containerNumber, null, 'a slot before it is a container');
    assert.equal(added.sizeType, "40'HC");
    assert.equal((await repo.listContainersForExportJob(seeded.exportJobId)).length, before + 1);
  });

  test(`[${name}] §46: a released slot can be removed, a collected box cannot`, async () => {
    const repo = await fresh();
    const slot = await repo.addExportContainer(seeded.exportJobId, { sizeType: "20'GP" }, 'tester');
    await repo.removeExportContainer(slot.exportContainerId, 'tester');

    const collected = (await repo.listContainersForExportJob(seeded.exportJobId))
      .find((c) => c.containerNumber !== null);
    if (collected) {
      // By then it is a real container doing real work, not a slot.
      await assert.rejects(
        () => repo.removeExportContainer(collected.exportContainerId, 'tester'),
        /collected and cannot be removed/);
    }
  });

  test(`[${name}] §46: a released slot's reference becomes free again`, async () => {
    // Deliberately unlike a movement reference. A cancelled movement was
    // planned and may have been given to a driver, so MOV-002 must never mean
    // two things. A slot released before collection never became a container
    // and never left the booking screen, so C3 becoming free costs nothing —
    // and a high-water mark to prevent it would be machinery for a problem
    // nobody has.
    const repo = await fresh();
    const first = await repo.addExportContainer(seeded.exportJobId, { sizeType: "20'GP" }, 'tester');
    await repo.removeExportContainer(first.exportContainerId, 'tester');
    const second = await repo.addExportContainer(seeded.exportJobId, { sizeType: "20'GP" }, 'tester');
    assert.equal(second.containerRef, first.containerRef);
  });

  test(`[${name}] §11.2: the export declaration is recorded as its own event`, async () => {
    // Twenty export rules and not one mentioned the clearance, so a container
    // could be planned to the port with no declaration behind it — discovered
    // at the gate, with the box on the truck.
    const repo = await fresh();
    await repo.recordExportClearance(seeded.exportJobId, ' me1a123456b ', 'Winnie Ong');

    const job = await repo.getExportJob(seeded.exportJobId);
    assert.equal(job?.exportClearanceReference, 'ME1A123456B', 'stored in one shape');

    const trail = await repo.listAuditEvents(seeded.exportJobId);
    assert.equal(trail.at(-1)?.actor, 'Winnie Ong');
  });

  test(`[${name}] §11.2: a clearance with no reference is refused`, async () => {
    const repo = await fresh();
    await assert.rejects(
      () => repo.recordExportClearance(seeded.exportJobId, '   ', 'tester'),
      /needs its reference/);
  });

  test(`[${name}] §10: a document is kept, not read and discarded`, async () => {
    // Extraction records which page and line every value came from and then
    // threw the file away, so a controller in a demurrage dispute had a quote
    // and nothing to check it against.
    const repo = await fresh();
    const bytes = new TextEncoder().encode('%PDF-1.4 pretend arrival notice');

    const stored = await repo.storeDocument({
      jobId: seeded.importJobId,
      documentType: 'ARRIVAL_NOTICE',
      filename: 'noa.pdf',
      source: 'EMAIL',
      receivedFrom: 'sareenajoyce.swarna@one-line.com',
      extractionStatus: 'PARSED',
    }, bytes, 'Winnie Ong');

    assert.equal(stored.filename, 'noa.pdf');
    assert.equal(stored.version, 1);
    assert.equal(stored.isCurrentVersion, true);
    assert.equal(stored.byteSize, bytes.byteLength);
    assert.equal(stored.uploadedBy, 'Winnie Ong');
    assert.match(stored.storagePath, /v1-noa\.pdf$/);

    const onJob = await repo.listDocumentsForJob(seeded.importJobId);
    assert.equal(onJob.length, 1);
  });

  test(`[${name}] §10: a corrected notice supersedes rather than replaces`, async () => {
    // The job was worked off the original, and the history has to still say so.
    const repo = await fresh();
    const draft = {
      jobId: seeded.importJobId, documentType: 'ARRIVAL_NOTICE', filename: 'noa.pdf',
    };
    await repo.storeDocument(draft, new TextEncoder().encode('first'), 'tester');
    const second = await repo.storeDocument(draft, new TextEncoder().encode('corrected'), 'tester');

    const all = await repo.listDocumentsForJob(seeded.importJobId);
    assert.equal(all.length, 2, 'the original is still there');
    assert.equal(all.filter((d) => d.isCurrentVersion).length, 1,
      '"the current arrival notice" must have one answer');
    assert.equal(second.version, 2);
    assert.notEqual(all[0]?.storagePath, all[1]?.storagePath,
      'the correction cannot overwrite the file the job was worked from');
  });

  test(`[${name}] §10: a file with no name is refused`, async () => {
    const repo = await fresh();
    await assert.rejects(() => repo.storeDocument(
      { jobId: seeded.importJobId, documentType: 'OTHER', filename: '  ' },
      new Uint8Array(), 'tester'), /needs a name/);
  });

  test(`[${name}] §9.3: a customer's sites are kept, not retyped per job`, async () => {
    const repo = await fresh();
    const [customer] = await repo.listCustomers();
    if (!customer) return;

    const site = await repo.addCustomerLocation(customer.code, {
      label: 'Tuas warehouse', address: '12 Tuas Ave 10',
      doubleMountingPermitted: false, standbyUsual: true, isDefault: true,
    }, 'Max Ng');

    assert.equal(site.label, 'Tuas warehouse');
    assert.equal(site.doubleMountingPermitted, false);
    assert.equal(site.standbyUsual, true);
    assert.equal(site.isDefault, true);

    const all = await repo.listCustomerLocations(customer.code);
    assert.equal(all.length, 1);
  });

  test(`[${name}] §9.3: one default per customer, so it is never ambiguous`, async () => {
    const repo = await fresh();
    const [customer] = await repo.listCustomers();
    if (!customer) return;

    await repo.addCustomerLocation(customer.code,
      { label: 'First', address: '1 Tuas', isDefault: true }, 'tester');
    await repo.addCustomerLocation(customer.code,
      { label: 'Second', address: '2 Tuas', isDefault: true }, 'tester');

    const defaults = (await repo.listCustomerLocations(customer.code)).filter((l) => l.isDefault);
    assert.equal(defaults.length, 1, 'the second default replaces the first');
    assert.equal(defaults[0]?.label, 'Second');
  });

  test(`[${name}] §9.3: a site with no address is refused`, async () => {
    // A site nobody can be sent to, caught here rather than at seven in the
    // morning.
    const repo = await fresh();
    const [customer] = await repo.listCustomers();
    if (!customer) return;
    await assert.rejects(
      () => repo.addCustomerLocation(customer.code, { label: 'Somewhere' }, 'tester'),
      /needs an address/);
  });

  test(`[${name}] §9.3: a site is deactivated, not deleted`, async () => {
    // Old jobs point at it, and a job's history should still say where it went.
    const repo = await fresh();
    const [customer] = await repo.listCustomers();
    if (!customer) return;

    const site = await repo.addCustomerLocation(customer.code,
      { label: 'Closed site', address: '9 Tuas' }, 'tester');
    await repo.amendCustomerLocation(site.locationId, { active: false }, 'tester');

    const all = await repo.listCustomerLocations(customer.code);
    assert.equal(all.length, 1, 'still on the record');
    assert.equal(all[0]?.active, false);
  });

  test(`[${name}] §33: closing a job makes it read Completed`, async () => {
    // Completed was unreachable: the derivation passed closureSatisfied as a
    // hardcoded false, so a job finished in every respect stayed open forever
    // and the board filled with work that was done.
    const repo = await fresh();
    const before = await repo.getImportJob(seeded.importJobId);
    assert.equal(before?.closedAt, null, 'a job starts open');

    await repo.closeJob(seeded.importJobId, 'Winnie Ong');
    const after = await repo.getImportJob(seeded.importJobId);
    assert.ok(after?.closedAt, 'the closure is stored, not derived');
    assert.equal(after?.closedBy, 'Winnie Ong');
  });

  test(`[${name}] §33: closing twice is refused`, async () => {
    const repo = await fresh();
    await repo.closeJob(seeded.importJobId, 'tester');
    await assert.rejects(
      () => repo.closeJob(seeded.importJobId, 'tester'), /already closed/);
  });

  test(`[${name}] §33.2: reopening clears the closure and records why`, async () => {
    // The only record of why an invoice moved.
    const repo = await fresh();
    await repo.closeJob(seeded.importJobId, 'Winnie Ong');
    await repo.reopenJob(seeded.importJobId,
      'Detention was billed at 4 days, carrier says 6', 'Mei Chen');

    const after = await repo.getImportJob(seeded.importJobId);
    assert.equal(after?.closedAt, null);
    assert.equal(after?.closedBy, null);

    const trail = await repo.listAuditEvents(seeded.importJobId);
    const entry = trail.at(-1);
    assert.equal(entry?.actor, 'Mei Chen');
    assert.match(String(entry?.newValue), /carrier says 6/);
  });

  test(`[${name}] §33.2: reopening a job that is not closed is refused`, async () => {
    const repo = await fresh();
    await assert.rejects(
      () => repo.reopenJob(seeded.importJobId, 'A perfectly good reason', 'tester'),
      /not closed/);
  });

  test(`[${name}] §29: a container added to a job stays added`, async () => {
    // The screen added, edited and removed containers in React state and wrote
    // nothing down — and containers carry the free-time clocks, so the thing
    // being lost was the deadline.
    const repo = await fresh();
    const before = (await repo.listContainersForImportJob(seeded.importJobId)).length;

    const added = await repo.addContainerToJob(seeded.importJobId, {
      containerNumber: 'TEMU7203610', sizeType: "40'HC", sealNumber: 'SEAL123',
    }, 'Max Ng');

    assert.equal(added.containerNumber, 'TEMU7203610');
    assert.equal((await repo.listContainersForImportJob(seeded.importJobId)).length, before + 1);
  });

  test(`[${name}] §29: a container's details can be corrected`, async () => {
    const repo = await fresh();
    const [container] = await repo.listContainersForImportJob(seeded.importJobId);
    if (!container) return;

    await repo.amendContainer(container.containerId,
      { sealNumber: 'CORRECTED-SEAL', grossWeight: 21500 }, 'Sarah Lim');

    const after = (await repo.listContainersForImportJob(seeded.importJobId))
      .find((c) => c.containerId === container.containerId);
    assert.equal(after?.sealNumber, 'CORRECTED-SEAL');
    assert.equal(Number(after?.grossWeight), 21500);
  });

  test(`[${name}] §29: a container entered twice can be removed`, async () => {
    const repo = await fresh();
    const added = await repo.addContainerToJob(seeded.importJobId,
      { containerNumber: 'DUPE1234567' }, 'tester');
    const before = (await repo.listContainersForImportJob(seeded.importJobId)).length;

    await repo.removeContainerFromJob(added.containerId, 'tester');
    assert.equal((await repo.listContainersForImportJob(seeded.importJobId)).length, before - 1);
  });

  test(`[${name}] §29: a container that has moved cannot be removed`, async () => {
    // By then it is part of what happened to the job, and deleting it would
    // remove the record of work that was really done.
    const repo = await fresh();
    const added = await repo.addContainerToJob(seeded.importJobId,
      { containerNumber: 'MOVED1234567' }, 'tester');
    await repo.createMovement({
      jobId: seeded.importJobId, containerId: added.containerId,
      movementType: 'IMPORT_DELIVERY',
      origin: 'PSA', originType: 'TERMINAL',
      destination: 'Customer', destinationType: 'CUSTOMER',
    }, 'tester');

    await assert.rejects(
      () => repo.removeContainerFromJob(added.containerId, 'tester'),
      /movements against it/);
  });

  test(`[${name}] §18: a movement can be planned, and it stays planned`, async () => {
    // The engine has rules about movements being overdue and the role model
    // has five movement permissions; until now the port could only read them,
    // so planning a trip rewrote a copy in the browser and persisted nothing.
    const repo = await fresh();
    const movement = await repo.createMovement({
      jobId: seeded.importJobId,
      movementType: 'IMPORT_DELIVERY',
      origin: 'PSA Pasir Panjang', originType: 'TERMINAL',
      destination: '47 Jalan Buroh', destinationType: 'CUSTOMER',
      plannedDate: '2026-09-20',
    }, 'Max Ng');

    assert.match(movement.movementRef, /^MOV-\d{3}$/);
    // PENDING, the first value of MOVEMENT_STATUS — I had invented 'PLANNED',
    // which is not in the enum at all.
    assert.equal(movement.movementStatus, 'PENDING');

    const onJob = await repo.listMovementsForJob(seeded.importJobId);
    assert.ok(onJob.some((m) => m.movementId === movement.movementId),
      'it survives the write it was created by');
  });

  test(`[${name}] §18: a reference is never reused after a cancellation`, async () => {
    // The next number comes from the highest ever issued, not from how many
    // are currently alive — otherwise cancelling MOV-002 and planning again
    // would produce a second MOV-002, and two rows in the history would claim
    // the same name.
    const repo = await fresh();
    const draft = {
      jobId: seeded.importJobId, movementType: 'IMPORT_DELIVERY',
      origin: 'PSA', originType: 'TERMINAL',
      destination: 'Customer', destinationType: 'CUSTOMER',
    };
    const first = await repo.createMovement(draft, 'tester');
    const second = await repo.createMovement(draft, 'tester');
    await repo.cancelMovement(second.movementId, 'Customer rescheduled', 'tester');
    const third = await repo.createMovement(draft, 'tester');

    assert.notEqual(third.movementRef, second.movementRef);
    assert.notEqual(third.movementRef, first.movementRef);
  });

  test(`[${name}] §18.4: cancelling keeps the movement and its reason`, async () => {
    const repo = await fresh();
    const movement = await repo.createMovement({
      jobId: seeded.importJobId, movementType: 'IMPORT_DELIVERY',
      origin: 'PSA', originType: 'TERMINAL',
      destination: 'Customer', destinationType: 'CUSTOMER',
    }, 'tester');

    await repo.cancelMovement(movement.movementId, 'Customer rescheduled', 'Sarah Lim');
    const after = (await repo.listMovementsForJob(seeded.importJobId))
      .find((m) => m.movementId === movement.movementId);

    assert.equal(after?.movementStatus, 'CANCELLED', 'cancelled, not deleted');
    assert.equal(after?.cancelledReason, 'Customer rescheduled');
  });

  test(`[${name}] §18.4: a cancellation without a reason is refused`, async () => {
    const repo = await fresh();
    const movement = await repo.createMovement({
      jobId: seeded.importJobId, movementType: 'IMPORT_DELIVERY',
      origin: 'PSA', originType: 'TERMINAL',
      destination: 'Customer', destinationType: 'CUSTOMER',
    }, 'tester');
    await assert.rejects(
      () => repo.cancelMovement(movement.movementId, '   ', 'tester'), /needs a reason/);
  });

  test(`[${name}] §19: scheduling and §20 progress are separate claims`, async () => {
    // A plan is an intention that can move; an outcome is a fact about the
    // past that should not. Keeping them apart is why there are two methods.
    const repo = await fresh();
    const movement = await repo.createMovement({
      jobId: seeded.importJobId, movementType: 'IMPORT_DELIVERY',
      origin: 'PSA', originType: 'TERMINAL',
      destination: 'Customer', destinationType: 'CUSTOMER',
    }, 'tester');

    await repo.scheduleMovement(movement.movementId,
      { plannedDate: '2026-09-21', driver: 'Tan BM', truck: 'XD1234A' }, 'tester');
    await repo.recordMovementProgress(movement.movementId,
      { movementStatus: 'COMPLETED', actualDeliveryAt: '2026-09-21T14:30:00+08:00' }, 'tester');

    const after = (await repo.listMovementsForJob(seeded.importJobId))
      .find((m) => m.movementId === movement.movementId);
    assert.equal(after?.driver, 'Tan BM');
    assert.equal(after?.plannedDate, '2026-09-21');
    assert.equal(after?.movementStatus, 'COMPLETED');
  });

  test(`[${name}] §18: acting on an unknown movement fails loudly`, async () => {
    const repo = await fresh();
    await assert.rejects(
      () => repo.scheduleMovement('no-such', { driver: 'X' }, 'tester'), /Unknown movement/);
    await assert.rejects(
      () => repo.cancelMovement('no-such', 'reason', 'tester'), /Unknown movement/);
  });

  test(`[${name}] §30: a job can be corrected after it is created`, async () => {
    // Creation is not the only moment a job is described. Until this existed
    // the screen let someone type a correction, showed it, and persisted
    // nothing — it survived until the next reload.
    const repo = await fresh();
    await repo.amendJob(seeded.importJobId, {
      vesselName: 'AMENDED VESSEL',
      voyageNumber: '999X',
      houseBlNumber: 'HBL-LATE-ARRIVAL',
    }, 'Max Ng');

    const job = await repo.getImportJob(seeded.importJobId);
    assert.equal(job?.vesselName, 'AMENDED VESSEL');
    assert.equal(job?.voyageNumber, '999X');
    assert.equal(job?.houseBlNumber, 'HBL-LATE-ARRIVAL');
  });

  test(`[${name}] §30: absent leaves a field alone, null erases it`, async () => {
    // The distinction that matters. A field the caller did not mention must
    // not be cleared because it was not mentioned, and a house bill that turns
    // out not to exist must be erasable.
    const repo = await fresh();
    await repo.amendJob(seeded.importJobId, { houseBlNumber: 'HBL-1' }, 'tester');

    await repo.amendJob(seeded.importJobId, { vesselName: 'OTHER' }, 'tester');
    assert.equal((await repo.getImportJob(seeded.importJobId))?.houseBlNumber, 'HBL-1',
      'unmentioned is not erased');

    await repo.amendJob(seeded.importJobId, { houseBlNumber: null }, 'tester');
    assert.equal((await repo.getImportJob(seeded.importJobId))?.houseBlNumber, null,
      'null is a deliberate erasure');
  });

  test(`[${name}] §13: every amendment names who made it and what moved`, async () => {
    const repo = await fresh();
    const before = (await repo.listAuditEvents(seeded.importJobId)).length;
    await repo.amendJob(seeded.importJobId, { vesselName: 'AMENDED VESSEL' }, 'Sarah Lim');

    const after = await repo.listAuditEvents(seeded.importJobId);
    assert.ok(after.length > before);
    const entry = after.at(-1);
    assert.equal(entry?.actor, 'Sarah Lim');
    assert.equal(entry?.field, 'vesselName');
    assert.equal(entry?.newValue, 'AMENDED VESSEL');
  });

  test(`[${name}] §30: amending nothing records nothing`, async () => {
    // Saving a form without changing anything is not an event, and an audit
    // trail full of them is one nobody reads.
    const repo = await fresh();
    const job = await repo.getImportJob(seeded.importJobId);
    const before = (await repo.listAuditEvents(seeded.importJobId)).length;

    await repo.amendJob(seeded.importJobId, { vesselName: job?.vesselName ?? null }, 'tester');
    assert.equal((await repo.listAuditEvents(seeded.importJobId)).length, before);
  });

  test(`[${name}] §30: amending an unknown job fails loudly`, async () => {
    const repo = await fresh();
    await assert.rejects(
      () => repo.amendJob('no-such-job', { vesselName: 'X' }, 'tester'), /Unknown job/);
  });

  test(`[${name}] §24: a permit is held at job level and covers containers by reference`, async () => {
    const repo = await fresh();
    const containers = await repo.listContainersForImportJob(seeded.importJobId);
    if (containers.length < 2) return;

    const permit = await repo.recordPermit(seeded.importJobId, {
      permitNumber: 'IG6I728642H',
      expiryDate: '2026-09-30',
      permitVesselVoyage: 'CALLAO BRIDGE / 256S',
      fileName: 'permit.pdf',
      containerIds: [containers[0]!.containerId],
    }, 'tester');

    assert.equal(permit.permitNumber, 'IG6I728642H');
    assert.deepEqual(permit.linkedContainerIds, [containers[0]!.containerId]);

    const onJob = await repo.listPermitsForJob(seeded.importJobId);
    assert.equal(onJob.length, 1, 'the permit belongs to the job, not to the container');
  });

  test(`[${name}] §24: allocation replaces, so unticking a container uncovers it`, async () => {
    // "Copy to selected" states the whole relationship. An add-only call could
    // never express a container the controller has just removed.
    const repo = await fresh();
    const containers = await repo.listContainersForImportJob(seeded.importJobId);
    if (containers.length < 2) return;
    const [a, b] = containers;

    const permit = await repo.recordPermit(seeded.importJobId,
      { permitNumber: 'IG6I728642H', containerIds: [a!.containerId, b!.containerId] }, 'tester');
    assert.equal(permit.linkedContainerIds.length, 2);

    await repo.linkPermitToContainers(permit.permitId, [b!.containerId], 'tester');
    const after = (await repo.listPermitsForJob(seeded.importJobId))[0];
    assert.deepEqual(after?.linkedContainerIds, [b!.containerId],
      'the unticked container must stop being covered');
  });

  test(`[${name}] §24: one container can be covered by more than one permit`, async () => {
    // The many-to-many case a permit_number column on the container could not
    // express, and the reason the link table exists.
    const repo = await fresh();
    const containers = await repo.listContainersForImportJob(seeded.importJobId);
    if (containers.length < 1) return;
    const shared = containers[0]!.containerId;

    await repo.recordPermit(seeded.importJobId,
      { permitNumber: 'IG6I728642H', containerIds: [shared] }, 'tester');
    await repo.recordPermit(seeded.importJobId,
      { permitNumber: 'ME1A123456B', containerIds: [shared] }, 'tester');

    const permits = await repo.listPermitsForJob(seeded.importJobId);
    assert.equal(permits.length, 2);
    assert.ok(permits.every((p) => p.linkedContainerIds.includes(shared)));
  });

  test(`[${name}] §24: a permit can arrive before anyone has decided what it covers`, async () => {
    const repo = await fresh();
    const permit = await repo.recordPermit(seeded.importJobId,
      { permitNumber: 'IG6I728642H' }, 'tester');
    assert.deepEqual(permit.linkedContainerIds, [],
      'untagged is a real state, not a missing one');
  });

  test(`[${name}] §24: permit numbers are stored in one shape`, async () => {
    const repo = await fresh();
    const permit = await repo.recordPermit(seeded.importJobId,
      { permitNumber: ' ig6i-728642 h ' }, 'tester');
    assert.equal(permit.permitNumber, 'IG6I728642H');
  });

  test(`[${name}] §24: removing a permit leaves the job and its containers intact`, async () => {
    const repo = await fresh();
    const containers = await repo.listContainersForImportJob(seeded.importJobId);
    if (containers.length < 1) return;

    const permit = await repo.recordPermit(seeded.importJobId,
      { permitNumber: 'IG6I728642H', containerIds: [containers[0]!.containerId] }, 'tester');
    await repo.removePermit(permit.permitId, 'tester');

    assert.deepEqual(await repo.listPermitsForJob(seeded.importJobId), []);
    assert.equal((await repo.listContainersForImportJob(seeded.importJobId)).length,
      containers.length, 'the containers it covered still exist');
  });

  test(`[${name}] §24: permits for several jobs come back in one read`, async () => {
    const repo = await fresh();
    await repo.recordPermit(seeded.importJobId, { permitNumber: 'IG6I728642H' }, 'tester');
    const grouped = await repo.listPermitsForJobs([seeded.importJobId, 'no-such-job']);
    assert.equal(grouped.length, 1, 'a job with no permits contributes no group');
    assert.equal(grouped[0]?.jobId, seeded.importJobId);
  });

  test(`[${name}] §24: acting on an unknown permit fails loudly`, async () => {
    const repo = await fresh();
    await assert.rejects(() => repo.removePermit('no-such-permit', 'tester'), /Unknown permit/);
    await assert.rejects(
      () => repo.linkPermitToContainers('no-such-permit', [], 'tester'), /Unknown permit/);
  });

  test(`[${name}] §7.1: removing someone leaves the history that names them`, async () => {
    // Deletion is safe because §13 stores the actor as text, not as a link to
    // this row. I refused to build removal on the grounds that it would orphan
    // the trail; the schema says otherwise, and this is the assertion that
    // says so out loud.
    const repo = await fresh();
    const victim = await repo.ensurePrincipal('temp@zhenghe.com.sg', 'Temp Person', 'OPERATIONS');
    await repo.removePrincipal(victim.userId, 'Max Ng');

    assert.equal(await repo.getPrincipal(victim.userId), null);
    assert.equal(await repo.getPrincipalByEmail('temp@zhenghe.com.sg'), null);

    const trail = await repo.listAuditEvents(victim.userId);
    assert.ok(trail.length > 0, 'the removal itself is recorded');
    assert.equal(trail.at(-1)?.actor, 'Max Ng', 'attributed to whoever did it');
  });

  test(`[${name}] §7.1: the last administrator cannot be removed`, async () => {
    // There would be nobody left who could add one, and the directory would
    // be frozen for good.
    const repo = await fresh();
    const admins = (await repo.listPrincipals())
      .filter((p) => p.role === 'ADMINISTRATOR' && p.active);
    for (const admin of admins.slice(1)) await repo.removePrincipal(admin.userId, 'tester');

    const last = (await repo.listPrincipals())
      .find((p) => p.role === 'ADMINISTRATOR' && p.active);
    if (!last) return;
    await assert.rejects(() => repo.removePrincipal(last.userId, 'tester'),
      /last administrator/);
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
