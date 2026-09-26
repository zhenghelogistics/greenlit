import type { CustomerLocation, DocumentRecord, PermitRecord } from '@greenlit/engine';
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

  // ---- §18. Movements ------------------------------------------------------
  //
  // The engine has rules about movements being overdue, the role model has
  // five movement permissions, and until now the port could only read them.
  // Planning a trip on screen rewrote a copy in the browser and persisted
  // nothing, which is the same failure the job screen had.
  //
  // §18: movementRef is `MOV-NNN`, unique within the job and never reused
  // after a cancellation, so the reference is allocated by the store rather
  // than by a caller counting what it can see.
  // ---- §29. Containers on an existing job -----------------------------------
  //
  // A job gains a container when a second one turns out to be on the same
  // bill, loses one when it was entered twice, and has its details corrected
  // constantly. None of that could be saved: the screen did all three in React
  // state and wrote nothing down.
  addContainerToJob(
    jobId: string, draft: ImportContainerDraft, actor: string,
  ): Promise<ImportContainer>;
  amendContainer(
    containerId: string, changes: ContainerAmendment, actor: string,
  ): Promise<void>;
  /**
   * §29. Remove a container that should not be on the job.
   *
   * Refused once anything has happened to it — a movement, a free-time
   * confirmation — because by then it is part of the job's history and
   * deleting it would remove the record of work that was really done. The
   * mistake this is for is a container entered twice five minutes ago.
   */
  removeContainerFromJob(containerId: string, actor: string): Promise<void>;

  // ---- §46. Containers on an existing export job ----------------------------
  //
  // A booking is for a number of boxes and that number changes: the shipper
  // finds another pallet, or one slot is released. The same three commands
  // import has, because the reason is the same — a booking is not fixed at the
  // moment it is taken.
  //
  // Separate from the import methods because an export container is a
  // different record: it exists as a slot before it has a number, and its
  // identity is captured at collection (§39).
  /**
   * §11.2. Record the Portnet export declaration for this shipment.
   *
   * One per booking, not per container: the declaration covers the shipment.
   * Separate from amendJob, which would let it be typed in like any other
   * field — this is the moment the box becomes allowed into the port, and it
   * is worth an event of its own on the trail.
   */
  recordExportClearance(
    jobId: string, reference: string, actor: string,
  ): Promise<void>;

  addExportContainer(
    jobId: string, draft: ExportContainerDraft, actor: string,
  ): Promise<ExportContainer>;
  amendExportContainer(
    exportContainerId: string, changes: ExportContainerAmendment, actor: string,
  ): Promise<void>;
  removeExportContainer(exportContainerId: string, actor: string): Promise<void>;

  createMovement(draft: MovementDraft, actor: string): Promise<Movement>;
  /** §19. When it is planned for, and who is driving. */
  scheduleMovement(
    movementId: string, plan: MovementPlan, actor: string,
  ): Promise<void>;
  /**
   * §20. What actually happened.
   *
   * Separate from scheduling because a plan and an outcome are different
   * claims: one is an intention that can move, the other is a fact about the
   * past that should not.
   */
  recordMovementProgress(
    movementId: string, progress: MovementProgress, actor: string,
  ): Promise<void>;
  /**
   * §18.4. Cancelling needs a reason, and the reference is retired with it.
   *
   * Not a delete: a cancelled movement is part of what happened to the job,
   * and the next movement gets the next number rather than the dead one.
   */
  cancelMovement(movementId: string, reason: string, actor: string): Promise<void>;
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
  /**
   * Amend a customer's own details.
   *
   * Everything except the code, which is immutable once issued: every job
   * reference already printed on a document is built from it, so changing it
   * would silently orphan them.
   *
   * There was no way to do this at all — a customer was created with three
   * fields and the rest of the record could only be read. So the way to fix a
   * misspelled company name was to make a second customer, which is the one
   * thing ADR-0007 most wants to avoid.
   */
  amendCustomer(code: string, changes: CustomerChanges, actor: string): Promise<Customer>;

  /**
   * Strike a customer off the master.
   *
   * Refused once the customer has jobs — every reference already issued is
   * built from the code, so removing the company would leave those numbers
   * pointing at nothing. `canDeleteCustomer` in the engine holds the rule and
   * the sentence that says what to do instead.
   *
   * The customer's sites go with it. The audit trail does not: it records what
   * happened, and what happened does not stop having happened.
   */
  deleteCustomer(code: string, actor: string): Promise<void>;
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
   * §33. Close a finished job.
   *
   * The caller checks closureBlockers first; this records the act. Closing is
   * what makes a job billable, which is why reopening is a different
   * permission and needs a reason.
   */
  // ---- §9.3. Customer sites -------------------------------------------------
  //
  // Delivery and stuffing addresses were free text on each job, so the same
  // warehouse was typed a dozen ways and none matched. A list per customer,
  // because a customer may stuff at more than one site and the site is chosen
  // per booking.
  // ---- §10. Documents -------------------------------------------------------
  //
  // Extraction reads a notice, records which page and line every value came
  // from, and discarded the file — so a controller in a demurrage dispute had
  // a quote and nothing to check it against.
  listDocumentsForJob(jobId: string): Promise<readonly DocumentRecord[]>;
  /**
   * Store a file against a job.
   *
   * The bytes go to the store's own file storage; this row is what makes them
   * findable. A second upload of the same document type and filename supersedes
   * the first rather than replacing it: the job was worked off the original,
   * and the history has to still say so.
   */
  storeDocument(
    draft: DocumentDraft, bytes: Uint8Array, actor: string,
  ): Promise<DocumentRecord>;
  /**
   * A link to read one, valid briefly.
   *
   * Minted on demand rather than stored: a stored link expires, and a row
   * pointing at a dead URL is worse than a row that knows how to make a live
   * one. Null where the adapter has no file storage.
   */
  documentUrl(documentId: string, seconds: number): Promise<string | null>;

  listCustomerLocations(customerCode: string): Promise<readonly CustomerLocation[]>;
  addCustomerLocation(
    customerCode: string, draft: CustomerLocationDraft, actor: string,
  ): Promise<CustomerLocation>;
  amendCustomerLocation(
    locationId: string, changes: CustomerLocationDraft, actor: string,
  ): Promise<void>;

  closeJob(jobId: string, actor: string): Promise<void>;
  /** §33.2. Open a billed job again, saying why. */
  reopenJob(jobId: string, reason: string, actor: string): Promise<void>;

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
  /**
   * §42. Record that the customer has been told the container's number.
   *
   * The milestone that unblocks stuffing, and the one command the export flow
   * had no way to perform: the status existed, the next action named it, and
   * nothing could write it down.
   */
  recordContainerDetailsSent(
    containerId: string,
    notice: { sentTo: string; reference?: string | null },
    actor: string,
  ): Promise<void>;
  /**
   * Hand one import container to the controller.
   *
   * The act that puts it on the controller's board. Per container, because
   * containers on one job are chased separately and become ready at different
   * times.
   *
   * There is deliberately no command to take it back. Withdrawing a handover
   * because a later edit re-opened a gap makes rows vanish from the
   * controller's board mid-plan with no explanation; the gap is surfaced
   * instead, to the person best placed to chase it.
   */
  handContainerToController(containerId: string, actor: string): Promise<void>;
  /**
   * Record that a container came off the vessel.
   *
   * Per container, because boxes on one bill of lading are discharged days
   * apart. With Portnet already released this is what makes the container
   * ready to collect, which is why it is a fact somebody confirms rather than
   * a status somebody sets.
   */
  recordDischarged(containerId: string, actor: string): Promise<void>;
  /** Record that a container reached the customer. */
  recordDelivered(containerId: string, actor: string): Promise<void>;
  /**
   * Operations confirm the job is fully gathered.
   *
   * Refused while anything is outstanding, so the mark can never mean less
   * than both claims: no field is empty, and a person checked it.
   */
  markDocumentsComplete(jobId: string, actor: string): Promise<void>;
  /**
   * §36.3. The customer has finished with the container.
   *
   * What moves it into the empty-return queue. The field has existed since the
   * first schema and nothing wrote it, so the queue could only ever be reached
   * by a status somebody set by hand.
   */
  confirmEmptyReady(
    containerId: string,
    /**
     * §36.3. How the customer told us, which is the part worth keeping. "They
     * said so" is not auditable; "WhatsApp, Tuesday, from their warehouse" is.
     */
    source: 'EMAIL' | 'WHATSAPP' | 'PHONE' | 'MANUAL',
    actor: string,
  ): Promise<void>;
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
/** §46. A slot on an export booking, before it is a container. */
export interface ExportContainerDraft {
  sizeType: string;
  stuffingLocation?: string | null;
  isReefer?: boolean;
  temperatureMode?: string | null;
  temperatureSetpointC?: number | null;
}

