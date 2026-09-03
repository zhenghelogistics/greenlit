import type { MandatoryFieldSet } from '@greenlit/engine';
import type { Repository } from './repository.ts';
import { asNarrative, describe } from '@greenlit/engine';
import { deriveExportJob, deriveImportJob, type AuditEventView, type DerivedJobView } from './derive.ts';

/**
 * §30 / §40.1. Configurable per job type; hard-coded here only until a
 * settings table exists. Keys must match the stored field names.
 */
export const IMPORT_MANDATORY: MandatoryFieldSet = {
  fields: ['customer', 'blNumber', 'vesselName', 'voyageNumber', 'eta', 'deliveryAddress'],
};

export const EXPORT_MANDATORY: MandatoryFieldSet = {
  fields: [
    'customer', 'shipper', 'bookingReference', 'exportClearanceReference',
    'vesselName', 'voyageNumber', 'etaSingapore', 'emptyCollectionYard',
    'containerQuantity', 'containerSizeType', 'truckInDate', 'truckOutDate',
  ],
};

/**
 * The application service. API routes call this and nothing else.
 *
 * It takes a Repository, so it is storage-agnostic: the same service runs
 * against the in-memory fixtures today and against Supabase later, unchanged.
 */
export class JobService {
  // Explicit fields rather than TypeScript parameter properties: Node's
  // strip-only type execution cannot compile parameter properties, and these
  // packages are deliberately runnable with no build step.
  readonly #repo: Repository;
  readonly #now: () => string;

  constructor(repo: Repository, now: () => string = () => new Date().toISOString()) {
    this.#repo = repo;
    this.#now = now;
  }

  async getJob(jobId: string): Promise<DerivedJobView | null> {
    const now = this.#now();
    const thresholds = await this.#repo.getThresholds();

    const importJob = await this.#repo.getImportJob(jobId);
    if (importJob) {
      const [containers, movements, exceptions] = await Promise.all([
        this.#repo.listContainersForImportJob(jobId),
        this.#repo.listMovementsForJob(jobId),
        this.#repo.listOpenExceptionsForJob(jobId),
      ]);
      const view = deriveImportJob(importJob, containers, movements, exceptions, IMPORT_MANDATORY, thresholds, now);
      view.activity = await this.#activity(jobId);
      view.discrepancies = await this.#repo.listOpenDiscrepancies(jobId);
      return view;
    }

    const exportJob = await this.#repo.getExportJob(jobId);
    if (exportJob) {
      const [containers, movements, exceptions] = await Promise.all([
        this.#repo.listContainersForExportJob(jobId),
        this.#repo.listMovementsForJob(jobId),
        this.#repo.listOpenExceptionsForJob(jobId),
      ]);
      const view = deriveExportJob(exportJob, containers, movements, exceptions, EXPORT_MANDATORY, thresholds, now);
      view.activity = await this.#activity(jobId);
      view.discrepancies = await this.#repo.listOpenDiscrepancies(jobId);
      return view;
    }

    return null;
  }

  /** Every active job, both domains, each carrying its derived values. */
  async listJobs(): Promise<DerivedJobView[]> {
    const [importJobs, exportJobs] = await Promise.all([
      this.#repo.listImportJobs(), this.#repo.listExportJobs(),
    ]);
    const ids = [...importJobs.map((j) => j.jobId), ...exportJobs.map((j) => j.exportJobId)];
    const views = await Promise.all(ids.map((id) => this.getJob(id)));
    return views.filter((v): v is DerivedJobView => v !== null);
  }

  /**
   * §26.2. The Action Required queue, ordered by §25.1 precedence.
   *
   * Default sort is urgency, never job number: "a queue sorted by identifier
   * is a list; a queue sorted by urgency is a work plan."
   */
  async actionRequired(waitingOn?: 'US' | 'CUSTOMER' | 'CARRIER'): Promise<DerivedJobView[]> {
    const all = await this.listJobs();
    const open = all.filter((j) => j.nextActionRequired !== 'No action required');
    const filtered = waitingOn ? open.filter((j) => j.waitingOn === waitingOn) : open;
    return filtered.sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
  }

  /**
   * §13. The audit stream as a narrative — oldest first, each entry rendered
   * so a system change always shows the rule that produced it.
   */
  async #activity(jobId: string): Promise<AuditEventView[]> {
    const events = await this.#repo.listAuditEvents(jobId);
    return asNarrative(events).map((e) => ({
      event: e.event,
      description: describe(e),
      actor: e.actor,
      at: e.createdAt,
      rule: e.rule,
    }));
  }

  /** §26.1. Populated automatically by the mandatory field engine. */
  async incomplete(): Promise<DerivedJobView[]> {
    return (await this.listJobs()).filter((j) => !j.mandatoryComplete);
  }
}
