import type {
  CargoState, CmsStatus, EmptyReadySource, ExceptionSeverity, ExportJobStatus,
  FreeTimeCountsFrom, FreeTimeModel, ImportCarparkReason, ImportContainerStatus,
  ImportJobStatus, JobDomain, LocationType, MovementStatus, MovementType,
  PortnetProcessed, StandbyInstructionSource, TemperatureMode, TranshipmentStatus,
  WaitingOn,
} from './enums.ts';

/** ISO date, `YYYY-MM-DD`. */
export type IsoDate = string;
/** ISO 8601 instant, UTC. §14.5 stores UTC and displays Asia/Singapore. */
export type IsoInstant = string;

/**
 * §17. One physical truck journey. One table, both domains — §55 is explicit
 * that the engine cannot be written once against two tables.
 */
export interface Movement {
  movementId: string;
  /** §18. `MOV-NNN`, unique within the job, never reused after cancellation. */
  movementRef: string;
  jobId: string;
  jobDomain: JobDomain;
  jobNumber: string;
  /** Null on EMPTY_COLLECTION until identity is captured, §39. */
  containerId: string | null;
  containerNumber: string | null;
  /** §17.1. Double mounting only: the second container on the same chassis. */
  secondaryContainerId: string | null;
  isDoubleMounted: boolean;
  movementType: MovementType;
  cargoState: CargoState;
  originType: LocationType;
  origin: string;
  destinationType: LocationType;
  destination: string;
  plannedDate: IsoDate | null;
  plannedTime: string | null;
  truck: string | null;
  driver: string | null;
  /** §35.2. Inherited from the job, not chosen per trip. */
  chassisId: string | null;
  movementStatus: MovementStatus;
  actualCollectionAt: IsoInstant | null;
  actualDeliveryAt: IsoInstant | null;
  /** §21.3 */
  standbyRequired: boolean;
  standbyStartedAt: IsoInstant | null;
  standbyEndedAt: IsoInstant | null;
  /** §22. True when created by the engine. */
  autoCreated: boolean;
  cancelledReason: string | null;
}

/** §29. Import container. A job may hold one or many. */
export interface ImportContainer {
  containerId: string;
  /**
   * When operations handed this container to the controller, if they have.
   *
   * An instant rather than a flag, because the question asked afterwards is
   * always "when did this land on my board" — and because the handover is
   * something a person did, not a state the system worked out.
   */
  handedOverAt: IsoInstant | null;
  handedOverBy: string | null;
  /**
   * When this container came off the vessel.
   *
   * Per container, not per job: boxes on one bill of lading are discharged
   * separately and sometimes days apart, and a job-level date would be wrong
   * for all but one of them.
   */
  dischargedAt: IsoInstant | null;
  /** When it reached the customer. */
  deliveredAt: IsoInstant | null;
  /**
   * The date agreed with the customer, which is not the date it arrived.
   *
   * What operations enter and the controller plans around. `deliveredAt`
   * records what happened; this records what was promised, and the two are
   * worth comparing.
   */
  plannedDeliveryDate: IsoDate | null;
  /** A half-hour, or null when the day is agreed and the hour is not. */
  plannedDeliveryTime: string | null;
  /**
   * §39. Null until the arrival notice arrives.
   *
   * A job is opened when the customer calls and the notice follows, so the
   * container row exists before its number does. The type said `string`, the
   * in-memory adapter produced null, and the database refused it — three
   * answers to one question, and the design was the one the type disagreed
   * with.
   */
  containerNumber: string | null;
  jobId: string;
  containerSize: string;
  containerType: string;
  sealNumber: string | null;
  grossWeight: number | null;
  /**
   * §11. What the notice counted, and in what.
   *
   * Two fields rather than one string: "300" is comparable across documents
   * and "CASE" is not a number. A count without its unit cannot be checked
   * against a delivery, which is the reason to record it at all.
   */
  packageCount: number | null;
  packageType: string | null;
  cargoDescription: string | null;
  portTerminal: string | null;
  emptyReturnYard: string | null;
  /** §34. Both counts are stored; neither is discarded for the other. */
  freeTimeModel: FreeTimeModel;
  freeTimeCountsFrom: FreeTimeCountsFrom;
  demurrageFreeDays: number | null;
  demurrageLfd: IsoDate | null;
  detentionFreeDays: number | null;
  detentionLfd: IsoDate | null;
  combinedFreeDays: number | null;
  combinedLfd: IsoDate | null;
  /**
   * §34. The allowance as the carrier worded it.
   *
   * "10 combined calendar days from discharge" and "detention starts after
   * empty return notification" are terms a number cannot carry. Kept verbatim
   * so a controller can see what was actually written before trusting the
   * count derived from it.
   */
  freeTimeRemarks: string | null;
  /**
   * §34.2. What a chargeable day costs, and in what money.
   *
   * Null where commercial terms have not been filed, which §34.2 explicitly
   * permits: "the MVP may leave rates blank where commercial rates are
   * unavailable. The countdowns do not depend on them." The charge estimate
   * does, and says so rather than showing nothing owed.
   */
  dailyRate: number | null;
  currency: string | null;
  /** §34.1. Internal standard, counted from vessel ETA for every container. */
  internalLfd: IsoDate | null;
  /** §36.2 */
  carparkReason: ImportCarparkReason | null;
  carparkArrivedAt: IsoInstant | null;
  /** §36.3. The customer tells us the container is empty before we collect. */
  emptyReadyConfirmed: boolean;
  emptyReadyConfirmedAt: IsoInstant | null;
  emptyReadySource: EmptyReadySource | null;
  chassisId: string | null;
  chassisMountedAt: IsoInstant | null;
  chassisReleasedAt: IsoInstant | null;
  /** User-settable only, §32.1 rows 1–2. */
  cancelled: boolean;
  onHold: boolean;
}

