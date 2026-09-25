import { canSendContainerDetails, refuseEmptyCollection,
  suggestedUserId, suggestedDisplayName, normalisePermitNumber, locationProblem,
  documentProblem, storagePathFor, type DocumentRecord,
  type PermitRecord } from '@greenlit/engine';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  appendAmendment, nextJobReference, recordChassisChange, userEvent,
  validateContainerCount,
  validateCustomerDraft,
  type AuditEvent, type Chassis, type ChassisChange, type ChassisChangeRequest,
  type ChassisHolding, type Customer, type CustomerDraft, type DateAmendment,
  type Discrepancy, type ExceptionRecord, type ExportContainer, type ExportJob,
  type ImportContainer, type ImportJob, type Movement, type Principal,
  type Thresholds,
} from '@greenlit/engine';
import {
  DEFAULT_THRESHOLDS,
  type DateAmendmentInput, type ExportJobDraft, type ImportJobDraft,
  type Repository, type StoredDiscrepancy,
} from '@greenlit/core';
import {
  holdingFrom, toChassis, toChassisChange, toCustomer, toDateAmendment,
  toException, toExportContainer, toExportJob, toImportContainer, toImportJob,
  toCustomerLocation, toMovement, toPrincipal, nn } from './rows.ts';

/**
 * Supabase implementation of the Repository port.
 *
 * ADR-0001 predicted this would be one new file and no other change. It is.
 * The 22 contract tests in @greenlit/core are written against the interface,
 * not against the in-memory adapter, so this passing them is what makes
 * "storage is swappable" a verified claim rather than an architectural hope.
 *
 * Uses the service role key: every call arrives through an API route that has
 * already resolved a principal and checked permissions (§7, §14.1), so row
 * level security would be checking a claim nobody made. Nothing here is
 * reachable from a browser.
 */
export interface SupabaseRepositoryOptions {
  url: string;
  serviceRoleKey: string;
}