/** §46. What may be corrected on an export container. */
export interface ExportContainerAmendment {
  sizeType?: string;
  stuffingLocation?: string | null;
  isReefer?: boolean;
  temperatureMode?: string | null;
  temperatureSetpointC?: number | null;
}

/** §29. What may be corrected on a container. */
export interface ContainerAmendment {
  containerNumber?: string | null;
  containerSize?: string | null;
  sealNumber?: string | null;
  grossWeight?: number | null;
  packageCount?: number | null;
  packageType?: string | null;
  emptyReturnYard?: string | null;
}

/** §10. A document as it arrives. */
export interface DocumentDraft {
  jobId: string;
  containerId?: string | null;
  movementId?: string | null;
  documentType: string;
  filename: string;
  source?: string;
  receivedFrom?: string | null;
  extractionStatus?: string;
}

/**
 * §9.3. A site as somebody enters it.
 *
 * Every field optional on an amendment, where absent means leave alone. On a
 * new site the engine's locationProblem decides what is required, so the rule
 * lives in one place rather than in every caller.
 */
/**
 * What may be changed about a customer after it exists.
 *
 * No `code`. It is issued once and every reference printed from it depends on
 * it staying put.
 */
export interface CustomerChanges {
  companyName?: string;
  /** Whether this customer's jobs normally need a permit. */
  requiresPermit?: boolean;
  shortName?: string | null;
  billingName?: string | null;
  defaultContact?: string | null;
  emailDomains?: string[];
  accountStatus?: Customer['accountStatus'];
  notes?: string | null;
}

