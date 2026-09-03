import type {
  AuditEvent, Chassis, ChassisHolding, Customer, CustomerDraft, Discrepancy,
  ExceptionRecord, Principal,
  ExportContainer, ExportJob, ImportContainer, ImportJob, Movement, Thresholds,
} from '@greenlit/engine';

/**
 * The storage port.
 *
 * Everything above this line is domain logic; everything below it is a
 * database. Today the only implementation is in-memory dummy data. When
 * Supabase arrives it becomes a second implementation of this same interface
 * and **nothing else in the codebase changes**.
 *
 * Two rules keep that promise:
 *
 * 1. Every method is async. A synchronous port would work fine against an
 *    in-memory Map and then force a rewrite of every caller the day a real
 *    query appears.
 * 2. No storage type is named here — no Drizzle row, no Postgres client, no
 *    Supabase response envelope. Only domain records cross this boundary.
 */
export interface Repository {
  listImportJobs(): Promise<ImportJob[]>;
  getImportJob(jobId: string): Promise<ImportJob | null>;
  listExportJobs(): Promise<ExportJob[]>;
  getExportJob(jobId: string): Promise<ExportJob | null>;

  listContainersForImportJob(jobId: string): Promise<ImportContainer[]>;
  listContainersForExportJob(jobId: string): Promise<ExportContainer[]>;

  listMovementsForJob(jobId: string): Promise<Movement[]>;
  listOpenExceptionsForJob(jobId: string): Promise<ExceptionRecord[]>;

  getThresholds(customerId?: string): Promise<Thresholds>;

  /**
   * §9.1. The chassis fleet is master data: fixed in size, every unit
   * registered. §35.3 derives status from these plus the holdings, so neither
   * carries a status field of its own.
   */
  /**
   * The customer master. Retainer customers are the organising unit of the
   * operation (ADR-0007), so this is load-bearing rather than reference data.
   */
  listCustomers(): Promise<Customer[]>;
  getCustomerByCode(code: string): Promise<Customer | null>;
  createCustomer(draft: CustomerDraft, actor: string): Promise<Customer>;
  /** Every job reference issued, for deriving the next one. */
  listJobReferences(): Promise<string[]>;
  /**
   * ADR-0007. The next reference for a customer, derived from those already
   * issued rather than a stored counter.
   */
  nextReferenceFor(customerCode: string): Promise<string>;

  /**
   * Job creation. A job is created against a customer and issued a reference
   * scoped to them (ADR-0007).
   *
   * Deliberately permissive about content: §26.1's Incomplete queue exists
   * because a job legitimately starts before its mandatory information is
   * known. What creation requires is a customer and an actor, not completeness.
   */
  createImportJob(draft: ImportJobDraft, actor: string): Promise<ImportJob>;
  createExportJob(draft: ExportJobDraft, actor: string): Promise<ExportJob>;

  /**
   * §7. The user directory. Permissions are answered server-side (§14.1), so
   * a command resolves its principal here rather than trusting anything the
   * caller asserts about itself.
   */
  getPrincipal(userId: string): Promise<Principal | null>;
  listPrincipals(): Promise<Principal[]>;

  listChassis(): Promise<Chassis[]>;
  listChassisHoldings(): Promise<ChassisHolding[]>;

  /**
   * Commands. Deliberately narrow: only the milestones that move a gate.
   *
   * §54 requires derived values to be read-only through the API, so there is
   * no `setJobStatus`, no `setNextAction` and no `setLocation` here — by
   * construction, not by convention. If the engine can be bypassed, it will be.
   */
  recordCms(jobId: string, status: 'COMPLETED' | 'NOT_REQUIRED', actor: string, reason?: string): Promise<void>;
  recordPermitReceived(jobId: string, permitNumber: string, actor: string): Promise<void>;
  recordPortnetReleased(jobId: string, actor: string): Promise<void>;
  captureContainerIdentity(
    containerId: string,
    details: { containerNumber: string; sealNumber: string; tareWeightKg: number },
    actor: string,
  ): Promise<void>;
  recordTranshipment(jobId: string, status: 'AVAILABLE' | 'NOT_AVAILABLE', actor: string): Promise<void>;
  recordContainerReady(containerId: string, actor: string): Promise<void>;
  recordVgm(containerId: string, vgm: number, actor: string): Promise<void>;

  /**
   * §13. The job's audit stream, oldest first. Append-only: there is
   * deliberately no update or delete, which is how "critical audit events
   * cannot be deleted or edited" is enforced at the port.
   */
  listAuditEvents(entityId: string): Promise<AuditEvent[]>;

  /**
   * §12. Discrepancies are records, not transient UI state.
   *
   * "The controller decides which value becomes current, and that decision is
   * audited" — which is only possible if the discrepancy outlives the screen
   * that showed it.
   */
  listOpenDiscrepancies(jobId: string): Promise<StoredDiscrepancy[]>;
  raiseDiscrepancy(jobId: string, discrepancy: Discrepancy, actor: string): Promise<void>;
  /**
   * Choosing `extracted` writes the extracted value; `stored` leaves it.
   * Either way the decision is closed with who and when.
   */
  resolveDiscrepancy(
    jobId: string, field: string, choice: 'stored' | 'extracted', actor: string,
  ): Promise<void>;
}

export interface ImportJobDraft {
  customerCode: string;
  blNumber?: string | null;
  vesselName?: string | null;
  voyageNumber?: string | null;
  eta?: string | null;
  deliveryAddress?: string | null;
  jobType?: string;
  permitRequired?: boolean;
  portnetRequired?: boolean;
  assignedController?: string | null;
}

export interface ExportJobDraft {
  customerCode: string;
  shipper?: string | null;
  bookingReference?: string | null;
  exportClearanceReference?: string | null;
  vesselName?: string | null;
  voyageNumber?: string | null;
  etaSingapore?: string | null;
  emptyCollectionYard?: string | null;
  containerQuantity?: number;
  containerSizeType?: string | null;
  truckInDate?: string | null;
  truckOutDate?: string | null;
  cmsRequired?: boolean;
  assignedController?: string | null;
}

/** A raised discrepancy, with its resolution once decided. */
export interface StoredDiscrepancy extends Discrepancy {
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: 'stored' | 'extracted' | null;
}

/**
 * §13. The audit stream. AuditEvent itself lives in @greenlit/engine, because
 * what makes an entry valid — a named actor, a named rule for system changes —
 * is a rule, not a storage concern.
 */
export type { AuditEvent } from '@greenlit/engine';
