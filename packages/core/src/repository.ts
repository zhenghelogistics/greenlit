import type { PermitRecord } from '@greenlit/engine';
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
  /**
   * §34. Confirm what free time the carrier actually gives this container.
   *
   * The one §34 value a person sets rather than the engine deriving: the
   * carrier's terms are a fact about the booking, not something computable
   * from it. Everything after — which clocks exist, how many days remain,
   * whether a charge is running — follows from this and is derived.
   *
   * Without it a container was stuck: a document that did not state free time
   * left the model NOT_CONFIRMED forever, and NOT_CONFIRMED shows no
   * countdown, so the clock could never start.
   */
  recordFreeTime(
    containerId: string,
    terms: FreeTimeTerms,
    actor: string,
  ): Promise<void>;

  createImportJob(draft: ImportJobDraft, actor: string): Promise<ImportJob>;
  createExportJob(draft: ExportJobDraft, actor: string): Promise<ExportJob>;

  /**
   * §7. The user directory. Permissions are answered server-side (§14.1), so
   * a command resolves its principal here rather than trusting anything the
   * caller asserts about itself.
   */
  getPrincipal(userId: string): Promise<Principal | null>;
  /**
   * §7. Who is signed in, resolved from the address they signed in with.
   *
   * The one lookup authentication needs: a verified session carries an email,
   * and the directory says what that person may do. Null when the address has
   * no principal — an account can exist in Supabase without being staff here,
   * and that has to read as "not one of ours" rather than as an error.
   */
  getPrincipalByEmail(email: string): Promise<Principal | null>;

  /**
   * §7.1. Add someone to the directory, or change what they may do.
   *
   * An administrator's job, and deliberately not a self-service one: a person
   * who can choose their own role has no role. Signing in proves who you are;
   * the directory decides what that means, and somebody else writes it.
   *
   * Deactivating rather than deleting, because §13 requires that every past
   * change still names the person who made it. A deleted principal would
   * orphan their own audit trail.
   */
  /**
   * §7. The principal for someone who has just registered, creating it if this
   * is their first sign-in.
   *
   * Registration happens in Supabase, which knows nothing about roles. This is
   * where an authenticated stranger becomes a named member of staff — once,
   * idempotently, because it runs on every sign-in and only the first one may
   * create anything.
   *
   * The role is decided by joiningRole and is never taken from the caller: a
   * person who could pass their own role to this would be choosing it.
   */
  ensurePrincipal(
    email: string,
    displayName: string,
    role: string,
  ): Promise<Principal>;

  upsertPrincipal(draft: PrincipalDraft, actor: string): Promise<Principal>;
  /**
   * Switch an account off, or back on.
   *
   * Not named setPrincipalActive: §54's guard forbids any port method shaped
   * like a setter, so that derived values cannot be written. The rule is
   * deliberately blunt — it does not try to judge which setter is innocent,
   * because the one that slips through would be the one that matters.
   */
  changePrincipalAccess(userId: string, active: boolean, actor: string): Promise<void>;

  /**
   * §7.1. Remove someone from the directory outright.
   *
   * Safe because §13's audit trail stores the actor as text, not as a
   * reference: every past change still names the person who made it after
   * their row is gone. I previously refused to build this on the grounds that
   * deletion would orphan the trail — it does not, and the schema says so.
   *
   * Switching off remains the right move for someone who has left but whose
   * work is still being closed out; removal is for a row that should never
   * have existed, which is most of what a seeded directory contains.
   */
  removePrincipal(userId: string, actor: string): Promise<void>;

  // ---- §24. Permits ---------------------------------------------------------
  //
  // Held at job level, referenced by containers. No method writes a validation
  // verdict: whether a permit matches its sailing is derived from the job on
  // every read, because a stored verdict survives the amendment that
  // invalidates it.
  listPermitsForJob(jobId: string): Promise<readonly PermitRecord[]>;
  listPermitsForJobs(jobIds: readonly string[]): Promise<readonly JobPermits[]>;
  recordPermit(jobId: string, draft: PermitDraft, actor: string): Promise<PermitRecord>;
  /**
   * Which containers this permit covers, replacing whatever it covered before.
   *
   * Replacing rather than adding, because "copy to selected" states the
   * intended relationship for the whole permit: a container the controller has
   * unticked must stop being covered, and an add-only call could never say so.
   */
  linkPermitToContainers(
    permitId: string, containerIds: readonly string[], actor: string,
  ): Promise<void>;
  removePermit(permitId: string, actor: string): Promise<void>;
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
   * §30. Correct the facts on a job after it has been created.
   *
   * Creation is not the only moment a job is described. A vessel is amended, a
   * house bill arrives late, a delivery address turns out to be the wrong one
   * of a customer's three — and until now none of that could be recorded: the
   * screen let someone type a correction, showed it, and persisted nothing, so
   * it survived until the next reload.
   *
   * Only stored facts. Status, location, next action and blocking reason are
   * computed from these and stay unwritable (§54), so this cannot be used to
   * assert a state the evidence does not support.
   *
   * Dates keep their own path: §30 wants a reason recorded against a moved
   * ETA, and amendDate is where that lives.
   */
  amendJob(jobId: string, changes: JobAmendment, actor: string): Promise<void>;

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
/**
 * §30. What may be corrected on a job after creation.
 *
 * Every key is optional and absent means "leave it alone", which is different
 * from null. Null is a deliberate erasure — a house bill that turns out not to
 * exist — and a field the caller did not mention must not be cleared because
 * it was not mentioned.
 */
export interface JobAmendment {
  blNumber?: string | null;
  houseBlNumber?: string | null;
  vesselName?: string | null;
  voyageNumber?: string | null;
  deliveryAddress?: string | null;
  terminal?: string | null;
  emptyReturnYard?: string | null;

  // Export.
  shipper?: string | null;
  bookingReference?: string | null;
  exportClearanceReference?: string | null;
  emptyCollectionYard?: string | null;
  vesselClosingAt?: string | null;
}

/** §24. A permit as a person enters it. */
export interface PermitDraft {
  permitNumber?: string | null;
  expiryDate?: string | null;
  permitVesselVoyage?: string | null;
  fileName?: string | null;
  /** Containers it covers. Empty is legitimate: a permit can arrive untagged. */
  containerIds?: readonly string[];
}

/** Permits grouped by the job they belong to, for a batched read. */
export interface JobPermits {
  jobId: string;
  permits: readonly PermitRecord[];
}

/** §7.1. A person in the directory. */
export interface PrincipalDraft {
  userId: string;
  displayName: string;
  role: string;
  /** What they sign in with. Null for someone named before they have an account. */
  email?: string | null;
}

/** §34. What a carrier gives, as a person confirms it. */
export interface FreeTimeTerms {
  /** SPLIT, COMBINED, or NOT_CONFIRMED to put it back to unknown. */
  freeTimeModel: string;
  demurrageFreeDays?: number | null;
  demurrageLfd?: string | null;
  detentionFreeDays?: number | null;
  detentionLfd?: string | null;
  combinedFreeDays?: number | null;
  combinedLfd?: string | null;
  /** The terms as the carrier worded them, where a number cannot carry them. */
  freeTimeRemarks?: string | null;
}

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
  /**
   * §47. When the vessel closes.
   *
   * The deadline an export job is worked against, and the reason export is
   * urgent at all: miss it and the box rolls to the next vessel. It was
   * absent from this draft, so a booking confirmation could be read, the
   * closing extracted, and the job created without it — arriving with no
   * deadline at all.
   */
  vesselClosingAt?: string | null;
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
