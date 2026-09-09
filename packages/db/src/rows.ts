/**
 * Row shapes and the mapping to domain records.
 *
 * Postgres is snake_case and the domain is camelCase, so the translation lives
 * here and nowhere else. Keeping it in one file is what stops a column name
 * leaking into a service or a screen.
 */
import type {
  Chassis, ChassisChange, ChassisHolding, Customer, DateAmendment, ExceptionRecord,
  ExportContainer, ExportJob, ImportContainer, ImportJob, Movement, Principal,
} from '@greenlit/engine';

const nn = <T>(v: T | null | undefined): T | null => (v === undefined ? null : v);

export const toCustomer = (r: Record<string, unknown>): Customer => ({
  customerId: r.customer_id as string,
  code: r.code as string,
  companyName: r.company_name as string,
  shortName: nn(r.short_name as string),
  billingName: nn(r.billing_name as string),
  defaultConsignee: nn(r.default_consignee as string),
  defaultDeliveryAddress: nn(r.default_delivery_address as string),
  defaultContact: nn(r.default_contact as string),
  emailDomains: (r.email_domains as string[]) ?? [],
  accountStatus: r.account_status as Customer['accountStatus'],
  notes: nn(r.notes as string),
  createdAt: r.created_at as string,
});

export const toPrincipal = (r: Record<string, unknown>): Principal => ({
  userId: r.user_id as string,
  displayName: r.display_name as string,
  role: r.role as Principal['role'],
  extraPermissions: (r.extra_permissions as Principal['extraPermissions']) ?? [],
  active: r.active as boolean,
});

export const toImportJob = (r: Record<string, unknown>): ImportJob => ({
  jobId: r.job_id as string,
  jobNumber: r.job_number as string,
  customer: r.customer as string,
  blNumber: nn(r.bl_number as string),
  houseBlNumber: nn(r.house_bl_number as string),
  vesselName: nn(r.vessel_name as string),
  voyageNumber: nn(r.voyage_number as string),
  eta: nn(r.eta as string),
  jobType: r.job_type as string,
  deliveryAddress: nn(r.delivery_address as string),
  permitRequired: r.permit_required as boolean,
  permitReceived: r.permit_received as boolean,
  permitRejected: r.permit_rejected as boolean,
  portnetRequired: r.portnet_required as boolean,
  portnetReleased: r.portnet_released as boolean,
  assignedController: nn(r.assigned_controller as string),
  cancelled: r.cancelled as boolean,
  onHold: r.on_hold as boolean,
  createdAt: r.created_at as string,
});

export const toImportContainer = (r: Record<string, unknown>): ImportContainer => ({
  containerId: r.container_id as string,
  containerNumber: r.container_number as string,
  jobId: r.job_id as string,
  containerSize: r.container_size as string,
  containerType: r.container_type as string,
  sealNumber: nn(r.seal_number as string),
  grossWeight: nn(r.gross_weight as number),
  cargoDescription: nn(r.cargo_description as string),
  portTerminal: nn(r.port_terminal as string),
  emptyReturnYard: nn(r.empty_return_yard as string),
  freeTimeModel: r.free_time_model as ImportContainer['freeTimeModel'],
  freeTimeCountsFrom: r.free_time_counts_from as ImportContainer['freeTimeCountsFrom'],
  demurrageFreeDays: nn(r.demurrage_free_days as number),
  demurrageLfd: nn(r.demurrage_lfd as string),
  detentionFreeDays: nn(r.detention_free_days as number),
  detentionLfd: nn(r.detention_lfd as string),
  combinedFreeDays: nn(r.combined_free_days as number),
  combinedLfd: nn(r.combined_lfd as string),
  packageCount: r.package_count === null || r.package_count === undefined ? null : Number(r.package_count),
  packageType: nn(r.package_type as string),
  freeTimeRemarks: nn(r.free_time_remarks as string),
  internalLfd: nn(r.internal_lfd as string),
  carparkReason: nn(r.carpark_reason as ImportContainer['carparkReason']),
  carparkArrivedAt: nn(r.carpark_arrived_at as string),
  emptyReadyConfirmed: r.empty_ready_confirmed as boolean,
  emptyReadyConfirmedAt: nn(r.empty_ready_confirmed_at as string),
  emptyReadySource: nn(r.empty_ready_source as ImportContainer['emptyReadySource']),
  chassisId: nn(r.chassis_id as string),
  chassisMountedAt: nn(r.chassis_mounted_at as string),
  chassisReleasedAt: nn(r.chassis_released_at as string),
  cancelled: r.cancelled as boolean,
  onHold: r.on_hold as boolean,
});

