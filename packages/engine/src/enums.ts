/**
 * Canonical enumerations. Source: PRD Appendix B, which is authoritative.
 *
 * Every value here is the stored representation. Display names live in the UI
 * layer, never in the engine — §19 is explicit that the enum identifier is what
 * the API and database use.
 */

/** §19. Stored, never inferred from origin and destination. */
export const MOVEMENT_TYPE = [
  'IMPORT_DELIVERY',
  'EMPTY_RETURN',
  'IMPORT_TO_CARPARK',
  'CARPARK_TO_CUSTOMER',
  'EMPTY_COLLECTION',
  'DIRECT_LADEN_TO_PORT',
  'ONE_WAY_LOADED',
  'CARPARK_TO_PORT',
  'LADEN_SITE_TO_SITE',
] as const;
export type MovementType = (typeof MOVEMENT_TYPE)[number];

/** §20 */
export const MOVEMENT_STATUS = [
  'PENDING',
  'READY_FOR_SCHEDULING',
  'SCHEDULED',
  'ASSIGNED',
  'COLLECTED',
  'IN_TRANSIT',
  'DELIVERED',
  'ON_STANDBY',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLED',
  'EXCEPTION',
] as const;
export type MovementStatus = (typeof MOVEMENT_STATUS)[number];

/** §17. PART_LADEN applies only to multi-stop stuffing, §46.3. */
export const CARGO_STATE = ['EMPTY', 'PART_LADEN', 'LADEN'] as const;
export type CargoState = (typeof CARGO_STATE)[number];

/** §17 */
export const LOCATION_TYPE = ['YARD', 'CUSTOMER', 'CARPARK', 'PORT', 'TERMINAL'] as const;
export type LocationType = (typeof LOCATION_TYPE)[number];

/** §9.2 */
export const FREE_TIME_MODEL = ['SPLIT', 'COMBINED'] as const;
export type FreeTimeModel = (typeof FREE_TIME_MODEL)[number];

export const FREE_TIME_COUNTS_FROM = ['VESSEL_ETA', 'DISCHARGE', 'GATE_OUT'] as const;
export type FreeTimeCountsFrom = (typeof FREE_TIME_COUNTS_FROM)[number];

/** §44.2.1. Warns, never blocks. */
export const PORTNET_PROCESSED = ['PENDING', 'PROCESSED', 'FAILED'] as const;
export type PortnetProcessed = (typeof PORTNET_PROCESSED)[number];

/** §9.4 */
export const TEMPERATURE_MODE = ['PRE_COOL', 'PRE_SET'] as const;
export type TemperatureMode = (typeof TEMPERATURE_MODE)[number];

/** §13.1. OTHER requires reason_note. */
export const DATE_AMENDMENT_REASON = [
  'CUSTOMER_REQUEST',
  'VESSEL_DELAY',
  'VESSEL_EARLY',
  'PORTNET_ETA_CHANGE',
  'YARD_WINDOW_CHANGE',
  'CUSTOMER_NO_SPACE',
  'EQUIPMENT',
  'INTERNAL_RESCHEDULE',
  'OTHER',
] as const;
export type DateAmendmentReason = (typeof DATE_AMENDMENT_REASON)[number];

/** §36.2. Decides who we are waiting on — not cosmetic. */
export const IMPORT_CARPARK_REASON = ['CUSTOMER_NO_SPACE', 'CONTROLLER_DECISION'] as const;
export type ImportCarparkReason = (typeof IMPORT_CARPARK_REASON)[number];

/** §36.3 */
export const EMPTY_READY_SOURCE = ['EMAIL', 'WHATSAPP', 'PHONE', 'MANUAL'] as const;
export type EmptyReadySource = (typeof EMPTY_READY_SOURCE)[number];

/** §21.3 */
export const STANDBY_INSTRUCTION_SOURCE = ['BOOKING', 'EMAIL', 'PHONE', 'MANUAL'] as const;
export type StandbyInstructionSource = (typeof STANDBY_INSTRUCTION_SOURCE)[number];