export interface CustomerLocationDraft {
  /** The company at this address. Defaults to the customer's own name. */
  company?: string;
  label?: string;
  operationalInstructions?: string | null;
  address?: string;
  isDefault?: boolean;
  doubleMountingPermitted?: boolean;
  standbyUsual?: boolean;
  active?: boolean;
}

/** §18. A movement as a controller plans it. */
export interface MovementDraft {
  jobId: string;
  containerId?: string | null;
  movementType: string;
  origin: string;
  originType: string;
  destination: string;
  destinationType: string;
  plannedDate?: string | null;
  plannedTime?: string | null;
}

/** §19. Who is doing it and when. */
export interface MovementPlan {
  plannedDate?: string | null;
  plannedTime?: string | null;
  truck?: string | null;
  driver?: string | null;
}

/** §20. What happened, as it happens. */
export interface MovementProgress {
  movementStatus?: string;
  actualCollectionAt?: string | null;
  actualDeliveryAt?: string | null;
}

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
  /**
   * §34.2. The daily rate and its currency, for the charge estimate.
   *
   * Confirmed alongside the allowance because they come off the same tariff
   * and are read off the same page. Absent is a legitimate answer.
   */
  dailyRate?: number | null;
  currency?: string | null;
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
  /** §47. When the empty is wanted. The clock the job actually runs on. */
  emptyCollectionDate?: string | null;
  emptyCollectionTime?: string | null;
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
