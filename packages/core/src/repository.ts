import type {
  AuditEvent, Chassis, ChassisChange, ChassisChangeRequest, ChassisHolding,
  Customer, CustomerDraft, DateAmendment, Discrepancy, ExceptionRecord, Principal,
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

  /**
   * The same three reads for many jobs at once.
   *
   * A board derives every job from its containers, movements and exceptions,
   * and doing that one job at a time cost three round trips each — fine on a
   * local database, and the dominant cost when the database is a region away.
   * These exist so a board is a fixed number of queries rather than a number
   * that grows with the book.
   *
   * Each returns every matching row across the given jobs; the caller groups
   * them. Grouping is cheap and the alternative — a map across the port —
   * would be a shape every adapter had to build identically.
   */
  listContainersForImportJobs(jobIds: readonly string[]): Promise<ImportContainer[]>;
  listContainersForExportJobs(jobIds: readonly string[]): Promise<ExportContainer[]>;
  listMovementsForJobs(jobIds: readonly string[]): Promise<Movement[]>;
  listOpenExceptionsForJobs(jobIds: readonly string[]): Promise<ExceptionRecord[]>;

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
   * §35.8. A mid-job chassis change is an exception, not a workflow: the
   * system records what was decided rather than deciding it.
   */
  recordChassisChange(request: ChassisChangeRequest, actor: string): Promise<ChassisChange>;
  listChassisChanges(): Promise<ChassisChange[]>;

  /**
   * §13.1. The date amendment log. Separate from the audit stream because the
   * audit stream has nowhere to record WHY a date moved, and why is the whole
   * content of the conversation a controller has when the customer calls.
   */
  listDateAmendments(entityId: string): Promise<DateAmendment[]>;
  amendDate(request: DateAmendmentInput, actor: string): Promise<DateAmendment>;

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

export interface DateAmendmentInput {
  entityType: 'job' | 'container' | 'movement';
  entityId: string;
  dateField: string;
  newValue: string | null;
  reasonCode: string;
  reasonNote?: string | null;
}

/**
 * A container as it arrives from an arrival notice.
 *
 * Only the identity: everything else about a container is either derived or
 * recorded later by a person against a named event.
 */
export interface ImportContainerDraft {
  containerNumber?: string | null;
  sizeType?: string | null;
  sealNumber?: string | null;
  grossWeight?: number | null;
  packageCount?: number | null;
  packageType?: string | null;
  freeTimeModel?: string | null;
  demurrageFreeDays?: number | null;
  detentionFreeDays?: number | null;
  combinedFreeDays?: number | null;
  freeTimeRemarks?: string | null;
}

export interface ImportJobDraft {
  customerCode: string;
  /**
   * The containers the arrival notice named.
   *
   * A job with none cannot progress: free time is per container (§29.1), and
   * every container command needs one to address. One empty container is
   * created when none is supplied, so a job entered before its notice arrives
   * still has somewhere to record the number when it comes.
   */
  containers?: ImportContainerDraft[];
  blNumber?: string | null;
  /** The forwarder's bill, where one exists. Optional: a direct carrier booking has none. */
  houseBlNumber?: string | null;
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