export const toExportJob = (r: Record<string, unknown>): ExportJob => ({
  exportJobId: r.export_job_id as string,
  jobNumber: r.job_number as string,
  customer: r.customer as string,
  shipper: nn(r.shipper as string),
  bookingReference: nn(r.booking_reference as string),
  exportClearanceReference: nn(r.export_clearance_reference as string),
  carrier: nn(r.carrier as string),
  vesselName: nn(r.vessel_name as string),
  voyageNumber: nn(r.voyage_number as string),
  etaSingapore: nn(r.eta_singapore as string),
  vesselClosingAt: nn(r.vessel_closing_at as string),
  emptyCollectionYard: nn(r.empty_collection_yard as string),
  cmsRequired: r.cms_required as boolean,
  cmsStatus: r.cms_status as ExportJob['cmsStatus'],
  containerQuantity: r.container_quantity as number,
  containerSizeType: nn(r.container_size_type as string),
  truckInDate: nn(r.truck_in_date as string),
  truckOutDate: nn(r.truck_out_date as string),
  standbyRequired: r.standby_required as boolean,
  standbyInstructionSource: nn(r.standby_instruction_source as ExportJob['standbyInstructionSource']),
  standbyExpectedMinutes: nn(r.standby_expected_minutes as number),
  transhipmentStatus: r.transhipment_status as ExportJob['transhipmentStatus'],
  transhipmentCheckedAt: nn(r.transhipment_checked_at as string),
  carparkRequested: r.carpark_requested as boolean,
  assignedController: nn(r.assigned_controller as string),
  cancelled: r.cancelled as boolean,
  onHold: r.on_hold as boolean,
  createdAt: r.created_at as string,
});

export const toExportContainer = (r: Record<string, unknown>): ExportContainer => ({
  exportContainerId: r.export_container_id as string,
  exportJobId: r.export_job_id as string,
  containerRef: r.container_ref as string,
  containerNumber: nn(r.container_number as string),
  sealNumber: nn(r.seal_number as string),
  tareWeightKg: nn(r.tare_weight_kg as number),
  sizeType: r.size_type as string,
  isReefer: r.is_reefer as boolean,
  temperatureMode: nn(r.temperature_mode as ExportContainer['temperatureMode']),
  temperatureSetpointC: nn(r.temperature_setpoint_c as number),
  stuffingLocation: nn(r.stuffing_location as string),
  containerDetailsSent: r.container_details_sent as boolean,
  containerDetailsSentAt: nn(r.container_details_sent_at as string),
  containerReady: r.container_ready as boolean,
  containerReadyAt: nn(r.container_ready_at as string),
  vgm: nn(r.vgm as number),
  vgmReceivedAt: nn(r.vgm_received_at as string),
  portnetProcessed: r.portnet_processed as ExportContainer['portnetProcessed'],
  chassisId: nn(r.chassis_id as string),
  chassisMountedAt: nn(r.chassis_mounted_at as string),
  chassisReleasedAt: nn(r.chassis_released_at as string),
  carparkArrivedAt: nn(r.carpark_arrived_at as string),
  cancelled: r.cancelled as boolean,
  onHold: r.on_hold as boolean,
});

