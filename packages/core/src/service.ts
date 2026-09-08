import type { MandatoryFieldSet } from '@greenlit/engine';
import type { Repository } from './repository.ts';
import {
  asNarrative, chassisDays, chassisStatus, describe, fleetAvailability,
  monthlyCapacity, type ChassisStatus, type FleetAvailability,
} from '@greenlit/engine';
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

  /**
   * §35. The fleet view.
   *
   * Every status here is derived from job records — §35.3 is explicit that a
   * stored availability flag drifts the moment someone forgets to clear it, so
   * nothing in this result was typed by anyone.
   */
  async fleet(): Promise<FleetView> {
    const now = this.#now();
    const today = now.slice(0, 10);
    const [units, holdings, importJobs, exportJobs] = await Promise.all([
      this.#repo.listChassis(),
      this.#repo.listChassisHoldings(),
      this.#repo.listImportJobs(),
      this.#repo.listExportJobs(),
    ]);

    const jobNumber = new Map<string, { jobNumber: string; customer: string }>();
    for (const j of importJobs) jobNumber.set(j.jobId, { jobNumber: j.jobNumber, customer: j.customer });
    for (const j of exportJobs) jobNumber.set(j.exportJobId, { jobNumber: j.jobNumber, customer: j.customer });

    const rows: FleetUnitView[] = units.map((unit) => {
      const open = holdings.find((h) => h.chassisId === unit.chassisId && h.releasedAt === null);
      const job = open ? jobNumber.get(open.jobId) : undefined;
      return {
        chassisId: unit.chassisId,
        chassisNo: unit.chassisNo,
        plateNo: unit.plateNo,
        size: unit.size,
        status: chassisStatus(unit, holdings, today),
        inspectionDueDate: unit.inspectionDueDate,
        jobNumber: job?.jobNumber ?? null,
        customer: job?.customer ?? null,
        heldSince: open?.mountedAt?.slice(0, 10) ?? null,
        daysHeld: open ? chassisDays(open, now) : 0,
      };
    });

    const availability = fleetAvailability(units, holdings, today);
    const held = rows.filter((r) => r.status === 'IN_USE');
    const averageJobDays = held.length
      ? Math.max(1, Math.round(held.reduce((sum, r) => sum + r.daysHeld, 0) / held.length))
      : 6;

    return {
      units: rows,
      availability,
      averageJobDays,
      // §35.6. Occupancy equals job duration, so fleet size sets the ceiling.
      monthlyCapacity20ft: monthlyCapacity(
        units.filter((u) => u.size === '20FT').length, averageJobDays),
      monthlyCapacity40ft: monthlyCapacity(
        units.filter((u) => u.size === '40FT').length, averageJobDays),
    };
  }

  /** §26.1. Populated automatically by the mandatory field engine. */
  async incomplete(): Promise<DerivedJobView[]> {
    return (await this.listJobs()).filter((j) => !j.mandatoryComplete);
  }
}

/** §35. One chassis, with everything the fleet screen shows. */
export interface FleetUnitView {
  chassisId: string;
  chassisNo: string;
  plateNo: string;
  size: '20FT' | '40FT';
  status: ChassisStatus;
  inspectionDueDate: string | null;
  jobNumber: string | null;
  customer: string | null;
  heldSince: string | null;
  daysHeld: number;
}

export interface FleetView {
  units: FleetUnitView[];
  availability: FleetAvailability;
  averageJobDays: number;
  monthlyCapacity20ft: number;
  monthlyCapacity40ft: number;
}
