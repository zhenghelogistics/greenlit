import {
  canCollect, canCollectEmpty, canStartLaden, currentLocation, evaluate,
  exportContainerStatus, exportJobStatus, importContainerStatus, importJobStatus,
  isVgmPlausible, missingMandatoryFields, EXPORT_RULES, IMPORT_RULES,
  type ContainerLocation, type ExceptionRecord, type ExportContainer, type ExportJob,
  type ExportCtx, type ExportJobStatus, type ImportContainer, type ImportCtx,
  type ImportContainerStatus, type ImportJob, type ImportJobStatus,
  type MandatoryFieldSet, type Movement, type Thresholds, type WaitingOn,
} from '@greenlit/engine';

/** What a screen or an API consumer receives. Every field here is computed. */
export interface DerivedContainerView {
  containerId: string;
  reference: string;
  containerNumber: string | null;
  status: ImportContainerStatus | ExportJobStatus;
  location: ContainerLocation;
  gatePassed: boolean;
  gateFailures: string[];
}

export interface DerivedJobView {
  /**
   * The stored record, verbatim.
   *
   * Screens need operational facts the derivation does not produce — vessel,
   * booking reference, yard, dates, chassis. Returning them alongside the
   * derived values, under a separate key, keeps the distinction the whole
   * design rests on: everything under `record` was typed by someone, and
   * everything outside it was computed. §56.
   */
  record: ImportJob | ExportJob;
  storedContainers: (ImportContainer | ExportContainer)[];
  jobId: string;
  jobNumber: string;
  domain: 'IMPORT' | 'EXPORT';
  customer: string;
  jobStatus: ImportJobStatus | ExportJobStatus;
  location: ContainerLocation;
  nextActionRequired: string;
  blockingReason: string | null;
  waitingOn: WaitingOn;
  mandatoryComplete: boolean;
  missingInformation: string[];
  containers: DerivedContainerView[];
  movements: Movement[];
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

const statusIn = (ms: readonly Movement[], type: string, statuses: readonly string[]) =>
  ms.some((m) => m.movementType === type && statuses.includes(m.movementStatus));

const MOVED = ['COLLECTED', 'IN_TRANSIT', 'DELIVERED', 'ON_STANDBY', 'COMPLETED'];
const ARRIVED = ['DELIVERED', 'ON_STANDBY', 'COMPLETED'];

/** A movement past its planned time that has not been collected. §27.2. */
function isOverdue(m: Movement, now: string): boolean {
  if (m.plannedDate === null) return false;
  if (MOVED.includes(m.movementStatus)) return false;
  if (!['SCHEDULED', 'ASSIGNED'].includes(m.movementStatus)) return false;
  return Date.parse(`${m.plannedDate}T${m.plannedTime ?? '23:59'}:00Z`) < Date.parse(now);
}

/**
 * §37 context. Built entirely from stored records — no judgement calls, which
 * is what makes the rule table auditable.
 */
export function buildImportCtx(
  job: ImportJob, container: ImportContainer, movements: readonly Movement[],
  exceptions: readonly ExceptionRecord[], mandatory: MandatoryFieldSet,
  thresholds: Thresholds, now: string,
): ImportCtx {
  const own = movements.filter((m) => m.containerId === container.containerId);
  const missing = missingMandatoryFields(job as unknown as Record<string, unknown>, mandatory);
  const gate = canCollect(job, container, mandatory);
  const lfd = container.demurrageLfd ?? container.combinedLfd;
  const openExc = exceptions.find((e) => e.resolvedAt === null);

  return {
    mandatoryComplete: missing.length === 0,
    missingFields: missing,
    permitRequired: job.permitRequired,
    permitReceived: job.permitReceived,
    permitRejected: job.permitRejected,
    portnetRequired: job.portnetRequired,
    portnetReleased: job.portnetReleased,
    deliveryAddressMissing: job.deliveryAddress === null || job.deliveryAddress === '',
    collectionEligible: gate.passed,
    hasScheduledDelivery: statusIn(own, 'IMPORT_DELIVERY', ['SCHEDULED', 'ASSIGNED']),
    deliveryOverdue: own.some((m) => isOverdue(m, now)),
    daysUntilLfd: lfd ? daysBetween(now.slice(0, 10), lfd) : null,
    ddCriticalDays: thresholds.ddCriticalDays,
    collected: statusIn(own, 'IMPORT_DELIVERY', MOVED),
    delivered: statusIn(own, 'IMPORT_DELIVERY', ARRIVED),
    podCaptured: statusIn(own, 'IMPORT_DELIVERY', ['COMPLETED']),
    emptyReturned: statusIn(own, 'EMPTY_RETURN', ['COMPLETED']),
    detentionLfdApproaching: container.detentionLfd
      ? daysBetween(now.slice(0, 10), container.detentionLfd) <= thresholds.ddCriticalDays
      : false,
    documentConflictOpen: false,
    openExceptionWaitingOn: openExc ? openExc.waitingOn as 'US' | 'CUSTOMER' | 'CARRIER' : null,
    allMovementsComplete: own.length > 0 && own.every((m) =>
      ['COMPLETED', 'CANCELLED'].includes(m.movementStatus)),
    jobOpen: true,
  };
}

/** §47 context. */
export function buildExportCtx(
  job: ExportJob, container: ExportContainer, movements: readonly Movement[],
  mandatory: MandatoryFieldSet, thresholds: Thresholds, now: string,
): ExportCtx {
  const own = movements.filter((m) =>
    m.containerId === container.exportContainerId ||
    m.secondaryContainerId === container.exportContainerId);
  const missing = missingMandatoryFields(job as unknown as Record<string, unknown>, mandatory);
  // §43.1: stuffing is complete when no transfer leg remains outstanding.
  const stuffingComplete = !own.some((m) =>
    m.movementType === 'LADEN_SITE_TO_SITE' &&
    !['COMPLETED', 'CANCELLED'].includes(m.movementStatus));
  const laden = canStartLaden(job, container, stuffingComplete);
  const atCarpark = statusIn(own, 'ONE_WAY_LOADED', ARRIVED)
    && !statusIn(own, 'CARPARK_TO_PORT', MOVED);

  return {
    mandatoryComplete: missing.length === 0,
    missingFields: missing,
    cmsRequired: job.cmsRequired,
    cmsCompleted: job.cmsStatus === 'COMPLETED' || job.cmsStatus === 'NOT_REQUIRED',
    emptyGatePassed: canCollectEmpty(job, mandatory).passed,
    emptyScheduled: statusIn(own, 'EMPTY_COLLECTION', ['SCHEDULED', 'ASSIGNED']),
    emptyOverdue: own.some((m) => m.movementType === 'EMPTY_COLLECTION' && isOverdue(m, now)),
    emptyCollected: statusIn(own, 'EMPTY_COLLECTION', MOVED),
    emptyDelivered: statusIn(own, 'EMPTY_COLLECTION', ARRIVED),
    containerNumberCaptured: container.containerNumber !== null,
    detailsSent: container.containerDetailsSent,
    stuffingOverdue: container.containerDetailsSentAt
      ? daysBetween(container.containerDetailsSentAt.slice(0, 10), now.slice(0, 10)) > thresholds.stuffingOverdueDays
      : false,
    containerReady: container.containerReady,
    vgmReceived: container.vgm !== null,
    vgmImplausible: container.vgm !== null && container.tareWeightKg !== null
      && !isVgmPlausible(container.vgm, container.tareWeightKg),
    transhipmentStatus: job.transhipmentStatus,
    carparkRequested: job.carparkRequested,
    atCarpark,
    carparkDwellDays: container.carparkArrivedAt
      ? daysBetween(container.carparkArrivedAt.slice(0, 10), now.slice(0, 10)) : 0,
    carparkDwellThreshold: thresholds.carparkDwellDays,
    ladenGatePassed: laden.passed,
    hasLadenMovement: own.some((m) =>
      ['DIRECT_LADEN_TO_PORT', 'ONE_WAY_LOADED', 'CARPARK_TO_PORT'].includes(m.movementType)
      && m.movementStatus !== 'CANCELLED'),
    movementOverdue: own.some((m) => m.movementType !== 'EMPTY_COLLECTION' && isOverdue(m, now)),
    vesselClosingAtRisk: job.vesselClosingAt !== null
      && Date.parse(job.vesselClosingAt) - Date.parse(now) < 86_400_000,
    deliveredToPort: statusIn(own, 'DIRECT_LADEN_TO_PORT', ARRIVED)
      || statusIn(own, 'CARPARK_TO_PORT', ARRIVED),
    jobOpen: true,
  };
}

export function deriveImportJob(
  job: ImportJob, containers: readonly ImportContainer[], movements: readonly Movement[],
  exceptions: readonly ExceptionRecord[], mandatory: MandatoryFieldSet,
  thresholds: Thresholds, now: string,
): DerivedJobView {
  const missing = missingMandatoryFields(job as unknown as Record<string, unknown>, mandatory);
  const views: DerivedContainerView[] = containers.map((c) => {
    const own = movements.filter((m) => m.containerId === c.containerId);
    const gate = canCollect(job, c, mandatory);
    return {
      containerId: c.containerId,
      reference: c.containerNumber,
      containerNumber: c.containerNumber,
      status: importContainerStatus(c, job, movements, exceptions, gate.passed, missing.length === 0),
      location: currentLocation(own, 'IMPORT'),
      gatePassed: gate.passed,
      gateFailures: gate.failures,
    };
  });

  const first = containers[0];
  const ctx = first
    ? buildImportCtx(job, first, movements, exceptions, mandatory, thresholds, now)
    : null;
  const action = ctx ? evaluate(IMPORT_RULES, ctx)
    : { nextActionRequired: 'Complete job information', blockingReason: 'No containers on job', waitingOn: 'US' as WaitingOn };

  return {
    record: job,
    storedContainers: [...containers],
    jobId: job.jobId,
    jobNumber: job.jobNumber,
    domain: 'IMPORT',
    customer: job.customer,
    jobStatus: importJobStatus(job, views.map((v) => v.status as ImportContainerStatus), movements, exceptions, false),
    location: views[0]?.location ?? currentLocation(movements, 'IMPORT'),
    nextActionRequired: action.nextActionRequired,
    blockingReason: action.blockingReason,
    waitingOn: action.waitingOn,
    mandatoryComplete: missing.length === 0,
    missingInformation: missing,
    containers: views,
    movements: [...movements],
  };
}

export function deriveExportJob(
  job: ExportJob, containers: readonly ExportContainer[], movements: readonly Movement[],
  exceptions: readonly ExceptionRecord[], mandatory: MandatoryFieldSet,
  thresholds: Thresholds, now: string,
): DerivedJobView {
  const missing = missingMandatoryFields(job as unknown as Record<string, unknown>, mandatory);
  const emptyGate = canCollectEmpty(job, mandatory);

  const views: DerivedContainerView[] = containers.map((c) => {
    const own = movements.filter((m) =>
      m.containerId === c.exportContainerId || m.secondaryContainerId === c.exportContainerId);
    const stuffingComplete = !own.some((m) =>
      m.movementType === 'LADEN_SITE_TO_SITE' && !['COMPLETED', 'CANCELLED'].includes(m.movementStatus));
    const laden = canStartLaden(job, c, stuffingComplete);
    return {
      containerId: c.exportContainerId,
      reference: c.containerRef,
      containerNumber: c.containerNumber,
      status: exportContainerStatus(job, c, movements, exceptions,
        emptyGate.passed, laden.passed, missing.length === 0, false),
      location: currentLocation(own, 'EXPORT'),
      gatePassed: laden.passed,
      gateFailures: laden.failures,
    };
  });

  const first = containers[0];
  const ctx = first
    ? buildExportCtx(job, first, movements, mandatory, thresholds, now)
    : null;
  const action = ctx ? evaluate(EXPORT_RULES, ctx)
    : { nextActionRequired: 'Complete job information', blockingReason: 'No containers on job', waitingOn: 'US' as WaitingOn };

  return {
    record: job,
    storedContainers: [...containers],
    jobId: job.exportJobId,
    jobNumber: job.jobNumber,
    domain: 'EXPORT',
    customer: job.customer,
    jobStatus: exportJobStatus(job, views.map((v) => v.status as ExportJobStatus), exceptions, false),
    location: views[0]?.location ?? currentLocation(movements, 'EXPORT'),
    nextActionRequired: action.nextActionRequired,
    blockingReason: action.blockingReason,
    waitingOn: action.waitingOn,
    mandatoryComplete: missing.length === 0,
    missingInformation: missing,
    containers: views,
    movements: [...movements],
  };
}