/** §28 */
export interface ImportJob {
  /**
   * §33. When someone closed this job, and who.
   *
   * A stored fact, not a derivation: the engine can see every container is
   * back, but only a controller knows the paperwork is out. jobStatus reads
   * Completed because this is set.
   */
  closedAt: IsoInstant | null;
  closedBy: string | null;

  jobId: string;
  jobNumber: string;
  customer: string;
  blNumber: string | null;
  /**
   * §29. The forwarder's bill of lading, where the shipment moves under one.
   *
   * Separate from blNumber rather than overloading it: the master bill is the
   * contract between the carrier and the forwarder, the house bill the one
   * between the forwarder and the shipper. They identify different parties,
   * and a document carrying both is the normal case for forwarded cargo.
   */
  houseBlNumber: string | null;
  vesselName: string | null;
  voyageNumber: string | null;
  eta: IsoDate | null;
  jobType: string;
  deliveryAddress: string | null;
  /** §31 gate conditions. Not mandatory fields — §30 forbids double-counting. */
  /**
   * When operations confirmed the job is fully gathered, if they have.
   *
   * Distinct from the computed outstanding list. That knows whether a field is
   * empty; this records that a person checked the whole thing against the
   * paperwork and agreed. The controller plans free time against the second.
   */
  documentsCompletedAt: IsoInstant | null;
  documentsCompletedBy: string | null;
  permitRequired: boolean;
  permitReceived: boolean;
  permitRejected: boolean;
  portnetRequired: boolean;
  portnetReleased: boolean;
  assignedController: string | null;
  cancelled: boolean;
  onHold: boolean;
  createdAt: IsoInstant;
}

/** §38.2. Created when the job is created, identified later. */
export interface ExportContainer {
  exportContainerId: string;
  exportJobId: string;
  /** `C1`, `C2`, scoped to the job. Used before identity is captured. */
  containerRef: string;
  containerNumber: string | null;
  sealNumber: string | null;
  tareWeightKg: number | null;
  sizeType: string;
  isReefer: boolean;
  temperatureMode: TemperatureMode | null;
  temperatureSetpointC: number | null;
  stuffingLocation: string | null;
  containerDetailsSent: boolean;
  /**
   * §42. Who was told, by whom, and where the message is.
   *
   * "The send is recorded: sent flag, timestamp, sender, recipient address,
   * and a stored copy or message reference." The flag alone answers "was it
   * sent"; the question that actually gets asked when stuffing has not
   * started is "who told whom, and where is it".
   */
  containerDetailsSentTo: string | null;
  containerDetailsSentBy: string | null;
  containerDetailsReference: string | null;
  containerDetailsSentAt: IsoInstant | null;
  containerReady: boolean;
  containerReadyAt: IsoInstant | null;
  vgm: number | null;
  vgmReceivedAt: IsoInstant | null;
  /** §44.2.1. Warns, never blocks the laden gate. */
  portnetProcessed: PortnetProcessed;
  chassisId: string | null;
  /** §38.2, §35.2. Occupancy runs from mount to release, for the whole job. */
  chassisMountedAt: IsoInstant | null;
  chassisReleasedAt: IsoInstant | null;
  carparkArrivedAt: IsoInstant | null;
  cancelled: boolean;
  onHold: boolean;
}