/** §40.2. NOT_REQUIRED is an explicit permissioned choice, never a default. */
export const CMS_STATUS = ['PENDING', 'COMPLETED', 'NOT_REQUIRED'] as const;
export type CmsStatus = (typeof CMS_STATUS)[number];

/** §44.1. PENDING is a blocking state, not an absence of data. */
export const TRANSHIPMENT_STATUS = ['PENDING', 'AVAILABLE', 'NOT_AVAILABLE'] as const;
export type TranshipmentStatus = (typeof TRANSHIPMENT_STATUS)[number];

/** §25.2 */
export const WAITING_ON = ['US', 'CUSTOMER', 'CARRIER', 'NOBODY'] as const;
export type WaitingOn = (typeof WAITING_ON)[number];

/** §27.1 */
export const EXCEPTION_SEVERITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type ExceptionSeverity = (typeof EXCEPTION_SEVERITY)[number];

/** §13 */
export const AUDIT_SOURCE = ['USER', 'EMAIL_AUTOMATION', 'AI_EXTRACTION', 'SYSTEM_RULE', 'API'] as const;
export type AuditSource = (typeof AUDIT_SOURCE)[number];

/** §11.3 */
export const EMAIL_PROCESSING_STATUS = ['AUTO_PROCESSED', 'REVIEW_REQUIRED', 'UNMATCHED', 'FAILED'] as const;
export type EmailProcessingStatus = (typeof EMAIL_PROCESSING_STATUS)[number];

/** §34.5 */
export const DD_RISK_LEVEL = ['GREEN', 'AMBER', 'RED', 'CRITICAL'] as const;
export type DdRiskLevel = (typeof DD_RISK_LEVEL)[number];

export const JOB_DOMAIN = ['IMPORT', 'EXPORT'] as const;
export type JobDomain = (typeof JOB_DOMAIN)[number];

/** §32.1 */
export const IMPORT_CONTAINER_STATUS = [
  'New', 'Incomplete', 'Awaiting Permit', 'Awaiting Portnet', 'Ready for Collection',
  'Scheduled', 'Collected', 'Delivered', 'Empty Return Pending', 'Empty Returned',
  'On Hold', 'Cancelled', 'Exception',
] as const;
export type ImportContainerStatus = (typeof IMPORT_CONTAINER_STATUS)[number];

/** §32.2 */
export const IMPORT_JOB_STATUS = [
  'New', 'Processing', 'Incomplete', 'Awaiting Permit', 'Awaiting Portnet',
  'Ready for Collection', 'Transport Assigned', 'Partially Collected', 'Collected',
  'Partially Delivered', 'Delivered', 'Empty Return Pending', 'Completed',
  'On Hold', 'Cancelled', 'Exception',
] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUS)[number];

/** §45.1 and §45.4 */
export const EXPORT_JOB_STATUS = [
  'New Export Job', 'Incomplete', 'Awaiting CMS', 'Ready for Empty Collection',
  'Empty Collection Scheduled', 'Empty Collected', 'Empty Delivered',
  'Awaiting Container Details Notification', 'Awaiting Customer Stuffing',
  'Container Ready', 'Awaiting VGM', 'Awaiting T/T', 'Ready for One-Way Loaded Trip',
  'Ready for Laden Collection', 'Laden Collection Scheduled', 'Laden Collected',
  'At Carpark', 'Ready for Port Delivery', 'Port Delivery Scheduled',
  'Partially Collected', 'Partially Delivered', 'Delivered to Port', 'Completed',
  'On Hold', 'Cancelled', 'Exception',
] as const;
export type ExportJobStatus = (typeof EXPORT_JOB_STATUS)[number];

/**
 * §32.2 / §45.1. The only statuses a user may set directly, each requiring a
 * reason. Everything else is derived.
 */
export const USER_SETTABLE_STATUS = ['On Hold', 'Cancelled', 'Exception'] as const;
export type UserSettableStatus = (typeof USER_SETTABLE_STATUS)[number];