export const toMovement = (r: Record<string, unknown>): Movement => ({
  movementId: r.movement_id as string,
  movementRef: r.movement_ref as string,
  jobId: r.job_id as string,
  jobDomain: r.job_domain as Movement['jobDomain'],
  jobNumber: r.job_number as string,
  containerId: nn(r.container_id as string),
  containerNumber: nn(r.container_number as string),
  secondaryContainerId: nn(r.secondary_container_id as string),
  isDoubleMounted: r.is_double_mounted as boolean,
  movementType: r.movement_type as Movement['movementType'],
  cargoState: r.cargo_state as Movement['cargoState'],
  originType: r.origin_type as Movement['originType'],
  origin: r.origin as string,
  destinationType: r.destination_type as Movement['destinationType'],
  destination: r.destination as string,
  plannedDate: nn(r.planned_date as string),
  plannedTime: nn(r.planned_time as string),
  truck: nn(r.truck as string),
  driver: nn(r.driver as string),
  chassisId: nn(r.chassis_id as string),
  movementStatus: r.movement_status as Movement['movementStatus'],
  actualCollectionAt: nn(r.actual_collection_at as string),
  actualDeliveryAt: nn(r.actual_delivery_at as string),
  standbyRequired: r.standby_required as boolean,
  standbyStartedAt: nn(r.standby_started_at as string),
  standbyEndedAt: nn(r.standby_ended_at as string),
  autoCreated: r.auto_created as boolean,
  cancelledReason: nn(r.cancelled_reason as string),
});

export const toException = (r: Record<string, unknown>): ExceptionRecord => ({
  exceptionId: r.exception_id as string,
  jobId: r.job_id as string,
  jobDomain: r.job_domain as ExceptionRecord['jobDomain'],
  containerId: nn(r.container_id as string),
  movementId: nn(r.movement_id as string),
  exceptionType: r.exception_type as string,
  severity: r.severity as ExceptionRecord['severity'],
  blocking: r.blocking as boolean,
  waitingOn: r.waiting_on as ExceptionRecord['waitingOn'],
  detectedAt: r.detected_at as string,
  resolvedAt: nn(r.resolved_at as string),
});

export const toChassis = (r: Record<string, unknown>): Chassis => ({
  chassisId: r.chassis_id as string,
  chassisNo: r.chassis_no as string,
  plateNo: r.plate_no as string,
  size: r.size as Chassis['size'],
  unladenWeightKg: nn(r.unladen_weight_kg as number),
  maxGrossWeightKg: nn(r.max_gross_weight_kg as number),
  inspectionDueDate: nn(r.inspection_due_date as string),
  manualStatus: nn(r.manual_status as Chassis['manualStatus']),
  active: r.active as boolean,
});

export const toChassisChange = (r: Record<string, unknown>): ChassisChange => ({
  changeId: r.change_id as string,
  containerId: r.container_id as string,
  jobId: r.job_id as string,
  chassisIdPrevious: r.chassis_id_previous as string,
  chassisIdNew: nn(r.chassis_id_new as string),
  reason: r.reason as string,
  location: r.location as string,
  changedAt: r.changed_at as string,
  changedBy: r.changed_by as string,
  containerGrounded: r.container_grounded as boolean,
});

export const toDateAmendment = (r: Record<string, unknown>): DateAmendment => ({
  amendmentId: r.amendment_id as string,
  entityType: r.entity_type as DateAmendment['entityType'],
  entityId: r.entity_id as string,
  dateField: r.date_field as string,
  previousValue: nn(r.previous_value as string),
  newValue: nn(r.new_value as string),
  reasonCode: r.reason_code as DateAmendment['reasonCode'],
  reasonNote: nn(r.reason_note as string),
  amendedBy: r.amended_by as string,
  amendedAt: r.amended_at as string,
  sequence: r.sequence as number,
});

/** A holding is derived from the container that carries the chassis (§35.2). */
export const holdingFrom = (
  containerId: string, jobId: string, r: Record<string, unknown>,
): ChassisHolding => ({
  chassisId: r.chassis_id as string,
  containerId,
  jobId,
  mountedAt: nn(r.chassis_mounted_at as string),
  releasedAt: nn(r.chassis_released_at as string),
  doubleMountedWith: null,
});