/** §38.1. The commercial header. Container detail lives on ExportContainer. */
export interface ExportJob {
  /**
   * §33. When someone closed this job, and who.
   *
   * A stored fact, not a derivation: the engine can see every container is
   * back, but only a controller knows the paperwork is out. jobStatus reads
   * Completed because this is set.
   */
  closedAt: IsoInstant | null;
  closedBy: string | null;

  exportJobId: string;
  jobNumber: string;
  customer: string;
  shipper: string | null;
  bookingReference: string | null;
  exportClearanceReference: string | null;
  carrier: string | null;
  vesselName: string | null;
  voyageNumber: string | null;
  etaSingapore: IsoDate | null;
  vesselClosingAt: IsoInstant | null;
  emptyCollectionYard: string | null;
  /**
   * §47. When the empty is wanted.
   *
   * The clock this job actually runs on. CMS is chased against it and never
   * the vessel: the empty is usually due weeks before the ship sails, so a job
   * measured against the sailing looks comfortable right up to the morning the
   * truck cannot go.
   */
  emptyCollectionDate: IsoDate | null;
  emptyCollectionTime: string | null;
  cmsRequired: boolean;
  cmsStatus: CmsStatus;
  containerQuantity: number;
  containerSizeType: string | null;
  /** §38.1. Fixed by the yard booking; amendable only by agreement. */
  truckInDate: IsoDate | null;
  truckOutDate: IsoDate | null;
  standbyRequired: boolean;
  standbyInstructionSource: StandbyInstructionSource | null;
  standbyExpectedMinutes: number | null;
  /** §44.1. Held at job level: a property of the booking, not of a box. */
  transhipmentStatus: TranshipmentStatus;
  transhipmentCheckedAt: IsoInstant | null;
  carparkRequested: boolean;
  assignedController: string | null;
  cancelled: boolean;
  onHold: boolean;
  createdAt: IsoInstant;
}

/** §27.1. One shape, serving both domains. */
export interface ExceptionRecord {
  exceptionId: string;
  jobId: string;
  jobDomain: JobDomain;
  containerId: string | null;
  movementId: string | null;
  exceptionType: string;
  severity: ExceptionSeverity;
  /** Whether it prevents progression. Drives status rows 3 in §32/§45. */
  blocking: boolean;
  waitingOn: WaitingOn;
  detectedAt: IsoInstant;
  resolvedAt: IsoInstant | null;
}

/**
 * §9 / §56. Every threshold in the PRD is configurable per customer or
 * globally and must not be hard-coded. Values in days unless named otherwise.
 */
export interface Thresholds {
  movementOverdueHours: number;
  emptyReadyConfirmationOverdueDays: number;
  containerDetailsNotSentHours: number;
  stuffingOverdueDays: number;
  vgmOverdueDays: number;
  transhipmentUnresolvedDays: number;
  carparkDwellDays: number;
  emptyReturnOverdueDays: number;
  portnetNotProcessedDays: number;
  ddCriticalDays: number;
}

/** §30 / §40.1. The configured mandatory set, resolved per job type. */
export interface MandatoryFieldSet {
  fields: readonly string[];
}

/** The three derived values in §3. None may ever be typed by a user. */
export interface NextActionResult {
  nextActionRequired: string;
  blockingReason: string | null;
  waitingOn: WaitingOn;
}

export type { ImportContainerStatus, ImportJobStatus, ExportJobStatus };
