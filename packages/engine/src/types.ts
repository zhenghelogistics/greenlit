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
  containerNumber: string;
  jobId: string;
  containerSize: string;
  containerType: string;
  sealNumber: string | null;
  grossWeight: number | null;
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
  jobId: string;
  jobNumber: string;
  customer: string;
  blNumber: string | null;
  vesselName: string | null;
  voyageNumber: string | null;
  eta: IsoDate | null;
  jobType: string;
  deliveryAddress: string | null;
  /** §31 gate conditions. Not mandatory fields — §30 forbids double-counting. */
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
  containerDetailsSentAt: IsoInstant | null;
  containerReady: boolean;
  containerReadyAt: IsoInstant | null;
  vgm: number | null;
  vgmReceivedAt: IsoInstant | null;
  /** §44.2.1. Warns, never blocks the laden gate. */
  portnetProcessed: PortnetProcessed;
  chassisId: string | null;
  carparkArrivedAt: IsoInstant | null;
  cancelled: boolean;
  onHold: boolean;
}

/** §38.1. The commercial header. Container detail lives on ExportContainer. */
export interface ExportJob {
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