/** Supabase returns { data, error }; a failed query must not read as empty. */
function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${what}: no data returned`);
  return result.data;
}

const rows = (r: { data: unknown[] | null; error: { message: string } | null }, what: string) =>
  unwrap(r, what) as Record<string, unknown>[];

export function createSupabaseRepository(options: SupabaseRepositoryOptions): Repository {
  // §10. The same client's file storage. Named separately because the two are
  // different stores with different failure modes, and a reader should see
  // which one a line is talking to.
  const storage = (() => {
    const client: SupabaseClient = createClient(options.url, options.serviceRoleKey, {
      auth: { persistSession: false },
    });
    return client.storage;
  })();

  const db: SupabaseClient = createClient(options.url, options.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** §13. Every command leaves one of these; there is no update or delete. */
  /**
   * Which table a job lives in.
   *
   * An id is unique across both, so this asks rather than making every caller
   * say which domain it is. A closure, like patchMovement, because db is
   * already in scope here and typing it at module level was fighting the
   * client's generics for nothing.
   */
  const locateJob = async (jobId: string) => {
    const asImport = await db.from('import_jobs').select('*')
      .eq('job_id', jobId).maybeSingle();
    if (asImport.error) throw new Error(`job lookup: ${asImport.error.message}`);
    if (asImport.data) {
      return { table: 'import_jobs', key: 'job_id', row: asImport.data as Record<string, unknown> };
    }

    const asExport = await db.from('export_jobs').select('*')
      .eq('export_job_id', jobId).maybeSingle();
    if (asExport.error) throw new Error(`job lookup: ${asExport.error.message}`);
    if (!asExport.data) throw new Error(`Unknown job ${jobId}`);
    return {
      table: 'export_jobs', key: 'export_job_id',
      row: asExport.data as Record<string, unknown>,
    };
  };

  /**
   * The shared write path for the three movement commands.
   *
   * Absent means leave alone; every change that actually moves something is
   * audited against the job it belongs to, because §13 asks who did it and a
   * movement without its job is an event nobody can find.
   */
  const patchMovement = async (
    movementId: string,
    changes: Record<string, unknown>,
    event: string,
    actor: string,
  ): Promise<void> => {
    const found = await db.from('movements').select('*')
      .eq('movement_id', movementId).maybeSingle();
    if (found.error) throw new Error(`movement lookup: ${found.error.message}`);
    if (!found.data) throw new Error(`Unknown movement ${movementId}`);

    const before = found.data as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const changed: Array<{ field: string; from: unknown; to: unknown }> = [];

    for (const [field, to] of Object.entries(changes)) {
      if (to === undefined) continue;
      const column = camelToSnake(field);
      const from = before[column] ?? null;
      if (String(from ?? '') === String(to ?? '')) continue;
      patch[column] = to;
      changed.push({ field, from, to });
    }
    if (changed.length === 0) return;

    unwrap(await db.from('movements').update(patch)
      .eq('movement_id', movementId).select().single(), 'update movement');
    for (const c of changed) await record(before.job_id as string, event, actor, c);
  };

  const record = async (
    entityId: string, event: string, actor: string,
    change: { field?: string; from?: unknown; to?: unknown } = {},
    entityType: 'job' | 'container' = 'job',
  ) => {
    const e = userEvent({
      event, entityType, entityId,
      field: change.field ?? null,
      previousValue: change.from,
      newValue: change.to,
    }, actor, new Date().toISOString());
    const { error } = await db.from('audit_events').insert({
      event: e.event, entity_type: e.entityType, entity_id: e.entityId,
      field: e.field, previous_value: e.previousValue, new_value: e.newValue,
      actor: e.actor, source: e.source, rule: e.rule, created_at: e.createdAt,
    });
    if (error) throw new Error(`audit: ${error.message}`);
  };

  const jobOfExportContainer = async (containerId: string): Promise<string> => {
    const r = await db.from('export_containers').select('export_job_id')
      .eq('export_container_id', containerId).maybeSingle();
    if (r.error) throw new Error(`container lookup: ${r.error.message}`);
    if (!r.data) {
      // Container ready, VGM and identity capture are export commands: they
      // record that a shipper has stuffed and weighed a box. An import
      // container has no equivalent — §36.3's empty-ready confirmation is a
      // different event. Saying "unknown" sends the caller looking for a
      // missing record instead of telling them the command does not apply.
      const asImport = await db.from('containers').select('container_number,job_id')
        .eq('container_id', containerId).maybeSingle();
      throw new Error(asImport.data
        ? `This is an import container (${asImport.data.container_number ?? containerId}). Container ready and VGM are export commands.`
        : `Unknown container ${containerId}`);
    }
    return r.data.export_job_id as string;
  };

  /**
   * §6. The next job number for a customer, issued by the database.
   *
   * Not computed from a read. nextJobReference takes the highest reference it
   * can see and adds one, so two jobs created at the same moment ask for the
   * same number and the unique constraint refuses them both — submitting ten
   * notices at once failed almost entirely.
   *
   * next_job_sequence increments a per-customer counter in one statement. The
   * row lock is what makes ten concurrent callers take ten different numbers.
   */
  const issueJobNumber = async (customerCode: string): Promise<string> => {
    const code = customerCode.trim().toUpperCase();
    const r = await db.rpc('next_job_sequence', { p_customer_code: code });
    if (r.error) throw new Error(`issue job number: ${r.error.message}`);
    return `${code}-${String(r.data).padStart(3, '0')}`;
  };

  const issuedReferences = async (): Promise<string[]> => {
    const [imp, exp] = await Promise.all([
      db.from('import_jobs').select('job_number'),
      db.from('export_jobs').select('job_number'),
    ]);
    return [
      ...rows(imp, 'import job numbers').map((r) => r.job_number as string),
      ...rows(exp, 'export job numbers').map((r) => r.job_number as string),
    ];
  };

  return {
    // ---- reads ----
    async listImportJobs() {
      return rows(await db.from('import_jobs').select('*').order('created_at'), 'import jobs')
        .map(toImportJob);
    },
    async getImportJob(jobId) {
      const r = await db.from('import_jobs').select('*').eq('job_id', jobId).maybeSingle();
      if (r.error) throw new Error(`import job: ${r.error.message}`);
      return r.data ? toImportJob(r.data) : null;
    },
    async listExportJobs() {
      return rows(await db.from('export_jobs').select('*').order('created_at'), 'export jobs')
        .map(toExportJob);
    },
    async getExportJob(jobId) {
      const r = await db.from('export_jobs').select('*').eq('export_job_id', jobId).maybeSingle();
      if (r.error) throw new Error(`export job: ${r.error.message}`);
      return r.data ? toExportJob(r.data) : null;
    },
    async listContainersForImportJob(jobId) {
      // Ordered, because unordered means a different order each read: the
      // containers on a job reshuffled between loads, and "the first
      // container" meant a different box each time it was asked for.
      return rows(
        await db.from('containers').select('*').eq('job_id', jobId).order('container_id'),
        'containers',
      ).map(toImportContainer);
    },
    async listContainersForExportJob(jobId) {
      return rows(
        await db.from('export_containers').select('*').eq('export_job_id', jobId).order('container_ref'),
        'export containers',
      ).map(toExportContainer);
    },
    async listMovementsForJob(jobId) {
      return rows(
        await db.from('movements').select('*').eq('job_id', jobId).order('movement_ref'),
        'movements',
      ).map(toMovement);
    },
    async listOpenExceptionsForJob(jobId) {
      return rows(
        await db.from('exceptions').select('*').eq('job_id', jobId).is('resolved_at', null),
        'exceptions',
      ).map(toException) as ExceptionRecord[];
    },

    // Batched reads. One request each instead of one per job: deriving a board
    // of eleven jobs made thirty-three round trips, which is the dominant cost
    // when the database is a region away from the server.
    async listContainersForImportJobs(jobIds) {
      if (jobIds.length === 0) return [];
      return rows(
        await db.from('containers').select('*').in('job_id', [...jobIds]).order('container_id'),
        'containers',
      ).map(toImportContainer);
    },
    async listContainersForExportJobs(jobIds) {
      if (jobIds.length === 0) return [];
      return rows(
        await db.from('export_containers').select('*')
          .in('export_job_id', [...jobIds]).order('container_ref'),
        'export containers',
      ).map(toExportContainer);
    },
    async listMovementsForJobs(jobIds) {
      if (jobIds.length === 0) return [];
      return rows(
        await db.from('movements').select('*').in('job_id', [...jobIds]).order('movement_ref'),
        'movements',
      ).map(toMovement);
    },
    async listOpenExceptionsForJobs(jobIds) {
      if (jobIds.length === 0) return [];
      return rows(
        await db.from('exceptions').select('*').in('job_id', [...jobIds]).is('resolved_at', null),
        'exceptions',
      ).map(toException) as ExceptionRecord[];
    },

    async getThresholds(customerId) {
      // '*' is the global scope; a customer row overrides it for that key.
      const r = await db.from('config_thresholds').select('*')
        .in('customer_id', ['*', customerId ?? '*']);
      if (r.error) return { ...DEFAULT_THRESHOLDS };
      const merged: Record<string, number> = { ...DEFAULT_THRESHOLDS };
      for (const row of (r.data ?? []).sort(
        (a, b) => (a.customer_id === '*' ? 0 : 1) - (b.customer_id === '*' ? 0 : 1),
      )) {
        merged[row.threshold_key as string] = Number(row.value);
      }
      return merged as unknown as Thresholds;
    },

    async listCustomers() {
      return rows(await db.from('customers').select('*').order('company_name'), 'customers')
        .map(toCustomer);
    },
    async getCustomerByCode(code) {
      const r = await db.from('customers').select('*')
        .eq('code', code.trim().toUpperCase()).maybeSingle();
      if (r.error) throw new Error(`customer: ${r.error.message}`);
      return r.data ? toCustomer(r.data) : null;
    },
    async createCustomer(draft: CustomerDraft, actor) {
      const existing = rows(await db.from('customers').select('*'), 'customers').map(toCustomer);
      const validation = validateCustomerDraft(draft, existing);
      if (!validation.valid) throw new Error(validation.reasons.join('; '));

      const row = {
        customer_id: draft.code.trim().toLowerCase(),
        code: draft.code.trim().toUpperCase(),
        company_name: draft.companyName.trim(),
        short_name: draft.shortName ?? null,
        email_domains: [...(draft.emailDomains ?? [])],
        account_status: 'ACTIVE',
      };
      const created = unwrap(
        await db.from('customers').insert(row).select().single(),
        'create customer',
      ) as Record<string, unknown>;
      await record(row.customer_id, 'job.created', actor,
        { field: 'customer', to: `${row.code} ${row.company_name}` });
      return toCustomer(created);
    },
    async listJobReferences() { return issuedReferences(); },
    async nextReferenceFor(customerCode) {
      // Read-only: what the next number would be, without taking it. Creation
      // uses issueJobNumber, which actually reserves one.
      return nextJobReference(await issuedReferences(), customerCode);
    },

    async getPrincipal(userId) {
      const r = await db.from('principals').select('*').eq('user_id', userId).maybeSingle();
      if (r.error) throw new Error(`principal: ${r.error.message}`);
      return r.data ? toPrincipal(r.data) : null;
    },
    async ensurePrincipal(email, displayName, role) {
      const address = email.trim().toLowerCase();
      const found = await this.getPrincipalByEmail(address);
      if (found) return found;

      // The username is derived and made unique here, because only the store
      // can see what already exists. The loop terminates because each attempt
      // is a distinct candidate and a taken one is a unique-violation, not a
      // silent overwrite.
      const base = suggestedUserId(address);
      const taken = new Set((await this.listPrincipals()).map((p) => p.userId));
      let userId = base;
      for (let n = 2; taken.has(userId); n += 1) userId = `${base}${n}`;

      const row = unwrap(await db.from('principals').insert({
        user_id: userId,
        display_name: displayName.trim() || suggestedDisplayName(address),
        role,
        email: address,
        active: true,
        extra_permissions: [],
      }).select().single(), 'register principal') as Record<string, unknown>;

      await record(userId, 'user.registered', row.display_name as string,
        { field: 'role', from: null, to: role });
      return toPrincipal(row);
    },

    async upsertPrincipal(draft, actor) {
      const before = await this.getPrincipal(draft.userId);
      const row = unwrap(await db.from('principals').upsert({
        user_id: draft.userId,
        display_name: draft.displayName,
        role: draft.role,
        email: draft.email ?? null,
        active: before?.active ?? true,
        extra_permissions: before?.extraPermissions ?? [],
      }, { onConflict: 'user_id' }).select().single(), 'upsert principal') as Record<string, unknown>;

      await record(draft.userId, before ? 'user.updated' : 'user.created', actor,
        { field: 'role', from: before?.role ?? null, to: draft.role });
      return toPrincipal(row);
    },
    async changePrincipalAccess(userId, active, actor) {
      const before = await this.getPrincipal(userId);
      if (!before) throw new Error(`Unknown user ${userId}`);
      unwrap(await db.from('principals').update({ active })
        .eq('user_id', userId).select().single(), 'set principal active');
      await record(userId, active ? 'user.reactivated' : 'user.deactivated', actor,
        { field: 'active', from: String(before.active), to: String(active) });
    },
    async addContainerToJob(jobId, draft, actor) {
      const onJob = rows(
        await db.from('containers').select('container_id').eq('job_id', jobId), 'containers');
      validateContainerCount(onJob.length + 1);

      const containerId = `${jobId}-c${onJob.length + 1}`;
      const row = unwrap(await db.from('containers').insert({
        container_id: containerId,
        job_id: jobId,
        container_number: draft.containerNumber ?? null,
        container_size: draft.sizeType ?? null,
        seal_number: draft.sealNumber ?? null,
        gross_weight: draft.grossWeight ?? null,
        package_count: draft.packageCount ?? null,
        package_type: draft.packageType ?? null,
        free_time_model: draft.freeTimeModel ?? 'NOT_CONFIRMED',
        demurrage_free_days: draft.demurrageFreeDays ?? null,
        detention_free_days: draft.detentionFreeDays ?? null,
        combined_free_days: draft.combinedFreeDays ?? null,
      }).select().single(), 'add container') as Record<string, unknown>;

      await record(jobId, 'container.added', actor,
        { field: 'containerNumber', from: null, to: draft.containerNumber ?? null });
      return toImportContainer(row);
    },

    async amendContainer(containerId, changes, actor) {
      const found = await db.from('containers').select('*')
        .eq('container_id', containerId).maybeSingle();
      if (found.error) throw new Error(`container lookup: ${found.error.message}`);
      if (!found.data) throw new Error(`Unknown container ${containerId}`);

      const before = found.data as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      const changed: Array<{ field: string; from: unknown; to: unknown }> = [];
      for (const [field, to] of Object.entries(changes)) {
        if (to === undefined) continue;
        const column = camelToSnake(field);
        const from = before[column] ?? null;
        if (String(from ?? '') === String(to ?? '')) continue;
        patch[column] = to;
        changed.push({ field, from, to });
      }
      if (changed.length === 0) return;

      unwrap(await db.from('containers').update(patch)
        .eq('container_id', containerId).select().single(), 'amend container');
      for (const c of changed) {
        await record(before.job_id as string, 'container.amended', actor, c);
      }
    },

    async removeContainerFromJob(containerId, actor) {
      const found = await db.from('containers').select('job_id,container_number')
        .eq('container_id', containerId).maybeSingle();
      if (found.error) throw new Error(`container lookup: ${found.error.message}`);
      if (!found.data) throw new Error(`Unknown container ${containerId}`);

      // Refused once anything has happened to it: by then it is part of the
      // job's history, and deleting it would remove the record of real work.
      const moved = rows(await db.from('movements').select('movement_id')
        .eq('container_id', containerId), 'movements');
      if (moved.length > 0) {
        throw new Error('That container has movements against it and cannot be removed');
      }

      unwrap(await db.from('containers').delete()
        .eq('container_id', containerId).select().single(), 'remove container');
      await record(found.data.job_id as string, 'container.removed', actor,
        { field: 'containerNumber', from: found.data.container_number as string, to: null });
    },

    async recordExportClearance(jobId, reference, actor) {
      if (!reference.trim()) throw new Error('An export clearance needs its reference');
      const found = await db.from('export_jobs').select('export_clearance_reference')
        .eq('export_job_id', jobId).maybeSingle();
      if (found.error) throw new Error(`job lookup: ${found.error.message}`);
      if (!found.data) throw new Error(`Unknown job ${jobId}`);

      const to = reference.trim().toUpperCase();
      unwrap(await db.from('export_jobs').update({ export_clearance_reference: to })
        .eq('export_job_id', jobId).select().single(), 'record export clearance');
      await record(jobId, 'export.clearance.recorded', actor, {
        field: 'exportClearanceReference',
        from: found.data.export_clearance_reference ?? null,
        to,
      });
    },

    async addExportContainer(jobId, draft, actor) {
      const onJob = rows(
        await db.from('export_containers').select('container_ref').eq('export_job_id', jobId),
        'export containers',
      );
      validateContainerCount(onJob.length + 1);

      // §46. C1, C2 within the job. Reused after a release, unlike a movement
      // reference: a slot released before collection never became a container
      // and never left this screen, whereas a cancelled movement was planned
      // and may have been given to a driver.
      const highest = onJob.reduce((best, r) => {
        const n = Number(String(r.container_ref).replace(/\D/g, '') || 0);
        return Math.max(best, n);
      }, 0);
      const ref = `C${highest + 1}`;

      const row = unwrap(await db.from('export_containers').insert({
        export_container_id: `${jobId}-c${highest + 1}`,
        export_job_id: jobId,
        container_ref: ref,
        size_type: draft.sizeType,
        is_reefer: draft.isReefer ?? false,
        temperature_mode: draft.temperatureMode ?? null,
        temperature_setpoint_c: draft.temperatureSetpointC ?? null,
        stuffing_location: draft.stuffingLocation ?? null,
      }).select().single(), 'add export container') as Record<string, unknown>;

      await record(jobId, 'export.container.added', actor,
        { field: 'containerRef', from: null, to: ref });
      return toExportContainer(row);
    },

    async amendExportContainer(exportContainerId, changes, actor) {
      const found = await db.from('export_containers').select('*')
        .eq('export_container_id', exportContainerId).maybeSingle();
      if (found.error) throw new Error(`container lookup: ${found.error.message}`);
      if (!found.data) throw new Error(`Unknown container ${exportContainerId}`);

      const before = found.data as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      const changed: Array<{ field: string; from: unknown; to: unknown }> = [];
      for (const [field, to] of Object.entries(changes)) {
        if (to === undefined) continue;
        const column = camelToSnake(field);
        const from = before[column] ?? null;
        if (String(from ?? '') === String(to ?? '')) continue;
        patch[column] = to;
        changed.push({ field, from, to });
      }
      if (changed.length === 0) return;

      unwrap(await db.from('export_containers').update(patch)
        .eq('export_container_id', exportContainerId).select().single(), 'amend export container');
      for (const c of changed) {
        await record(before.export_job_id as string, 'export.container.amended', actor, c);
      }
    },

    async removeExportContainer(exportContainerId, actor) {
      const found = await db.from('export_containers')
        .select('export_job_id,container_ref,container_number')
        .eq('export_container_id', exportContainerId).maybeSingle();
      if (found.error) throw new Error(`container lookup: ${found.error.message}`);
      if (!found.data) throw new Error(`Unknown container ${exportContainerId}`);

      // Refused once the box has been collected: by then it is a real
      // container doing real work, not a slot on a booking.
      if (found.data.container_number) {
        throw new Error('That container has been collected and cannot be removed from the booking');
      }

      unwrap(await db.from('export_containers').delete()
        .eq('export_container_id', exportContainerId).select().single(), 'remove export container');
      await record(found.data.export_job_id as string, 'export.container.removed', actor,
        { field: 'containerRef', from: found.data.container_ref as string, to: null });
    },

    async createMovement(draft, actor) {
      const job = await this.getImportJob(draft.jobId)
        ?? await this.getExportJob(draft.jobId);
      if (!job) throw new Error(`Unknown job ${draft.jobId}`);

      // Operations: the CMS authorises the collection, so the driver cannot be
      // assigned before it is done. Enforced in the adapter rather than in the
      // route so it holds for every caller and identically in both stores.
      const refusal = refuseEmptyCollection(
        'cmsStatus' in job ? job : null, draft.movementType);
      if (refusal) throw new Error(refusal);

      // §18. MOV-NNN, unique within the job and never reused after a
      // cancellation, so the next number comes from the highest ever issued
      // rather than from how many are currently alive.
      const existing = rows(
        await db.from('movements').select('movement_ref').eq('job_id', draft.jobId),
        'movements',
      );
      const highest = existing.reduce((best, row) => {
        const n = Number(String(row.movement_ref).match(/(\d+)$/)?.[1] ?? 0);
        return Math.max(best, n);
      }, 0);
      const movementRef = `MOV-${String(highest + 1).padStart(3, '0')}`;

      const row = unwrap(await db.from('movements').insert({
        movement_id: `${draft.jobId}-${movementRef}`,
        movement_ref: movementRef,
        job_id: draft.jobId,
        job_domain: 'jobId' in job ? 'IMPORT' : 'EXPORT',
        job_number: job.jobNumber,
        container_id: draft.containerId ?? null,
        movement_type: draft.movementType,
        cargo_state: 'LADEN',
        origin_type: draft.originType,
        origin: draft.origin,
        destination_type: draft.destinationType,
        destination: draft.destination,
        planned_date: draft.plannedDate ?? null,
        planned_time: draft.plannedTime ?? null,
        movement_status: 'PENDING',
        auto_created: false,
      }).select().single(), 'create movement') as Record<string, unknown>;

      await record(draft.jobId, 'movement.created', actor,
        { field: 'movementRef', from: null, to: movementRef });
      return toMovement(row);
    },

    async scheduleMovement(movementId, plan, actor) {
      await patchMovement(movementId, { ...plan }, 'movement.scheduled', actor);
    },

    async recordMovementProgress(movementId, progress, actor) {
      await patchMovement(movementId, { ...progress }, 'movement.progressed', actor);
    },

    async cancelMovement(movementId, reason, actor) {
      if (!reason.trim()) throw new Error('A cancellation needs a reason');
      // Not a delete: a cancelled movement is part of what happened to the
      // job, and its reference is retired rather than reused.
      await patchMovement(movementId, {
        movementStatus: 'CANCELLED',
        cancelledReason: reason.trim(),
      }, 'movement.cancelled', actor);
    },

    async listDocumentsForJob(jobId) {
      return rows(
        await db.from('documents').select('*').eq('job_id', jobId).order('received_at'),
        'documents',
      ).map(toDocumentRecord);
    },

    async storeDocument(draft, bytes, actor) {
      const problem = documentProblem(draft);
      if (problem) throw new Error(problem);

      // A second upload of the same document supersedes the first. The job was
      // worked off the original, so it stays and stops being current — and the
      // partial unique index would refuse a second current row anyway.
      const lineage = rows(
        await db.from('documents').select('document_id')
          .eq('job_id', draft.jobId)
          .eq('document_type', draft.documentType)
          .eq('filename', draft.filename),
        'documents',
      );
      if (lineage.length > 0) {
        const superseded = await db.from('documents').update({ is_current_version: false })
          .eq('job_id', draft.jobId)
          .eq('document_type', draft.documentType)
          .eq('filename', draft.filename);
        if (superseded.error) throw new Error(`supersede: ${superseded.error.message}`);
      }
      const version = lineage.length + 1;
      const storagePath = storagePathFor(draft.jobId, version, draft.filename);

      // The bytes first. A row pointing at a file that was never written is a
      // row that lies, and the other order cannot be undone cleanly.
      const uploaded = await storage.from('documents').upload(storagePath, bytes, {
        contentType: guessContentType(draft.filename),
        upsert: false,
      });
      if (uploaded.error) throw new Error(`store document: ${uploaded.error.message}`);

      const row = unwrap(await db.from('documents').insert({
        document_id: `doc-${crypto.randomUUID()}`,
        job_id: draft.jobId,
        container_id: draft.containerId ?? null,
        movement_id: draft.movementId ?? null,
        document_type: draft.documentType,
        filename: draft.filename,
        storage_path: storagePath,
        byte_size: bytes.byteLength,
        source: draft.source ?? 'MANUAL_UPLOAD',
        received_from: draft.receivedFrom ?? null,
        version,
        is_current_version: true,
        extraction_status: draft.extractionStatus ?? 'PENDING',
        uploaded_by: actor,
      }).select().single(), 'record document') as Record<string, unknown>;

      await record(draft.jobId, 'document.stored', actor,
        { field: 'filename', from: null, to: draft.filename });
      return toDocumentRecord(row);
    },

    async documentUrl(documentId, seconds) {
      const found = await db.from('documents').select('storage_path')
        .eq('document_id', documentId).maybeSingle();
      if (found.error) throw new Error(`document lookup: ${found.error.message}`);
      if (!found.data) throw new Error(`Unknown document ${documentId}`);

      // Signed on demand and short-lived. The bucket is private because these
      // are customers' commercial papers, and a stored link would outlive the
      // reason somebody was allowed to see it.
      const signed = await storage.from('documents')
        .createSignedUrl(found.data.storage_path as string, seconds);
      if (signed.error) throw new Error(`sign document: ${signed.error.message}`);
      return signed.data?.signedUrl ?? null;
    },

    async listCustomerLocations(customerCode) {
      return rows(
        await db.from('customer_locations').select('*')
          .eq('customer_code', customerCode).order('location_id'),
        'customer locations',
      ).map(toCustomerLocation);
    },

    async addCustomerLocation(customerCode, draft, actor) {
      const problem = locationProblem(draft);
      if (problem) throw new Error(problem);

      // One default per customer. The partial unique index would refuse a
      // second, so the old one is cleared first rather than colliding.
      if (draft.isDefault) {
        const cleared = await db.from('customer_locations').update({ is_default: false })
          .eq('customer_code', customerCode).eq('is_default', true);
        if (cleared.error) throw new Error(`clear default: ${cleared.error.message}`);
      }

      const row = unwrap(await db.from('customer_locations').insert({
        location_id: `loc-${crypto.randomUUID()}`,
        customer_code: customerCode,
        // A customer with one company should not have to type its own name
        // again, so an unnamed company is the customer's own.
        company: draft.company?.trim()
          || (await this.getCustomerByCode(customerCode))?.companyName
          || customerCode,
        label: draft.label!.trim(),
        address: draft.address!.trim(),
        operational_instructions: draft.operationalInstructions?.trim() || null,
        is_default: draft.isDefault ?? false,
        double_mounting_permitted: draft.doubleMountingPermitted ?? true,
        standby_usual: draft.standbyUsual ?? false,
        active: draft.active ?? true,
        created_by: actor,
      }).select().single(), 'add customer location') as Record<string, unknown>;

      await record(customerCode, 'location.added', actor,
        { field: 'label', from: null, to: draft.label ?? null });
      return toCustomerLocation(row);
    },

    async amendCustomerLocation(locationId, changes, actor) {
      const found = await db.from('customer_locations').select('*')
        .eq('location_id', locationId).maybeSingle();
      if (found.error) throw new Error(`location lookup: ${found.error.message}`);
      if (!found.data) throw new Error(`Unknown location ${locationId}`);

      const before = found.data as Record<string, unknown>;
      const merged = {
        label: (changes.label ?? before.label) as string,
        address: (changes.address ?? before.address) as string,
      };
      const problem = locationProblem(merged);
      if (problem) throw new Error(problem);

      if (changes.isDefault === true) {
        const cleared = await db.from('customer_locations').update({ is_default: false })
          .eq('customer_code', before.customer_code as string).eq('is_default', true);
        if (cleared.error) throw new Error(`clear default: ${cleared.error.message}`);
      }

      const patch: Record<string, unknown> = {};
      const changed: Array<{ field: string; from: unknown; to: unknown }> = [];
      for (const [field, to] of Object.entries(changes)) {
        if (to === undefined) continue;
        const column = camelToSnake(field);
        const from = before[column] ?? null;
        if (String(from ?? '') === String(to ?? '')) continue;
        patch[column] = to;
        changed.push({ field, from, to });
      }
      if (changed.length === 0) return;

      unwrap(await db.from('customer_locations').update(patch)
        .eq('location_id', locationId).select().single(), 'amend customer location');
      for (const c of changed) {
        await record(before.customer_code as string, 'location.amended', actor, c);
      }
    },

    async closeJob(jobId, actor) {
      const { table, key, row } = await locateJob(jobId);
      if (row.closed_at) throw new Error('That job is already closed');

      unwrap(await db.from(table).update({
        closed_at: new Date().toISOString(),
        closed_by: actor,
      }).eq(key, jobId).select().single(), 'close job');

      await record(jobId, 'job.closed', actor,
        { field: 'closedAt', from: null, to: new Date().toISOString() });
    },

    async reopenJob(jobId, reason, actor) {
      const { table, key, row } = await locateJob(jobId);
      if (!row.closed_at) throw new Error('That job is not closed');

      unwrap(await db.from(table).update({ closed_at: null, closed_by: null })
        .eq(key, jobId).select().single(), 'reopen job');

      // Kept as a row of its own as well as on the audit trail: §33.2 wants
      // the history of why a billed job moved, and that is a question people
      // ask of the job rather than of the audit log.
      unwrap(await db.from('job_reopenings').insert({
        reopening_id: `reopen-${crypto.randomUUID()}`,
        job_id: jobId,
        reason,
        reopened_by: actor,
      }).select().single(), 'record reopening');

      await record(jobId, 'job.reopened', actor,
        { field: 'closedAt', from: row.closed_at, to: reason });
    },

    async amendJob(jobId, changes, actor) {
      // Which table the job lives in. An id is unique across both, so this
      // asks rather than making the caller say.
      const asImport = await db.from('import_jobs').select('*')
        .eq('job_id', jobId).maybeSingle();
      if (asImport.error) throw new Error(`job lookup: ${asImport.error.message}`);

      const table = asImport.data ? 'import_jobs' : 'export_jobs';
      const key = asImport.data ? 'job_id' : 'export_job_id';
      const existing = asImport.data ?? (await (async () => {
        const r = await db.from('export_jobs').select('*').eq('export_job_id', jobId).maybeSingle();
        if (r.error) throw new Error(`job lookup: ${r.error.message}`);
        return r.data;
      })());
      if (!existing) throw new Error(`Unknown job ${jobId}`);

      const before = existing as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      const changed: Array<{ field: string; from: unknown; to: unknown }> = [];

      // Absent means leave alone; null means erase. A field the caller did not
      // mention must not be cleared because it was not mentioned.
      for (const [field, to] of Object.entries(changes)) {
        if (to === undefined) continue;
        const column = camelToSnake(field);
        const from = before[column] ?? null;
        if (String(from ?? '') === String(to ?? '')) continue;
        patch[column] = to;
        changed.push({ field, from, to });
      }
      if (changed.length === 0) return;

      unwrap(await db.from(table).update(patch).eq(key, jobId).select().single(), 'amend job');
      for (const c of changed) {
        await record(jobId, 'job.amended', actor, c);
      }
    },

    async listPermitsForJob(jobId) {
      return (await this.listPermitsForJobs([jobId]))[0]?.permits ?? [];
    },
    async listPermitsForJobs(jobIds) {
      if (jobIds.length === 0) return [];
      const permitRows = rows(
        await db.from('permits').select('*').in('job_id', [...jobIds]).order('permit_id'),
        'permits',
      );
      if (permitRows.length === 0) return [];

      // One query for every link rather than one per permit: a job with five
      // permits should cost two reads, not six.
      const links = rows(
        await db.from('permit_containers').select('*')
          .in('permit_id', permitRows.map((p) => p.permit_id as string)),
        'permit containers',
      );
      const covered = new Map<string, string[]>();
      for (const link of links) {
        const key = link.permit_id as string;
        if (!covered.has(key)) covered.set(key, []);
        covered.get(key)!.push(link.container_id as string);
      }

      const byJob = new Map<string, PermitRecord[]>();
      for (const row of permitRows) {
        const jobId = row.job_id as string;
        if (!byJob.has(jobId)) byJob.set(jobId, []);
        byJob.get(jobId)!.push({
          permitId: row.permit_id as string,
          permitNumber: nn(row.permit_number as string),
          expiryDate: nn(row.expiry_date as string),
          permitVesselVoyage: nn(row.permit_vessel_voyage as string),
          fileName: nn(row.file_name as string),
          linkedContainerIds: (covered.get(row.permit_id as string) ?? []).sort(),
        });
      }
      return [...byJob].map(([jobId, permits]) => ({ jobId, permits }));
    },
    async recordPermit(jobId, draft, actor) {
      const permitId = `permit-${crypto.randomUUID()}`;
      unwrap(await db.from('permits').insert({
        permit_id: permitId,
        job_id: jobId,
        permit_number: draft.permitNumber ? normalisePermitNumber(draft.permitNumber) : null,
        expiry_date: draft.expiryDate ?? null,
        permit_vessel_voyage: draft.permitVesselVoyage ?? null,
        file_name: draft.fileName ?? null,
        created_by: actor,
      }).select().single(), 'record permit');

      if (draft.containerIds?.length) {
        await this.linkPermitToContainers(permitId, draft.containerIds, actor);
      }
      await record(jobId, 'permit.recorded', actor,
        { field: 'permitNumber', from: null, to: draft.permitNumber ?? null });

      return (await this.listPermitsForJob(jobId)).find((p) => p.permitId === permitId)!;
    },
    async linkPermitToContainers(permitId, containerIds, actor) {
      const existing = await db.from('permits').select('job_id')
        .eq('permit_id', permitId).maybeSingle();
      if (existing.error) throw new Error(`permit lookup: ${existing.error.message}`);
      if (!existing.data) throw new Error(`Unknown permit ${permitId}`);

      // Replace, never add: "copy to selected" states the whole relationship,
      // so a container the controller unticked must stop being covered.
      const cleared = await db.from('permit_containers').delete().eq('permit_id', permitId);
      if (cleared.error) throw new Error(`clear permit links: ${cleared.error.message}`);

      const wanted = [...new Set(containerIds)];
      if (wanted.length > 0) {
        unwrap(await db.from('permit_containers').insert(
          wanted.map((containerId) => ({ permit_id: permitId, container_id: containerId })),
        ).select(), 'link permit to containers');
      }

      await record(existing.data.job_id as string, 'permit.allocated', actor,
        { field: 'linkedContainers', from: null, to: String(wanted.length) });
    },
    async removePermit(permitId, actor) {
      const existing = await db.from('permits').select('job_id,permit_number')
        .eq('permit_id', permitId).maybeSingle();
      if (existing.error) throw new Error(`permit lookup: ${existing.error.message}`);
      if (!existing.data) throw new Error(`Unknown permit ${permitId}`);

      unwrap(await db.from('permits').delete()
        .eq('permit_id', permitId).select().single(), 'remove permit');
      await record(existing.data.job_id as string, 'permit.removed', actor,
        { field: 'permitNumber', from: existing.data.permit_number as string, to: null });
    },

    async removePrincipal(userId, actor) {
      const person = await this.getPrincipal(userId);
      if (!person) throw new Error(`Unknown user ${userId}`);

      if (person.role === 'ADMINISTRATOR') {
        const admins = (await this.listPrincipals())
          .filter((p) => p.role === 'ADMINISTRATOR' && p.active);
        if (admins.length <= 1) throw new Error('Refusing to remove the last administrator');
      }

      unwrap(await db.from('principals').delete()
        .eq('user_id', userId).select().single(), 'remove principal');

      await record(userId, 'user.removed', actor,
        { field: 'displayName', from: person.displayName, to: null });
    },

    async getPrincipalByEmail(email) {
      const r = await db.from('principals').select('*')
        .ilike('email', email.trim()).maybeSingle();
      if (r.error) throw new Error(`principal by email: ${r.error.message}`);
      return r.data ? toPrincipal(r.data) : null;
    },
    async listPrincipals() {
      return rows(await db.from('principals').select('*').order('display_name'), 'principals')
        .map(toPrincipal);
    },

    async listChassis() {
      return rows(await db.from('chassis').select('*').order('chassis_no'), 'chassis')
        .map(toChassis) as Chassis[];
    },
    async listChassisHoldings() {
      const [imp, exp] = await Promise.all([
        db.from('containers').select('container_id,job_id,chassis_id,chassis_mounted_at,chassis_released_at')
          .not('chassis_id', 'is', null),
        db.from('export_containers').select('export_container_id,export_job_id,chassis_id,chassis_mounted_at,chassis_released_at')
          .not('chassis_id', 'is', null),
      ]);
      const holdings: ChassisHolding[] = [];
      for (const r of rows(imp, 'import holdings')) {
        holdings.push(holdingFrom(r.container_id as string, r.job_id as string, r));
      }
      for (const r of rows(exp, 'export holdings')) {
        holdings.push(holdingFrom(r.export_container_id as string, r.export_job_id as string, r));
      }
      return holdings;
    },
    async recordChassisChange(request: ChassisChangeRequest, actor) {
      const existing = rows(await db.from('chassis_changes').select('change_id'), 'chassis changes');
      const change = recordChassisChange(
        { ...request, changedBy: actor, changedAt: new Date().toISOString() },
        `CHG-${existing.length + 1}`,
      );
      unwrap(await db.from('chassis_changes').insert({
        change_id: change.changeId, container_id: change.containerId, job_id: change.jobId,
        chassis_id_previous: change.chassisIdPrevious, chassis_id_new: change.chassisIdNew,
        reason: change.reason, location: change.location,
        changed_at: change.changedAt, changed_by: change.changedBy,
        container_grounded: change.containerGrounded,
      }).select().single(), 'record chassis change');

      // §35.8: occupancy splits across both units, so the withdrawn unit is
      // released at the change and the replacement mounted at the same moment.
      await db.from('containers')
        .update({ chassis_released_at: change.changedAt })
        .eq('container_id', change.containerId).eq('chassis_id', change.chassisIdPrevious);
      await db.from('export_containers')
        .update({ chassis_released_at: change.changedAt })
        .eq('export_container_id', change.containerId).eq('chassis_id', change.chassisIdPrevious);
      if (change.chassisIdNew) {
        const patch = { chassis_id: change.chassisIdNew, chassis_mounted_at: change.changedAt, chassis_released_at: null };
        await db.from('containers').update(patch).eq('container_id', change.containerId);
        await db.from('export_containers').update(patch).eq('export_container_id', change.containerId);
      }
      await record(change.jobId, 'movement.cancelled', actor, {
        field: 'chassis', from: change.chassisIdPrevious, to: change.chassisIdNew ?? 'grounded',
      });
      return change;
    },
    async listChassisChanges() {
      return rows(await db.from('chassis_changes').select('*').order('changed_at'), 'chassis changes')
        .map(toChassisChange) as ChassisChange[];
    },

    async listDateAmendments(entityId) {
      return rows(
        await db.from('date_amendments').select('*').eq('entity_id', entityId).order('sequence'),
        'date amendments',
      ).map(toDateAmendment) as DateAmendment[];
    },
    async amendDate(request: DateAmendmentInput, actor) {
      const existing = rows(
        await db.from('date_amendments').select('*').eq('entity_id', request.entityId),
        'date amendments',
      ).map(toDateAmendment);

      // The current value is read from whichever record owns that date.
      const current = await (async () => {
        for (const [table, key] of [['export_jobs', 'export_job_id'], ['import_jobs', 'job_id'], ['movements', 'movement_id']] as const) {
          const r = await db.from(table).select('*').eq(key, request.entityId).maybeSingle();
          if (r.data) return (r.data as Record<string, unknown>)[camelToSnake(request.dateField)] as string | null;
        }
        return null;
      })();

      const { amendment } = appendAmendment(existing, {
        entityType: request.entityType,
        entityId: request.entityId,
        dateField: request.dateField,
        previousValue: current ?? null,
        newValue: request.newValue,
        reasonCode: request.reasonCode as DateAmendment['reasonCode'],
        reasonNote: request.reasonNote ?? null,
        amendedBy: actor,
        amendedAt: new Date().toISOString(),
      }, `AMD-${existing.length + 1}-${request.entityId}`);

      unwrap(await db.from('date_amendments').insert({
        amendment_id: amendment.amendmentId, entity_type: amendment.entityType,
        entity_id: amendment.entityId, date_field: amendment.dateField,
        previous_value: amendment.previousValue, new_value: amendment.newValue,
        reason_code: amendment.reasonCode, reason_note: amendment.reasonNote,
        amended_by: amendment.amendedBy, amended_at: amendment.amendedAt,
        sequence: amendment.sequence,
      }).select().single(), 'amend date');

      const column = camelToSnake(request.dateField);
      for (const [table, key] of [['export_jobs', 'export_job_id'], ['import_jobs', 'job_id'], ['movements', 'movement_id']] as const) {
        await db.from(table).update({ [column]: request.newValue }).eq(key, request.entityId);
      }
      // §13.1 rule 5: both are written. The audit stream is the legal record.
      await record(request.entityId, 'job.mandatoryFieldChanged', actor,
        { field: request.dateField, from: amendment.previousValue, to: amendment.newValue });
      return amendment;
    },

    // ---- job creation ----
    async createImportJob(draft: ImportJobDraft, actor) {
      const customer = await this.getCustomerByCode(draft.customerCode);
      if (!customer) throw new Error(`Unknown customer ${draft.customerCode}`);
      // Checked before the job row is written, so a refusal leaves nothing
      // behind rather than a job with no containers, which is its own dead end.
      const drafts = draft.containers?.length ? draft.containers : [{}];
      const count = validateContainerCount(drafts.length);
      if (!count.valid) throw new Error(count.reason!);

      const jobNumber = await issueJobNumber(customer.code);
      const jobId = jobNumber.toLowerCase();

      const created = unwrap(await db.from('import_jobs').insert({
        job_id: jobId, job_number: jobNumber,
        customer_id: customer.customerId, customer: customer.companyName,
        bl_number: draft.blNumber ?? null,
        house_bl_number: draft.houseBlNumber ?? null,
        vessel_name: draft.vesselName ?? null,
        voyage_number: draft.voyageNumber ?? null,
        eta: draft.eta ?? null,
        job_type: draft.jobType ?? 'standard',
        delivery_address: draft.deliveryAddress ?? customer.defaultDeliveryAddress,
        permit_required: draft.permitRequired ?? true,
        portnet_required: draft.portnetRequired ?? true,
        assigned_controller: draft.assignedController ?? null,
      }).select().single(), 'create import job') as Record<string, unknown>;

      // §29.1: free time is per container and every container command needs
      // one to address, so a job with none is a dead end. One empty row when
      // the notice named none, so the number has somewhere to go later.
      // Postgres has the transaction; the REST client does not, so a failed
      // container insert would leave a job behind with none — the dead end
      // this whole change exists to remove, created by the fix for it. The
      // job is removed by hand instead, so a failure leaves nothing.
      const inserted = await db.from('containers').insert(drafts.map((c, index) => {
        const [size, ...type] = String(c.sizeType ?? '').trim().split(/\s+/);
        return {
          container_id: `${jobId}-c${index + 1}`,
          job_id: jobId,
          container_number: c.containerNumber?.trim() || null,
          container_size: size || '',
          container_type: type.join(' '),
          seal_number: c.sealNumber?.trim() || null,
          gross_weight: c.grossWeight ?? null,
          package_count: c.packageCount ?? null,
          package_type: c.packageType?.trim() || null,
          // §34. Nothing is asserted about the carrier's allowance until
          // someone has read it: absent is not the same as split.
          free_time_model: c.freeTimeModel ?? 'NOT_CONFIRMED',
          demurrage_free_days: c.demurrageFreeDays ?? null,
          detention_free_days: c.detentionFreeDays ?? null,
          combined_free_days: c.combinedFreeDays ?? null,
          free_time_remarks: c.freeTimeRemarks ?? null,
        };
      }));

      if (inserted.error) {
        // Safe to remove: the job.created event is written below, after the
        // containers, so nothing has been audited yet. Deleting an audited job
        // would be a different matter — audit_events is append-only and would
        // refuse, correctly.
        await db.from('import_jobs').delete().eq('job_id', jobId);

        // §29.1 rule 22 is enforced by a unique index, and Postgres reports it
        // by index name. "duplicate key value violates unique constraint
        // containers_open_number_idx" tells a controller nothing about which
        // box is already in use, or where.
        if (/containers_open_number_idx/.test(inserted.error.message)) {
          const numbers = drafts.map((c) => c.containerNumber?.trim()).filter(Boolean);
          throw new Error(numbers.length === 1
            ? `§29.1: container ${numbers[0]} is already on another open job. Close that job first, or check the number.`
            : `§29.1: one of ${numbers.join(', ')} is already on another open job.`);
        }
        throw new Error(`create import containers: ${inserted.error.message}`);
      }

      await record(jobId, 'job.created', actor, { field: 'jobNumber', to: jobNumber });
      return toImportJob(created);
    },
    async createExportJob(draft: ExportJobDraft, actor) {
      const customer = await this.getCustomerByCode(draft.customerCode);
      if (!customer) throw new Error(`Unknown customer ${draft.customerCode}`);
      const jobNumber = await issueJobNumber(customer.code);
      const jobId = jobNumber.toLowerCase();
      const quantity = Math.max(1, draft.containerQuantity ?? 1);

      const created = unwrap(await db.from('export_jobs').insert({
        export_job_id: jobId, job_number: jobNumber,
        customer_id: customer.customerId, customer: customer.companyName,
        shipper: draft.shipper ?? customer.companyName,
        booking_reference: draft.bookingReference ?? null,
        export_clearance_reference: draft.exportClearanceReference ?? null,
        vessel_name: draft.vesselName ?? null,
        voyage_number: draft.voyageNumber ?? null,
        eta_singapore: draft.etaSingapore ?? null,
        vessel_closing_at: draft.vesselClosingAt ?? null,
        empty_collection_yard: draft.emptyCollectionYard ?? null,
        cms_required: draft.cmsRequired ?? true,
        container_quantity: quantity,
        container_size_type: draft.containerSizeType ?? null,
        truck_in_date: draft.truckInDate ?? null,
        truck_out_date: draft.truckOutDate ?? null,
        assigned_controller: draft.assignedController ?? null,
      }).select().single(), 'create export job') as Record<string, unknown>;

      // §38.2. Container records are created with the job, identified later.
      const containers = Array.from({ length: quantity }, (_, i) => ({
        export_container_id: `${jobId}-c${i + 1}`,
        export_job_id: jobId,
        container_ref: `C${i + 1}`,
        size_type: draft.containerSizeType ?? '',
      }));
      unwrap(await db.from('export_containers').insert(containers).select(), 'create containers');

      await record(jobId, 'job.created', actor, { field: 'jobNumber', to: jobNumber });
      return toExportJob(created);
    },

    // ---- commands ----
    async recordCms(jobId, status, actor, reason) {
      const before = await this.getExportJob(jobId);
      if (!before) {
        // §40 puts CMS on the export job only. "Unknown" sends the caller
        // looking for a missing record when the job is simply an import one.
        const asImport = await this.getImportJob(jobId);
        throw new Error(asImport
          ? `§40: CMS applies to export jobs. ${asImport.jobNumber} is an import job`
          : `Unknown export job ${jobId}`);
      }
      unwrap(await db.from('export_jobs').update({ cms_status: status })
        .eq('export_job_id', jobId).select().single(), 'record CMS');
      await record(jobId, 'cms.completed', actor,
        { field: 'cmsStatus', from: before.cmsStatus, to: status });
      if (reason) await record(jobId, 'cms.completed', actor, { field: 'reason', to: reason });
    },
    async recordPermitReceived(jobId, permitNumber, actor) {
      const before = await this.getImportJob(jobId);
      if (!before) throw new Error(`Unknown import job ${jobId}`);
      unwrap(await db.from('import_jobs')
        .update({ permit_received: true, permit_rejected: false })
        .eq('job_id', jobId).select().single(), 'record permit');
      await record(jobId, 'permit.received', actor,
        { field: 'permitReceived', from: before.permitReceived, to: true });
      await record(jobId, 'permit.received', actor, { field: 'permitNumber', to: permitNumber });
    },
    async recordPortnetReleased(jobId, actor) {
      const before = await this.getImportJob(jobId);
      if (!before) throw new Error(`Unknown import job ${jobId}`);
      unwrap(await db.from('import_jobs').update({ portnet_released: true })
        .eq('job_id', jobId).select().single(), 'record Portnet');
      await record(jobId, 'portnet.released', actor,
        { field: 'portnetReleased', from: before.portnetReleased, to: true });
    },
    async recordFreeTime(containerId, terms, actor) {
      const existing = await db.from('containers').select('job_id,free_time_model')
        .eq('container_id', containerId).maybeSingle();
      if (existing.error) throw new Error(`container lookup: ${existing.error.message}`);
      if (!existing.data) throw new Error(`Unknown container ${containerId}`);

      // Only the chosen model's fields are kept; the others are cleared. §34.3
      // forbids showing two countdowns for one allowance, and the surest way
      // to honour that is not to store the figures that would produce them.
      const split = terms.freeTimeModel === 'SPLIT';
      const combined = terms.freeTimeModel === 'COMBINED';
      const rate = terms.dailyRate ?? null;
      const currency = terms.currency ?? null;
      if ((rate === null) !== (currency === null)) {
        throw new Error('A daily rate needs a currency, and a currency needs a rate');
      }
      unwrap(await db.from('containers').update({
        free_time_model: terms.freeTimeModel,
        demurrage_free_days: split ? terms.demurrageFreeDays ?? null : null,
        demurrage_lfd: split ? terms.demurrageLfd ?? null : null,
        detention_free_days: split ? terms.detentionFreeDays ?? null : null,
        detention_lfd: split ? terms.detentionLfd ?? null : null,
        combined_free_days: combined ? terms.combinedFreeDays ?? null : null,
        combined_lfd: combined ? terms.combinedLfd ?? null : null,
        free_time_remarks: terms.freeTimeRemarks ?? null,
        // §34.2. The database carries the same both-or-neither check; this
        // says so in a sentence instead of a constraint violation.
        daily_rate: rate,
        currency,
      }).eq('container_id', containerId).select().single(), 'record free time');

      await record(existing.data.job_id as string, 'freetime.confirmed', actor, {
        field: 'freeTimeModel',
        from: existing.data.free_time_model as string,
        to: terms.freeTimeModel,
      });
    },

    async captureContainerIdentity(containerId, details, actor) {
      const jobId = await jobOfExportContainer(containerId);
      unwrap(await db.from('export_containers').update({
        container_number: details.containerNumber,
        seal_number: details.sealNumber,
        tare_weight_kg: details.tareWeightKg,
      }).eq('export_container_id', containerId).select().single(), 'capture identity');
      await record(jobId, 'container.identityCaptured', actor,
        { field: 'containerNumber', to: details.containerNumber });
    },
    async recordTranshipment(jobId, status, actor) {
      const before = await this.getExportJob(jobId);
      if (!before) {
        // Transhipment is an export check (§47). Same reasoning as CMS.
        const asImport = await this.getImportJob(jobId);
        throw new Error(asImport
          ? `§47: the transhipment check applies to export jobs. ${asImport.jobNumber} is an import job`
          : `Unknown export job ${jobId}`);
      }
      unwrap(await db.from('export_jobs').update({
        transhipment_status: status, transhipment_checked_at: new Date().toISOString(),
      }).eq('export_job_id', jobId).select().single(), 'record transhipment');
      await record(jobId, 'transhipment.changed', actor,
        { field: 'transhipmentStatus', from: before.transhipmentStatus, to: status });
    },
    async recordContainerDetailsSent(containerId, notice, actor) {
      const jobId = await jobOfExportContainer(containerId);

      // Read before writing, because §42's gate is about what is on file: a
      // notification is generated from stored data, so the check has to run
      // against the stored row rather than against anything the caller sent.
      const current = await db.from('export_containers')
        .select('container_number,seal_number,tare_weight_kg')
        .eq('export_container_id', containerId).maybeSingle();
      if (current.error) throw new Error(`container lookup: ${current.error.message}`);
      if (!current.data) throw new Error(`Unknown container ${containerId}`);

      const gate = canSendContainerDetails({
        containerNumber: current.data.container_number as string | null,
        sealNumber: current.data.seal_number as string | null,
        tareWeightKg: current.data.tare_weight_kg === null || current.data.tare_weight_kg === undefined
          ? null : Number(current.data.tare_weight_kg),
      } as ExportContainer, notice.sentTo);
      if (!gate.passed) throw new Error(gate.failures.join('; '));

      unwrap(await db.from('export_containers').update({
        container_details_sent: true,
        container_details_sent_at: new Date().toISOString(),
        container_details_sent_to: notice.sentTo.trim(),
        container_details_sent_by: actor,
        container_details_reference: notice.reference?.trim() || null,
      }).eq('export_container_id', containerId).select().single(), 'record details sent');

      await record(jobId, 'container.detailsSent', actor,
        { field: 'containerDetailsSent', from: false, to: notice.sentTo.trim() });
    },

    async handContainerToController(containerId, actor) {
      const before = await db.from('containers').select('job_id,handed_over_at')
        .eq('container_id', containerId).maybeSingle();
      if (!before.data) throw new Error(`Unknown import container ${containerId}`);
      // Already handed over: the first decision stands and is not re-stamped.
      if (before.data.handed_over_at) return;
      const at = new Date().toISOString();
      unwrap(await db.from('containers').update({
        handed_over_at: at, handed_over_by: actor,
      }).eq('container_id', containerId).select().single(), 'hand to controller');
      await record(before.data.job_id as string, 'container.handedToController', actor,
        { field: 'handedOverAt', from: null, to: at });
    },
    async confirmEmptyReady(containerId, source, actor) {
      const before = await db.from('containers').select('job_id,empty_ready_confirmed')
        .eq('container_id', containerId).maybeSingle();
      if (!before.data) throw new Error(`Unknown import container ${containerId}`);
      if (before.data.empty_ready_confirmed) return;
      unwrap(await db.from('containers').update({
        empty_ready_confirmed: true,
        empty_ready_confirmed_at: new Date().toISOString(),
        empty_ready_source: source,
      }).eq('container_id', containerId).select().single(), 'confirm empty ready');
      await record(before.data.job_id as string, 'container.emptyReady', actor,
        { field: 'emptyReadyConfirmed', from: false, to: true });
    },
    async markDocumentsComplete(jobId, actor) {
      const before = await db.from('import_jobs').select('documents_completed_at')
        .eq('job_id', jobId).maybeSingle();
      if (!before.data) throw new Error(`Unknown import job ${jobId}`);
      if (before.data.documents_completed_at) return;
      const at = new Date().toISOString();
      unwrap(await db.from('import_jobs').update({
        documents_completed_at: at, documents_completed_by: actor,
      }).eq('job_id', jobId).select().single(), 'mark documents complete');
      await record(jobId, 'job.documentsCompleted', actor,
        { field: 'documentsCompletedAt', from: null, to: at });
    },
    async recordDischarged(containerId, actor) {
      const before = await db.from('containers').select('job_id,discharged_at')
        .eq('container_id', containerId).maybeSingle();
      if (!before.data) throw new Error(`Unknown import container ${containerId}`);
      if (before.data.discharged_at) return;
      const at = new Date().toISOString();
      unwrap(await db.from('containers').update({ discharged_at: at })
        .eq('container_id', containerId).select().single(), 'record discharge');
      await record(before.data.job_id as string, 'container.discharged', actor,
        { field: 'dischargedAt', from: null, to: at });
    },
    async recordDelivered(containerId, actor) {
      const before = await db.from('containers').select('job_id,delivered_at')
        .eq('container_id', containerId).maybeSingle();
      if (!before.data) throw new Error(`Unknown import container ${containerId}`);
      if (before.data.delivered_at) return;
      const at = new Date().toISOString();
      unwrap(await db.from('containers').update({ delivered_at: at })
        .eq('container_id', containerId).select().single(), 'record delivery');
      await record(before.data.job_id as string, 'container.delivered', actor,
        { field: 'deliveredAt', from: null, to: at });
    },
    async recordContainerReady(containerId, actor) {
      const jobId = await jobOfExportContainer(containerId);
      unwrap(await db.from('export_containers').update({
        container_ready: true, container_ready_at: new Date().toISOString(),
      }).eq('export_container_id', containerId).select().single(), 'record ready');
      await record(jobId, 'container.readyConfirmed', actor,
        { field: 'containerReady', from: false, to: true });
    },
    async recordVgm(containerId, vgm, actor) {
      const jobId = await jobOfExportContainer(containerId);
      const before = await db.from('export_containers').select('vgm')
        .eq('export_container_id', containerId).maybeSingle();
      unwrap(await db.from('export_containers').update({
        vgm, vgm_received_at: new Date().toISOString(),
      }).eq('export_container_id', containerId).select().single(), 'record VGM');
      await record(jobId, 'vgm.received', actor,
        { field: 'vgm', from: before.data?.vgm ?? null, to: vgm });
    },

    // ---- audit and discrepancies ----
    async listAuditEvents(entityId) {
      return rows(
        await db.from('audit_events').select('*').eq('entity_id', entityId).order('created_at'),
        'audit events',
      ).map((r) => ({
        event: r.event as string,
        entityType: r.entity_type as AuditEvent['entityType'],
        entityId: r.entity_id as string,
        field: (r.field as string) ?? null,
        previousValue: (r.previous_value as string) ?? null,
        newValue: (r.new_value as string) ?? null,
        actor: r.actor as string,
        source: r.source as AuditEvent['source'],
        rule: (r.rule as string) ?? null,
        createdAt: r.created_at as string,
      }));
    },
    async listOpenDiscrepancies(jobId) {
      return rows(
        await db.from('discrepancies').select('*').eq('job_id', jobId).is('resolved_at', null),
        'discrepancies',
      ).map((r) => ({
        field: r.field as string,
        storedValue: r.stored_value,
        extractedValue: r.extracted_value,
        source: r.source as string,
        confidence: Number(r.confidence),
        detectedAt: r.detected_at as string,
        reason: r.reason as string,
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
      })) as StoredDiscrepancy[];
    },
    async raiseDiscrepancy(jobId, discrepancy: Discrepancy, actor) {
      // One open discrepancy per field: a second document updates the standing
      // question rather than stacking another behind it. The partial unique
      // index enforces it; upsert is how that is honoured rather than fought.
      const row = {
        job_id: jobId, field: discrepancy.field,
        stored_value: discrepancy.storedValue === null ? null : String(discrepancy.storedValue),
        extracted_value: discrepancy.extractedValue === null ? null : String(discrepancy.extractedValue),
        source: discrepancy.source, confidence: discrepancy.confidence,
        reason: discrepancy.reason, detected_at: discrepancy.detectedAt,
      };
      const open = await db.from('discrepancies').select('discrepancy_id')
        .eq('job_id', jobId).eq('field', discrepancy.field).is('resolved_at', null).maybeSingle();
      if (open.data) {
        unwrap(await db.from('discrepancies').update(row)
          .eq('discrepancy_id', open.data.discrepancy_id).select().single(), 'update discrepancy');
      } else {
        unwrap(await db.from('discrepancies').insert(row).select().single(), 'raise discrepancy');
      }
      await record(jobId, 'discrepancy.raised', actor, {
        field: discrepancy.field, from: discrepancy.storedValue, to: discrepancy.extractedValue,
      });
    },
    async resolveDiscrepancy(jobId, field, choice, actor) {
      const open = await db.from('discrepancies').select('*')
        .eq('job_id', jobId).eq('field', field).is('resolved_at', null).maybeSingle();
      if (open.error) throw new Error(`discrepancy: ${open.error.message}`);
      if (!open.data) throw new Error(`Unknown open discrepancy ${field} on job ${jobId}`);

      unwrap(await db.from('discrepancies').update({
        resolved_at: new Date().toISOString(), resolved_by: actor, resolution: choice,
      }).eq('discrepancy_id', open.data.discrepancy_id).select().single(), 'resolve discrepancy');

      await record(jobId, 'discrepancy.resolved', actor, {
        field,
        from: open.data.stored_value,
        to: choice === 'extracted' ? open.data.extracted_value : open.data.stored_value,
      });
    },
  } satisfies Repository;
}

/** `truckInDate` becomes `truck_in_date`. */
function camelToSnake(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** §10. A stored document, out of the store. */
function toDocumentRecord(r: Record<string, unknown>): DocumentRecord {
  return {
    documentId: r.document_id as string,
    jobId: r.job_id as string,
    containerId: nn(r.container_id as string),
    movementId: nn(r.movement_id as string),
    documentType: r.document_type as DocumentRecord['documentType'],
    filename: r.filename as string,
    storagePath: r.storage_path as string,
    byteSize: nn(r.byte_size as number),
    source: r.source as DocumentRecord['source'],
    receivedAt: r.received_at as string,
    receivedFrom: nn(r.received_from as string),
    version: Number(r.version),
    isCurrentVersion: Boolean(r.is_current_version),
    extractionStatus: r.extraction_status as DocumentRecord['extractionStatus'],
    uploadedBy: r.uploaded_by as string,
  };
}

/**
 * What to tell the browser a file is.
 *
 * Stored on upload, because a PDF served as application/octet-stream is a PDF
 * the browser downloads instead of showing — and the point of keeping the
 * document is being able to look at it.
 */
function guessContentType(filename: string): string {
  const name = filename.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}
