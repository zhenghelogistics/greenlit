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
  toMovement, toPrincipal,
} from './rows.ts';

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
  const db: SupabaseClient = createClient(options.url, options.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** §13. Every command leaves one of these; there is no update or delete. */
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
      return rows(await db.from('containers').select('*').eq('job_id', jobId), 'containers')
        .map(toImportContainer);
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
        await db.from('containers').select('*').in('job_id', [...jobIds]),
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
      return nextJobReference(await issuedReferences(), customerCode);
    },

    async getPrincipal(userId) {
      const r = await db.from('principals').select('*').eq('user_id', userId).maybeSingle();
      if (r.error) throw new Error(`principal: ${r.error.message}`);
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

      const jobNumber = nextJobReference(await issuedReferences(), customer.code);
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
      const jobNumber = nextJobReference(await issuedReferences(), customer.code);
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
