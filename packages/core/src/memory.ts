import { suggestedUserId, suggestedDisplayName, normalisePermitNumber, locationProblem,
  documentProblem, storagePathFor,
  type CustomerLocation, type DocumentRecord,
  type PermitRecord } from '@greenlit/engine';
import {
  appendAmendment, applyChassisChange, nextJobReference, recordChassisChange,
  userEvent, validateContainerCount, validateCustomerDraft,
  type AuditEvent, type Chassis, type ChassisHolding, type Customer,
  type ChassisChange, type CustomerDraft, type DateAmendment, type Discrepancy,
  type Principal,
} from '@greenlit/engine';
import type {
  ExceptionRecord, ExportContainer, ExportJob, ImportContainer, ImportJob,
  Movement, Thresholds,
} from '@greenlit/engine';
import type {
  DateAmendmentInput, ExportJobDraft, ImportJobDraft, Repository, StoredDiscrepancy,
} from './repository.ts';

/**
 * §27 / §56: thresholds are configurable and must not be hard-coded. These are
 * the starting values Appendix A.4.4 says the team still owes; they live here
 * only until a settings table exists.
 */
export const DEFAULT_THRESHOLDS: Thresholds = {
  movementOverdueHours: 4,
  emptyReadyConfirmationOverdueDays: 2,
  containerDetailsNotSentHours: 24,
  stuffingOverdueDays: 3,
  vgmOverdueDays: 2,
  transhipmentUnresolvedDays: 2,
  carparkDwellDays: 3,
  emptyReturnOverdueDays: 3,
  portnetNotProcessedDays: 1,
  // Two days, not one. At one day a controller hears nothing until the final
  // day, and a same-day collection needs a driver, a chassis and a slot that
  // are arranged the day before or not at all. Operations asked for two.
  ddCriticalDays: 2,
};


/**
 * §9.1. The chassis fleet, as at the current register: 89 units, 47 twenty-foot
 * and 42 forty-foot. Numbers and plates are unique across the fleet.
 *
 * §9.1 also records two data-quality items to resolve before a real load: max
 * gross weight is filled for only 12 of 47 twenty-foot units and entered
 * inconsistently, and inspection dates cluster heavily — 22 units due in a
 * single month. Both are represented here rather than smoothed over, so the
 * capacity view shows the real shape.
 */
const INSPECTION_CLUSTER_MONTH = '2026-09';

/**
 * §7. A seeded user directory.
 *
 * Not authentication: nobody proves who they are yet. It is the authorisation
 * half — given a user, what may they do — so commands can be refused
 * server-side today and the audit trail can name a real person instead of a
 * placeholder. Sign-in replaces the lookup, not the rules.
 */
const CUSTOMERS: Customer[] = [
  { customerId: 'abc', code: 'ABC', companyName: 'ABC Company', shortName: 'ABC',
    billingName: 'ABC Company Pte Ltd', defaultConsignee: 'ABC Company',
    defaultDeliveryAddress: '12 Tuas Ave 8', defaultContact: 'ops@abccompany.sg',
    emailDomains: ['abccompany.sg'], accountStatus: 'ACTIVE', notes: null,
    createdAt: '2025-04-02T00:00:00Z' },
  { customerId: 'lct', code: 'LCT', companyName: 'Lion City Traders', shortName: 'Lion City',
    billingName: 'Lion City Traders Pte Ltd', defaultConsignee: 'Lion City Traders',
    defaultDeliveryAddress: '3 Pioneer Sector 2', defaultContact: 'ops@lioncity.sg',
    emailDomains: ['lioncity.sg'], accountStatus: 'ACTIVE', notes: null,
    createdAt: '2024-11-18T00:00:00Z' },
  { customerId: 'mer', code: 'MER', companyName: 'Meridian Freight', shortName: 'Meridian',
    billingName: 'Meridian Freight Pte Ltd', defaultConsignee: null,
    defaultDeliveryAddress: null, defaultContact: 'desk@meridianfreight.com',
    emailDomains: ['meridianfreight.com'], accountStatus: 'ACTIVE', notes: null,
    createdAt: '2025-09-30T00:00:00Z' },
  { customerId: 'pep', code: 'PEP', companyName: 'PepsiCo International', shortName: 'PepsiCo',
    billingName: 'PepsiCo International Pte Ltd', defaultConsignee: 'PepsiCo International Pte Ltd',
    defaultDeliveryAddress: '3 Fraser Street, Singapore', defaultContact: 'ops@pepsico.com',
    emailDomains: ['pepsico.com'], accountStatus: 'ACTIVE', notes: null,
    createdAt: '2025-06-14T00:00:00Z' },
  { customerId: 'str', code: 'STR', companyName: 'Straits Cargo', shortName: 'Straits',
    billingName: 'Straits Cargo Pte Ltd', defaultConsignee: null,
    defaultDeliveryAddress: null, defaultContact: 'ops@straitscargo.sg',
    emailDomains: ['straitscargo.sg'], accountStatus: 'ACTIVE', notes: null,
    createdAt: '2026-02-11T00:00:00Z' },
];

/** §24. A stored permit, before it is shaped for a caller. */
interface StoredPermit {
  permitId: string; jobId: string;
  permitNumber: string | null; expiryDate: string | null;
  permitVesselVoyage: string | null; fileName: string | null;
  containerIds: string[];
}

const toPermitRecord = (p: StoredPermit): PermitRecord => ({
  permitId: p.permitId,
  permitNumber: p.permitNumber,
  expiryDate: p.expiryDate,
  permitVesselVoyage: p.permitVesselVoyage,
  fileName: p.fileName,
  linkedContainerIds: [...p.containerIds],
});

const USERS: Principal[] = [
  { userId: 'sarah', displayName: 'Sarah Lim', role: 'OPERATIONS', email: 'sarah@zhenghe.com.sg', active: true },
  { userId: 'winnie', displayName: 'Winnie Ong', role: 'OPERATIONS', email: 'winnie@zhenghe.com.sg', active: true },
  { userId: 'brandon', displayName: 'Brandon Lee', role: 'OPERATIONS', email: 'brandon@zhenghe.com.sg', active: true },
  { userId: 'john', displayName: 'John Tan', role: 'ADMINISTRATOR', email: 'john@zhenghe.com.sg', active: true },
  { userId: 'mei', displayName: 'Mei Chen', role: 'MANAGEMENT', email: 'mei@zhenghe.com.sg', active: true },
  // §7.3: override is grantable to a manager as a narrow extra permission.
  { userId: 'raymond', displayName: 'Raymond Koh', role: 'MANAGEMENT', email: 'raymond@zhenghe.com.sg', active: true,
    extraPermissions: ['gate.override'] },
  { userId: 'former', displayName: 'Former Staff', role: 'OPERATIONS', email: 'former@zhenghe.com.sg', active: false },
];

function buildFleetRegister(): Chassis[] {
  const units: Chassis[] = [];
  const push = (chassisNo: number, size: '20FT' | '40FT', index: number) => {
    // The clustering §9.1 warns about: roughly a quarter of the fleet falls due
    // in one month.
    const clustered = index % 4 === 0;
    units.push({
      chassisId: `CH-${chassisNo}`,
      chassisNo: String(chassisNo),
      plateNo: `TRA${1000 + chassisNo}Y`,
      size,
      unladenWeightKg: size === '20FT' ? 3200 : 4200,
      // Deliberately sparse, per §9.1.
      maxGrossWeightKg: size === '40FT' || index < 12 ? (size === '20FT' ? 30000 : 41000) : null,
      inspectionDueDate: clustered ? `${INSPECTION_CLUSTER_MONTH}-15` : null,
      manualStatus: index % 17 === 0 ? 'MAINTENANCE' : null,
      active: true,
    });
  };
  for (let i = 0; i < 47; i += 1) push(2038 + i, '20FT', i);
  for (let i = 0; i < 41; i += 1) push(4029 + i, '40FT', i);
  push(4488, '40FT', 41);
  return units;
}

const mv = (o: Partial<Movement> & Pick<Movement, 'movementId' | 'movementRef' | 'jobId' | 'jobDomain' | 'jobNumber' | 'movementType' | 'movementStatus'>): Movement => ({
  containerId: null, containerNumber: null, secondaryContainerId: null,
  isDoubleMounted: false, cargoState: 'LADEN',
  originType: 'TERMINAL', origin: '', destinationType: 'CUSTOMER', destination: '',
  plannedDate: null, plannedTime: null, truck: null, driver: null, chassisId: null,
  actualCollectionAt: null, actualDeliveryAt: null, standbyRequired: false,
  standbyStartedAt: null, standbyEndedAt: null, autoCreated: false,
  cancelledReason: null, ...o,
});

/** §58.1 — import job awaiting its permit. */
const IMPORT_JOBS: ImportJob[] = [
  {
    jobId: 'ij1', jobNumber: 'JOB-260818-001', customer: 'ABC Company',
    blNumber: 'ABC123456', houseBlNumber: null, vesselName: 'Vessel XYZ', voyageNumber: '123E',
    eta: '2026-08-20', jobType: 'standard', deliveryAddress: '12 Tuas Ave 8',
    permitRequired: true, permitReceived: false, permitRejected: false,
    portnetRequired: true, portnetReleased: false,
    assignedController: 'Sarah', cancelled: false, onHold: false,
    createdAt: '2026-08-18T08:00:00Z',
    closedAt: null,
    closedBy: null,
  },
  {
    jobId: 'ij2', jobNumber: 'JOB-260816-004', customer: 'Lion City Traders',
    blNumber: 'BL778812', houseBlNumber: 'HBL-99120', vesselName: 'Kota Ratu', voyageNumber: '044W',
    eta: '2026-08-16', jobType: 'standard', deliveryAddress: '3 Pioneer Sector 2',
    permitRequired: false, permitReceived: true, permitRejected: false,
    portnetRequired: true, portnetReleased: true,
    assignedController: 'Brandon', cancelled: false, onHold: false,
    createdAt: '2026-08-16T02:00:00Z',
    closedAt: null,
    closedBy: null,
  },
];

const IMPORT_CONTAINERS: Record<string, ImportContainer[]> = {
  ij1: [{
    containerId: 'ic1', containerNumber: 'OOLU8841250', jobId: 'ij1',
    containerSize: '40', containerType: 'HQ', sealNumber: null, grossWeight: 21400,
    packageCount: 300, packageType: 'CASE', cargoDescription: 'General cargo', portTerminal: 'PSA Pasir Panjang',
    emptyReturnYard: 'Jurong Yard', freeTimeModel: 'SPLIT', freeTimeCountsFrom: 'VESSEL_ETA',
    demurrageFreeDays: 5, demurrageLfd: '2026-09-01', detentionFreeDays: 7,
    detentionLfd: '2026-09-04', combinedFreeDays: null, combinedLfd: null, freeTimeRemarks: null,
    internalLfd: '2026-08-27', carparkReason: null, carparkArrivedAt: null,
    emptyReadyConfirmed: false, emptyReadyConfirmedAt: null, emptyReadySource: null,
    chassisId: 'CH-4029', chassisMountedAt: null, chassisReleasedAt: null,
    cancelled: false, onHold: false,
  }],
  ij2: [{
    containerId: 'ic2', containerNumber: 'CSNU7213366', jobId: 'ij2',
    containerSize: '20', containerType: 'GP', sealNumber: 'SG88213', grossWeight: 14800,
    packageCount: null, packageType: null, cargoDescription: 'Machine parts', portTerminal: 'PSA Brani',
    emptyReturnYard: 'Jurong Yard', freeTimeModel: 'COMBINED', freeTimeCountsFrom: 'DISCHARGE',
    demurrageFreeDays: null, demurrageLfd: null, detentionFreeDays: null,
    detentionLfd: '2026-09-02', combinedFreeDays: 10, combinedLfd: '2026-09-02', freeTimeRemarks: null,
    internalLfd: '2026-08-23', carparkReason: null, carparkArrivedAt: null,
    emptyReadyConfirmed: false, emptyReadyConfirmedAt: null, emptyReadySource: null,
    chassisId: 'CH-2038', chassisMountedAt: '2026-08-17T01:00:00Z', chassisReleasedAt: null,
    cancelled: false, onHold: false,
  }],
};

/** §58.2 — export job parked at the carpark, transhipment unresolved. */
const EXPORT_JOBS: ExportJob[] = [
  {
    exportJobId: 'ej1', jobNumber: 'EXP-260818-002', customer: 'ABC Pte Ltd',
    shipper: 'XYZ Manufacturing', bookingReference: 'SGSIN12345',
    exportClearanceReference: 'OP-260818-77', carrier: 'ONE',
    vesselName: 'ONE Splendour', voyageNumber: '114E', etaSingapore: '2026-09-03',
    vesselClosingAt: null, emptyCollectionYard: 'EK11 Depot',
    cmsRequired: true, cmsStatus: 'COMPLETED', containerQuantity: 1,
    containerSizeType: '40 HQ', truckInDate: '2026-08-18', truckOutDate: '2026-08-20',
    standbyRequired: false, standbyInstructionSource: null, standbyExpectedMinutes: null,
    transhipmentStatus: 'PENDING', transhipmentCheckedAt: '2026-08-22T04:00:00Z',
    carparkRequested: true, assignedController: 'Winnie',
    cancelled: false, onHold: false, createdAt: '2026-08-18T01:00:00Z',
    closedAt: null, closedBy: null,
  },
  /** §58.3 — the exception path: empty delivered, identity never captured. */
  {
    exportJobId: 'ej2', jobNumber: 'EXP-260819-002', customer: 'Meridian Freight',
    shipper: 'Meridian Freight', bookingReference: 'SGSIN99120',
    exportClearanceReference: 'OP-260819-12', carrier: 'PIL',
    vesselName: 'Kota Nabil', voyageNumber: '072E', etaSingapore: '2026-09-05',
    vesselClosingAt: null, emptyCollectionYard: 'EK11 Depot',
    cmsRequired: true, cmsStatus: 'COMPLETED', containerQuantity: 1,
    containerSizeType: '20 GP', truckInDate: '2026-08-19', truckOutDate: '2026-08-21',
    standbyRequired: false, standbyInstructionSource: null, standbyExpectedMinutes: null,
    transhipmentStatus: 'PENDING', transhipmentCheckedAt: null,
    carparkRequested: false, assignedController: 'Winnie',
    cancelled: false, onHold: false, createdAt: '2026-08-19T01:00:00Z',
    closedAt: null, closedBy: null,
  },
  /** Awaiting CMS: the gate §41 exists to enforce. */
  {
    exportJobId: 'ej3', jobNumber: 'EXP-260819-001', customer: 'Straits Cargo',
    shipper: 'Straits Cargo', bookingReference: 'SGSIN44021',
    exportClearanceReference: 'OP-260819-03', carrier: 'ONE',
    vesselName: 'ONE Splendour', voyageNumber: '114E', etaSingapore: '2026-09-03',
    vesselClosingAt: null, emptyCollectionYard: 'EK11 Depot',
    cmsRequired: true, cmsStatus: 'PENDING', containerQuantity: 2,
    containerSizeType: '40 HQ', truckInDate: '2026-08-20', truckOutDate: '2026-08-22',
    standbyRequired: true, standbyInstructionSource: 'BOOKING', standbyExpectedMinutes: 120,
    transhipmentStatus: 'PENDING', transhipmentCheckedAt: null,
    carparkRequested: false, assignedController: 'Brandon',
    cancelled: false, onHold: false, createdAt: '2026-08-19T00:30:00Z',
    closedAt: null, closedBy: null,
  },
];

const ec = (o: Partial<ExportContainer> & Pick<ExportContainer, 'exportContainerId' | 'exportJobId' | 'containerRef' | 'sizeType'>): ExportContainer => ({
  containerNumber: null, sealNumber: null, tareWeightKg: null,
  isReefer: false, temperatureMode: null, temperatureSetpointC: null,
  stuffingLocation: 'Customer site A', containerDetailsSent: false,
  containerDetailsSentAt: null, containerReady: false, containerReadyAt: null,
  vgm: null, vgmReceivedAt: null, portnetProcessed: 'PENDING',
  chassisId: null, chassisMountedAt: null, chassisReleasedAt: null,
  carparkArrivedAt: null, cancelled: false, onHold: false, ...o,
});

const EXPORT_CONTAINERS: Record<string, ExportContainer[]> = {
  ej1: [ec({
    exportContainerId: 'xc1', exportJobId: 'ej1', containerRef: 'C1', sizeType: '40 HQ',
    containerNumber: 'ABCU9876543', sealNumber: '123456', tareWeightKg: 3850,
    containerDetailsSent: true, containerDetailsSentAt: '2026-08-20T02:00:00Z',
    containerReady: true, containerReadyAt: '2026-08-22T01:00:00Z',
    vgm: 24500, vgmReceivedAt: '2026-08-22T01:10:00Z', portnetProcessed: 'PROCESSED',
    chassisId: 'CH-4011', carparkArrivedAt: '2026-08-23T05:30:00Z',
  })],
  ej2: [ec({
    exportContainerId: 'xc2', exportJobId: 'ej2', containerRef: 'C1', sizeType: '20 GP',
  })],
  ej3: [
    ec({ exportContainerId: 'xc3', exportJobId: 'ej3', containerRef: 'C1', sizeType: '40 HQ' }),
    ec({ exportContainerId: 'xc4', exportJobId: 'ej3', containerRef: 'C2', sizeType: '40 HQ' }),
  ],
};

const MOVEMENTS: Record<string, Movement[]> = {
  ij1: [],
  ij2: [
    mv({ movementId: 'm1', movementRef: 'MOV-001', jobId: 'ij2', jobDomain: 'IMPORT',
      jobNumber: 'JOB-260816-004', containerId: 'ic2', containerNumber: 'CSNU7213366',
      movementType: 'IMPORT_DELIVERY', movementStatus: 'COMPLETED',
      origin: 'PSA Brani', destination: '3 Pioneer Sector 2',
      plannedDate: '2026-08-17', actualCollectionAt: '2026-08-17T01:12:00Z',
      actualDeliveryAt: '2026-08-17T04:40:00Z', chassisId: 'CH-2038' }),
    mv({ movementId: 'm2', movementRef: 'MOV-002', jobId: 'ij2', jobDomain: 'IMPORT',
      jobNumber: 'JOB-260816-004', containerId: 'ic2', containerNumber: 'CSNU7213366',
      movementType: 'EMPTY_RETURN', movementStatus: 'PENDING', cargoState: 'EMPTY',
      originType: 'CUSTOMER', origin: '3 Pioneer Sector 2',
      destinationType: 'YARD', destination: 'Jurong Yard',
      autoCreated: true, chassisId: 'CH-2038' }),
  ],
  ej1: [
    mv({ movementId: 'm3', movementRef: 'MOV-001', jobId: 'ej1', jobDomain: 'EXPORT',
      jobNumber: 'EXP-260818-002', containerId: 'xc1', containerNumber: 'ABCU9876543',
      movementType: 'EMPTY_COLLECTION', movementStatus: 'COMPLETED', cargoState: 'EMPTY',
      originType: 'YARD', origin: 'EK11 Depot', destination: 'Customer site A',
      plannedDate: '2026-08-19', chassisId: 'CH-4011' }),
    mv({ movementId: 'm4', movementRef: 'MOV-002', jobId: 'ej1', jobDomain: 'EXPORT',
      jobNumber: 'EXP-260818-002', containerId: 'xc1', containerNumber: 'ABCU9876543',
      movementType: 'ONE_WAY_LOADED', movementStatus: 'COMPLETED',
      originType: 'CUSTOMER', origin: 'Customer site A',
      destinationType: 'CARPARK', destination: 'ZHL Carpark, Pioneer Road',
      plannedDate: '2026-08-23', chassisId: 'CH-4011' }),
  ],
  ej2: [
    mv({ movementId: 'm5', movementRef: 'MOV-001', jobId: 'ej2', jobDomain: 'EXPORT',
      jobNumber: 'EXP-260819-002', containerId: 'xc2',
      movementType: 'EMPTY_COLLECTION', movementStatus: 'DELIVERED', cargoState: 'EMPTY',
      originType: 'YARD', origin: 'EK11 Depot', destination: 'Meridian yard',
      plannedDate: '2026-08-20' }),
  ],
  ej3: [],
};

const EXCEPTIONS: Record<string, ExceptionRecord[]> = {};

/** Deep clone so callers cannot mutate the fixture set by reference. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * In-memory Repository. The only implementation until Supabase lands.
 *
 * Mutations are held in this instance and lost on restart. That is correct for
 * now: the point is to exercise the real service and API surface without
 * committing to a schema that Postgres will shape differently.
 */
export function createMemoryRepository(): Repository {
  const importJobs = clone(IMPORT_JOBS);
  const exportJobs = clone(EXPORT_JOBS);
  const importContainers = clone(IMPORT_CONTAINERS);
  // Per repository, like every other collection here. At module scope this
  // leaked between instances: one repository's permits appeared in another's,
  // and a removal in one did not remove it from the other.
  const permits: StoredPermit[] = [];
  const customerLocations: CustomerLocation[] = [];
  const documents: DocumentRecord[] = [];
  /** The bytes, so a test can prove a file was kept and not merely recorded. */
  const documentBytes = new Map<string, Uint8Array>();

  /** One default per customer; a second would make "the default" ambiguous. */
  const clearDefaultFor = (customerCode: string) => {
    for (const l of customerLocations) {
      if (l.customerCode === customerCode) l.isDefault = false;
    }
  };
  const exportContainers = clone(EXPORT_CONTAINERS);
  const movements = clone(MOVEMENTS);
  const exceptions = clone(EXCEPTIONS);
  const discrepancies: Record<string, StoredDiscrepancy[]> = {};
  const fleet = buildFleetRegister();
  const customers = clone(CUSTOMERS);
  const chassisChanges: ChassisChange[] = [];
  const amendments: DateAmendment[] = [];
  /** Holdings after any §35.8 changes have been applied. */
  let derivedHoldings: ChassisHolding[] | null = null;

  /** Materialises holdings on first use so a swap can split occupancy. */
  const holdingsNow = (): ChassisHolding[] => {
    if (!derivedHoldings) {
      const holdings: ChassisHolding[] = [];
      for (const [jobId, list] of Object.entries(importContainers)) {
        for (const c of list) {
          if (!c.chassisId) continue;
          holdings.push({ chassisId: c.chassisId, containerId: c.containerId, jobId,
            mountedAt: c.chassisMountedAt, releasedAt: c.chassisReleasedAt, doubleMountedWith: null });
        }
      }
      for (const [jobId, list] of Object.entries(exportContainers)) {
        for (const c of list) {
          if (!c.chassisId) continue;
          holdings.push({ chassisId: c.chassisId, containerId: c.exportContainerId, jobId,
            mountedAt: c.chassisMountedAt, releasedAt: c.chassisReleasedAt, doubleMountedWith: null });
        }
      }
      derivedHoldings = holdings;
    }
    return derivedHoldings;
  };

  /** Reads the current value of an amendable date field. */
  const dateFieldValue = (entityId: string, field: string): string | null => {
    const exp = exportJobs.find((j) => j.exportJobId === entityId);
    if (exp) return (exp as unknown as Record<string, string | null>)[field] ?? null;
    const imp = importJobs.find((j) => j.jobId === entityId);
    if (imp) return (imp as unknown as Record<string, string | null>)[field] ?? null;
    const movement = Object.values(movements).flat().find((m) => m.movementId === entityId);
    return movement ? ((movement as unknown as Record<string, string | null>)[field] ?? null) : null;
  };

  const applyDateValue = (entityId: string, field: string, value: string | null) => {
    const exp = exportJobs.find((j) => j.exportJobId === entityId);
    if (exp) { (exp as unknown as Record<string, unknown>)[field] = value; return; }
    const imp = importJobs.find((j) => j.jobId === entityId);
    if (imp) { (imp as unknown as Record<string, unknown>)[field] = value; return; }
    const movement = Object.values(movements).flat().find((m) => m.movementId === entityId);
    if (movement) (movement as unknown as Record<string, unknown>)[field] = value;
  };

  const findExportContainer = (id: string) =>
    Object.values(exportContainers).flat().find((c) => c.exportContainerId === id);

  /**
   * §13. Append-only. Every command records who did it and what changed, so a
   * later reader can reconstruct the decision without asking anyone.
   */
  const audit: AuditEvent[] = [];
  const record = (
    entityId: string, event: string, actor: string,
    change: { field?: string; from?: unknown; to?: unknown } = {},
    entityType: 'job' | 'container' = 'job',
  ) => {
    audit.push(userEvent({
      event, entityType, entityId,
      field: change.field ?? null,
      previousValue: change.from,
      newValue: change.to,
    }, actor, new Date().toISOString()));
  };

  /** Which job an export container belongs to, for audit attribution. */
  const jobOfContainer = (containerId: string) =>
    Object.entries(exportContainers)
      .find(([, list]) => list.some((c) => c.exportContainerId === containerId))?.[0] ?? containerId;

  return {
    async listImportJobs() { return clone(importJobs); },
    async getImportJob(id) { return clone(importJobs.find((j) => j.jobId === id) ?? null); },
    async listExportJobs() { return clone(exportJobs); },
    async getExportJob(id) { return clone(exportJobs.find((j) => j.exportJobId === id) ?? null); },
    async listContainersForImportJob(id) { return clone(importContainers[id] ?? []); },
    async listContainersForExportJob(id) { return clone(exportContainers[id] ?? []); },
    async listMovementsForJob(id) { return clone(movements[id] ?? []); },
    async listOpenExceptionsForJob(id) {
      return clone((exceptions[id] ?? []).filter((e) => e.resolvedAt === null));
    },
    // Batched reads. In memory these are a flatMap; the shape exists for the
    // adapters where each of these is a network round trip.
    async listContainersForImportJobs(jobIds) {
      return clone(jobIds.flatMap((id) => importContainers[id] ?? []));
    },
    async listContainersForExportJobs(jobIds) {
      return clone(jobIds.flatMap((id) => exportContainers[id] ?? []));
    },
    async listMovementsForJobs(jobIds) {
      return clone(jobIds.flatMap((id) => movements[id] ?? []));
    },
    async listOpenExceptionsForJobs(jobIds) {
      return clone(jobIds.flatMap((id) => (exceptions[id] ?? []).filter((e) => e.resolvedAt === null)));
    },
    async getThresholds() { return { ...DEFAULT_THRESHOLDS }; },

    async listCustomers() { return clone(customers); },
    async getCustomerByCode(code) {
      return clone(customers.find((c) => c.code === code.trim().toUpperCase()) ?? null);
    },
    async createCustomer(draft: CustomerDraft, actor) {
      const validation = validateCustomerDraft(draft, customers);
      if (!validation.valid) throw new Error(validation.reasons.join('; '));
      const created: Customer = {
        customerId: draft.code.trim().toLowerCase(),
        code: draft.code.trim().toUpperCase(),
        companyName: draft.companyName.trim(),
        shortName: draft.shortName ?? null,
        billingName: null, defaultConsignee: null, defaultDeliveryAddress: null,
        defaultContact: null, emailDomains: [...(draft.emailDomains ?? [])],
        accountStatus: 'ACTIVE', notes: null,
        createdAt: new Date().toISOString(),
      };
      customers.push(created);
      record(created.customerId, 'job.created', actor,
        { field: 'customer', to: `${created.code} ${created.companyName}` });
      return clone(created);
    },

    /** Every reference issued, so ADR-0007's per-customer sequence can derive. */
    async listJobReferences() {
      return [...importJobs.map((j) => j.jobNumber), ...exportJobs.map((j) => j.jobNumber)];
    },

    async nextReferenceFor(customerCode) {
      const issued = [...importJobs.map((j) => j.jobNumber), ...exportJobs.map((j) => j.jobNumber)];
      return nextJobReference(issued, customerCode);
    },

    async createImportJob(draft: ImportJobDraft, actor) {
      const customer = customers.find((c) => c.code === draft.customerCode.trim().toUpperCase());
      if (!customer) throw new Error(`Unknown customer ${draft.customerCode}`);

      // Checked before anything is written, so a refusal leaves nothing behind
      // rather than a job with no containers — which is itself a dead end.
      const drafts = draft.containers?.length ? draft.containers : [{}];
      const count = validateContainerCount(drafts.length);
      if (!count.valid) throw new Error(count.reason!);

      const issued = [...importJobs.map((j) => j.jobNumber), ...exportJobs.map((j) => j.jobNumber)];
      const jobNumber = nextJobReference(issued, customer.code);
      const jobId = jobNumber.toLowerCase();

      const job: ImportJob = {
        // A new job is open. Stated rather than left to be inferred, because
        // §33 makes closure a stored fact and an absent one would read as
        // closed to Boolean().
        closedAt: null, closedBy: null,
        jobId, jobNumber, customer: customer.companyName,
        blNumber: draft.blNumber ?? null,
        houseBlNumber: draft.houseBlNumber ?? null,
        vesselName: draft.vesselName ?? null,
        voyageNumber: draft.voyageNumber ?? null,
        eta: draft.eta ?? null,
        jobType: draft.jobType ?? 'standard',
        // §9: the customer master supplies the default so it is not retyped.
        deliveryAddress: draft.deliveryAddress ?? customer.defaultDeliveryAddress,
        permitRequired: draft.permitRequired ?? true,
        permitReceived: false, permitRejected: false,
        portnetRequired: draft.portnetRequired ?? true,
        portnetReleased: false,
        assignedController: draft.assignedController ?? null,
        cancelled: false, onHold: false,
        createdAt: new Date().toISOString(),
      };
      importJobs.push(job);

      // §29.1: free time is per container, and every container command needs a
      // container to address. A job created with none was a dead end — no way
      // to record the number when it arrived, and every container action
      // failing with "Unknown container null". One empty row is created when
      // the notice named none, so there is somewhere to put it.
      importContainers[jobId] = drafts.map((c, index) => {
        const [size, ...type] = String(c.sizeType ?? '').trim().split(/\s+/);
        return {
          containerId: `${jobId}-c${index + 1}`,
          jobId,
          containerNumber: c.containerNumber?.trim() || null,
          secondaryContainerId: null,
          containerSize: size || '',
          containerType: type.join(' '),
          sealNumber: c.sealNumber?.trim() || null,
          grossWeight: c.grossWeight ?? null,
          packageCount: c.packageCount ?? null,
          packageType: c.packageType?.trim() || null,
          cargoDescription: null, portTerminal: null,
          emptyReturnYard: null,
          // §34. Absent is not the same as split: nothing is asserted about
          // the carrier's allowance until someone has read it.
          freeTimeModel: (c.freeTimeModel as ImportContainer['freeTimeModel']) ?? 'NOT_CONFIRMED',
          freeTimeCountsFrom: 'VESSEL_ETA',
          demurrageFreeDays: c.demurrageFreeDays ?? null, demurrageLfd: null,
          detentionFreeDays: c.detentionFreeDays ?? null, detentionLfd: null,
          combinedFreeDays: c.combinedFreeDays ?? null, combinedLfd: null,
          freeTimeRemarks: c.freeTimeRemarks ?? null,
          internalLfd: null, carparkReason: null, carparkArrivedAt: null,
          emptyReadyConfirmed: false, emptyReadyConfirmedAt: null, emptyReadySource: null,
          chassisId: null, chassisMountedAt: null, chassisReleasedAt: null,
          cancelled: false, onHold: false,
        } as ImportContainer;
      });
      movements[jobId] = [];
      record(jobId, 'job.created', actor, { field: 'jobNumber', to: jobNumber });
      return clone(job);
    },

    async createExportJob(draft: ExportJobDraft, actor) {
      const customer = customers.find((c) => c.code === draft.customerCode.trim().toUpperCase());
      if (!customer) throw new Error(`Unknown customer ${draft.customerCode}`);

      const issued = [...importJobs.map((j) => j.jobNumber), ...exportJobs.map((j) => j.jobNumber)];
      const jobNumber = nextJobReference(issued, customer.code);
      const jobId = jobNumber.toLowerCase();
      const quantity = Math.max(1, draft.containerQuantity ?? 1);

      const job: ExportJob = {
        closedAt: null, closedBy: null,
        exportJobId: jobId, jobNumber, customer: customer.companyName,
        shipper: draft.shipper ?? customer.companyName,
        bookingReference: draft.bookingReference ?? null,
        exportClearanceReference: draft.exportClearanceReference ?? null,
        carrier: null,
        vesselName: draft.vesselName ?? null,
        voyageNumber: draft.voyageNumber ?? null,
        etaSingapore: draft.etaSingapore ?? null,
        vesselClosingAt: draft.vesselClosingAt ?? null,
        emptyCollectionYard: draft.emptyCollectionYard ?? null,
        cmsRequired: draft.cmsRequired ?? true,
        cmsStatus: 'PENDING',
        containerQuantity: quantity,
        containerSizeType: draft.containerSizeType ?? null,
        truckInDate: draft.truckInDate ?? null,
        truckOutDate: draft.truckOutDate ?? null,
        standbyRequired: false, standbyInstructionSource: null,
        standbyExpectedMinutes: null,
        transhipmentStatus: 'PENDING', transhipmentCheckedAt: null,
        carparkRequested: false,
        assignedController: draft.assignedController ?? null,
        cancelled: false, onHold: false,
        createdAt: new Date().toISOString(),
      };
      exportJobs.push(job);
      // §38.2: container records are created with the job and identified later.
      exportContainers[jobId] = Array.from({ length: quantity }, (_, i) =>
        ec({ exportContainerId: `${jobId}-c${i + 1}`, exportJobId: jobId,
          containerRef: `C${i + 1}`, sizeType: draft.containerSizeType ?? '' }));
      movements[jobId] = [];
      record(jobId, 'job.created', actor, { field: 'jobNumber', to: jobNumber });
      return clone(job);
    },

    async getPrincipal(userId) { return clone(USERS.find((u) => u.userId === userId) ?? null); },
    async ensurePrincipal(email, displayName, role) {
      const address = email.trim().toLowerCase();
      const existing = USERS.find((u) => u.email?.toLowerCase() === address);
      if (existing) return clone(existing);

      // A username is derived rather than asked for, and made unique here
      // because only this layer can see what already exists.
      const base = suggestedUserId(address);
      let userId = base;
      for (let n = 2; USERS.some((u) => u.userId === userId); n += 1) {
        userId = `${base}${n}`;
      }

      const created = {
        userId,
        displayName: displayName.trim() || suggestedDisplayName(address),
        role: role as Principal['role'],
        email: address,
        active: true,
      };
      USERS.push(created);
      record(userId, 'user.registered', created.displayName,
        { field: 'role', from: null, to: role });
      return clone(created);
    },

    async upsertPrincipal(draft, actor) {
      const existing = USERS.find((u) => u.userId === draft.userId);
      const next = {
        userId: draft.userId,
        displayName: draft.displayName,
        role: draft.role as Principal['role'],
        email: draft.email ?? null,
        active: existing?.active ?? true,
      };
      if (existing) Object.assign(existing, next); else USERS.push(next);
      record(draft.userId, existing ? 'user.updated' : 'user.created', actor,
        { field: 'role', from: existing?.role ?? null, to: draft.role });
      return clone(next);
    },
    async changePrincipalAccess(userId, active, actor) {
      const user = USERS.find((u) => u.userId === userId);
      if (!user) throw new Error(`Unknown user ${userId}`);
      const from = user.active;
      user.active = active;
      record(userId, active ? 'user.reactivated' : 'user.deactivated', actor,
        { field: 'active', from: String(from), to: String(active) });
    },
    async addContainerToJob(jobId, draft, actor) {
      const onJob = importContainers[jobId] ?? [];
      validateContainerCount(onJob.length + 1);

      const container = {
        containerId: `${jobId}-c${onJob.length + 1}`,
        jobId,
        containerNumber: draft.containerNumber ?? null,
        containerSize: draft.sizeType ?? null,
        sealNumber: draft.sealNumber ?? null,
        grossWeight: draft.grossWeight ?? null,
        packageCount: draft.packageCount ?? null,
        packageType: draft.packageType ?? null,
        freeTimeModel: draft.freeTimeModel ?? 'NOT_CONFIRMED',
        demurrageFreeDays: draft.demurrageFreeDays ?? null,
        demurrageLfd: null, detentionFreeDays: draft.detentionFreeDays ?? null,
        detentionLfd: null, combinedFreeDays: draft.combinedFreeDays ?? null,
        combinedLfd: null, freeTimeRemarks: null,
        emptyReturnYard: null, internalLfd: null,
      } as unknown as ImportContainer;

      (importContainers[jobId] ??= []).push(container);
      record(jobId, 'container.added', actor,
        { field: 'containerNumber', from: null, to: container.containerNumber });
      return clone(container);
    },

    async amendContainer(containerId, changes, actor) {
      const container = Object.values(importContainers).flat()
        .find((c) => c.containerId === containerId);
      if (!container) throw new Error(`Unknown container ${containerId}`);

      const fields = container as unknown as Record<string, unknown>;
      for (const [field, to] of Object.entries(changes)) {
        if (to === undefined) continue;
        const from = fields[field] ?? null;
        if (String(from ?? '') === String(to ?? '')) continue;
        fields[field] = to;
        record(container.jobId, 'container.amended', actor, { field, from, to });
      }
    },

    async removeContainerFromJob(containerId, actor) {
      const jobId = Object.keys(importContainers)
        .find((id) => (importContainers[id] ?? []).some((c) => c.containerId === containerId));
      if (!jobId) throw new Error(`Unknown container ${containerId}`);

      // Refused once anything has happened to it: by then it is part of the
      // job's history, and deleting it would remove the record of real work.
      const moved = (movements[jobId] ?? []).some((m) => m.containerId === containerId);
      if (moved) {
        throw new Error('That container has movements against it and cannot be removed');
      }

      const list = importContainers[jobId]!;
      const index = list.findIndex((c) => c.containerId === containerId);
      const [gone] = list.splice(index, 1);
      record(jobId, 'container.removed', actor,
        { field: 'containerNumber', from: gone?.containerNumber ?? null, to: null });
    },

    async recordExportClearance(jobId, reference, actor) {
      const job = exportJobs.find((j) => j.exportJobId === jobId);
      if (!job) throw new Error(`Unknown job ${jobId}`);
      if (!reference.trim()) throw new Error('An export clearance needs its reference');

      const fields = job as unknown as Record<string, unknown>;
      const from = fields.exportClearanceReference ?? null;
      fields.exportClearanceReference = reference.trim().toUpperCase();
      record(jobId, 'export.clearance.recorded', actor,
        { field: 'exportClearanceReference', from, to: fields.exportClearanceReference });
    },

    async addExportContainer(jobId, draft, actor) {
      const onJob = exportContainers[jobId] ?? [];
      validateContainerCount(onJob.length + 1);

      // §46. A slot is referenced C1, C2 within the job until identity is
      // captured at collection.
      //
      // Unlike a movement reference, this one is reused after a release. A
      // cancelled movement was planned, may have been given to a driver and
      // sits in the history, so MOV-002 must never mean two things. A slot
      // released before collection never became a container and never left
      // this screen — so C3 becoming free again costs nothing, and a
      // high-water mark to prevent it would be machinery for a problem nobody
      // has.
      const highest = onJob.reduce((best, c) => {
        const n = Number(String(c.containerRef).replace(/\D/g, '') || 0);
        return Math.max(best, n);
      }, 0);

      const container = {
        exportContainerId: `${jobId}-c${highest + 1}`,
        exportJobId: jobId,
        containerRef: `C${highest + 1}`,
        containerNumber: null,
        sealNumber: null,
        tareWeightKg: null,
        sizeType: draft.sizeType,
        isReefer: draft.isReefer ?? false,
        temperatureMode: draft.temperatureMode ?? null,
        temperatureSetpointC: draft.temperatureSetpointC ?? null,
        stuffingLocation: draft.stuffingLocation ?? null,
        containerDetailsSent: false, containerDetailsSentAt: null,
        containerReady: false, containerReadyAt: null,
        vgm: null, vgmReceivedAt: null,
      } as unknown as ExportContainer;

      (exportContainers[jobId] ??= []).push(container);
      record(jobId, 'export.container.added', actor,
        { field: 'containerRef', from: null, to: container.containerRef });
      return clone(container);
    },

    async amendExportContainer(exportContainerId, changes, actor) {
      const container = Object.values(exportContainers).flat()
        .find((c) => c.exportContainerId === exportContainerId);
      if (!container) throw new Error(`Unknown container ${exportContainerId}`);

      const fields = container as unknown as Record<string, unknown>;
      for (const [field, to] of Object.entries(changes)) {
        if (to === undefined) continue;
        const from = fields[field] ?? null;
        if (String(from ?? '') === String(to ?? '')) continue;
        fields[field] = to;
        record(container.exportJobId, 'export.container.amended', actor, { field, from, to });
      }
    },

    async removeExportContainer(exportContainerId, actor) {
      const jobId = Object.keys(exportContainers).find((id) =>
        (exportContainers[id] ?? []).some((c) => c.exportContainerId === exportContainerId));
      if (!jobId) throw new Error(`Unknown container ${exportContainerId}`);

      // Refused once the box has been collected: by then it is a real
      // container doing real work, not a slot on a booking.
      const list = exportContainers[jobId]!;
      const container = list.find((c) => c.exportContainerId === exportContainerId)!;
      if (container.containerNumber) {
        throw new Error('That container has been collected and cannot be removed from the booking');
      }

      list.splice(list.indexOf(container), 1);
      record(jobId, 'export.container.removed', actor,
        { field: 'containerRef', from: container.containerRef, to: null });
    },

    async createMovement(draft, actor) {
      // §18. MOV-NNN, unique within the job and never reused after a
      // cancellation — so the next number comes from the highest ever issued,
      // not from how many are currently alive.
      // movements is keyed by job, not a flat list.
      const onJob = movements[draft.jobId] ?? [];
      const highest = onJob.reduce((best, m) => {
        const n = Number(String(m.movementRef).match(/(\d+)$/)?.[1] ?? 0);
        return Math.max(best, n);
      }, 0);
      const movementRef = `MOV-${String(highest + 1).padStart(3, '0')}`;

      const job = importJobs.find((j) => j.jobId === draft.jobId)
        ?? exportJobs.find((j) => j.exportJobId === draft.jobId);
      if (!job) throw new Error(`Unknown job ${draft.jobId}`);

      const movement = {
        movementId: `${draft.jobId}-${movementRef}`,
        movementRef,
        jobId: draft.jobId,
        jobDomain: 'jobId' in job ? 'IMPORT' : 'EXPORT',
        jobNumber: job.jobNumber,
        containerId: draft.containerId ?? null,
        containerNumber: null,
        secondaryContainerId: null,
        isDoubleMounted: false,
        movementType: draft.movementType,
        cargoState: 'LADEN',
        originType: draft.originType,
        origin: draft.origin,
        destinationType: draft.destinationType,
        destination: draft.destination,
        plannedDate: draft.plannedDate ?? null,
        plannedTime: draft.plannedTime ?? null,
        truck: null,
        driver: null,
        chassisId: null,
        movementStatus: 'PENDING',
        actualCollectionAt: null,
        actualDeliveryAt: null,
        standbyRequired: false,
        standbyStartedAt: null,
        standbyEndedAt: null,
        autoCreated: false,
        cancelledReason: null,
      } as unknown as Movement;

      (movements[draft.jobId] ??= []).push(movement);
      record(draft.jobId, 'movement.created', actor,
        { field: 'movementRef', from: null, to: movementRef });
      return clone(movement);
    },

    async scheduleMovement(movementId, plan, actor) {
      const movement = Object.values(movements).flat()
        .find((m) => m.movementId === movementId);
      if (!movement) throw new Error(`Unknown movement ${movementId}`);
      const fields = movement as unknown as Record<string, unknown>;
      for (const [field, to] of Object.entries(plan)) {
        if (to === undefined) continue;
        const from = fields[field] ?? null;
        if (String(from ?? '') === String(to ?? '')) continue;
        fields[field] = to;
        record(movement.jobId, 'movement.scheduled', actor, { field, from, to });
      }
    },

    async recordMovementProgress(movementId, progress, actor) {
      const movement = Object.values(movements).flat()
        .find((m) => m.movementId === movementId);
      if (!movement) throw new Error(`Unknown movement ${movementId}`);
      const fields = movement as unknown as Record<string, unknown>;
      for (const [field, to] of Object.entries(progress)) {
        if (to === undefined) continue;
        const from = fields[field] ?? null;
        if (String(from ?? '') === String(to ?? '')) continue;
        fields[field] = to;
        record(movement.jobId, 'movement.progressed', actor, { field, from, to });
      }
    },

    async cancelMovement(movementId, reason, actor) {
      const movement = Object.values(movements).flat()
        .find((m) => m.movementId === movementId);
      if (!movement) throw new Error(`Unknown movement ${movementId}`);
      if (!reason.trim()) throw new Error('A cancellation needs a reason');

      const fields = movement as unknown as Record<string, unknown>;
      fields.movementStatus = 'CANCELLED';
      fields.cancelledReason = reason.trim();
      record(movement.jobId, 'movement.cancelled', actor,
        { field: 'movementStatus', from: movement.movementStatus, to: 'CANCELLED' });
    },

    async listDocumentsForJob(jobId) {
      return clone(documents.filter((d) => d.jobId === jobId));
    },

    async storeDocument(draft, bytes, actor) {
      const problem = documentProblem(draft);
      if (problem) throw new Error(problem);

      // A second upload of the same document supersedes the first. The job was
      // worked off the original, so it stays and stops being current.
      const lineage = documents.filter((d) =>
        d.jobId === draft.jobId
        && d.documentType === draft.documentType
        && d.filename === draft.filename);
      for (const previous of lineage) previous.isCurrentVersion = false;
      const version = lineage.length + 1;

      const document: DocumentRecord = {
        documentId: `doc-${draft.jobId}-${documents.length + 1}`,
        jobId: draft.jobId,
        containerId: draft.containerId ?? null,
        movementId: draft.movementId ?? null,
        documentType: draft.documentType as DocumentRecord['documentType'],
        filename: draft.filename,
        storagePath: storagePathFor(draft.jobId, version, draft.filename),
        byteSize: bytes.byteLength,
        source: (draft.source ?? 'MANUAL_UPLOAD') as DocumentRecord['source'],
        receivedAt: new Date().toISOString(),
        receivedFrom: draft.receivedFrom ?? null,
        version,
        isCurrentVersion: true,
        extractionStatus: (draft.extractionStatus ?? 'PENDING') as DocumentRecord['extractionStatus'],
        uploadedBy: actor,
      };

      documents.push(document);
      documentBytes.set(document.documentId, bytes);
      record(draft.jobId, 'document.stored', actor,
        { field: 'filename', from: null, to: draft.filename });
      return clone(document);
    },

    async documentUrl(documentId) {
      // In-memory has no file storage and no URL to give. Null rather than a
      // fabricated link, because a link that 404s is worse than none.
      return documentBytes.has(documentId) ? null : null;
    },

    async listCustomerLocations(customerCode) {
      return clone(customerLocations.filter((l) => l.customerCode === customerCode));
    },

    async addCustomerLocation(customerCode, draft, actor) {
      const problem = locationProblem(draft);
      if (problem) throw new Error(problem);

      const location: CustomerLocation = {
        locationId: `loc-${customerCode}-${customerLocations.length + 1}`,
        customerCode,
        label: draft.label!.trim(),
        address: draft.address!.trim(),
        isDefault: draft.isDefault ?? false,
        doubleMountingPermitted: draft.doubleMountingPermitted ?? true,
        standbyUsual: draft.standbyUsual ?? false,
        active: draft.active ?? true,
      };

      // One default per customer. Setting a new one clears the old rather than
      // leaving two, which would make "the default" a question with two answers.
      if (location.isDefault) clearDefaultFor(customerCode);
      customerLocations.push(location);
      record(customerCode, 'location.added', actor,
        { field: 'label', from: null, to: location.label });
      return clone(location);
    },

    async amendCustomerLocation(locationId, changes, actor) {
      const location = customerLocations.find((l) => l.locationId === locationId);
      if (!location) throw new Error(`Unknown location ${locationId}`);

      const merged = { ...location, ...changes };
      const problem = locationProblem(merged);
      if (problem) throw new Error(problem);

      if (changes.isDefault === true) clearDefaultFor(location.customerCode);

      const fields = location as unknown as Record<string, unknown>;
      for (const [field, to] of Object.entries(changes)) {
        if (to === undefined) continue;
        const from = fields[field] ?? null;
        if (String(from ?? '') === String(to ?? '')) continue;
        fields[field] = to;
        record(location.customerCode, 'location.amended', actor, { field, from, to });
      }
    },

    async closeJob(jobId, actor) {
      const job = importJobs.find((j) => j.jobId === jobId)
        ?? exportJobs.find((j) => j.exportJobId === jobId);
      if (!job) throw new Error(`Unknown job ${jobId}`);

      const fields = job as unknown as Record<string, unknown>;
      if (fields.closedAt) throw new Error('That job is already closed');
      fields.closedAt = new Date().toISOString();
      fields.closedBy = actor;
      record(jobId, 'job.closed', actor, { field: 'closedAt', from: null, to: fields.closedAt });
    },

    async reopenJob(jobId, reason, actor) {
      const job = importJobs.find((j) => j.jobId === jobId)
        ?? exportJobs.find((j) => j.exportJobId === jobId);
      if (!job) throw new Error(`Unknown job ${jobId}`);

      const fields = job as unknown as Record<string, unknown>;
      if (!fields.closedAt) throw new Error('That job is not closed');
      const was = fields.closedAt;
      fields.closedAt = null;
      fields.closedBy = null;
      // The reason goes on the audit trail, which is the only record of why an
      // invoice moved.
      record(jobId, 'job.reopened', actor, { field: 'closedAt', from: was, to: reason });
    },

    async amendJob(jobId, changes, actor) {
      const job = importJobs.find((j) => j.jobId === jobId)
        ?? exportJobs.find((j) => j.exportJobId === jobId);
      if (!job) throw new Error(`Unknown job ${jobId}`);

      // Absent means leave alone; null means erase. A field the caller did not
      // mention must not be cleared because it was not mentioned.
      for (const [field, to] of Object.entries(changes)) {
        if (to === undefined) continue;
        // Named `fields`, not `record`: that name belongs to the audit
        // function in this scope, and shadowing it made the audit call
        // uncallable.
        const fields = job as unknown as Record<string, unknown>;
        const from = fields[field] ?? null;
        if (String(from ?? '') === String(to ?? '')) continue;
        fields[field] = to;
        record(jobId, 'job.amended', actor, { field, from, to });
      }
    },

    async listPermitsForJob(jobId) {
      return clone(permits.filter((p) => p.jobId === jobId).map(toPermitRecord));
    },
    async listPermitsForJobs(jobIds) {
      const wanted = new Set(jobIds);
      const byJob = new Map();
      for (const p of permits) {
        if (!wanted.has(p.jobId)) continue;
        if (!byJob.has(p.jobId)) byJob.set(p.jobId, []);
        byJob.get(p.jobId).push(toPermitRecord(p));
      }
      return clone([...byJob].map(([jobId, list]) => ({ jobId, permits: list })));
    },
    async recordPermit(jobId, draft, actor) {
      const permitId = `permit-${jobId}-${permits.length + 1}`;
      const stored = {
        permitId,
        jobId,
        permitNumber: draft.permitNumber ? normalisePermitNumber(draft.permitNumber) : null,
        expiryDate: draft.expiryDate ?? null,
        permitVesselVoyage: draft.permitVesselVoyage ?? null,
        fileName: draft.fileName ?? null,
        containerIds: [...(draft.containerIds ?? [])],
      };
      permits.push(stored);
      record(jobId, 'permit.recorded', actor,
        { field: 'permitNumber', from: null, to: stored.permitNumber });
      return clone(toPermitRecord(stored));
    },
    async linkPermitToContainers(permitId, containerIds, actor) {
      const permit = permits.find((p) => p.permitId === permitId);
      if (!permit) throw new Error(`Unknown permit ${permitId}`);
      const from = permit.containerIds.length;
      permit.containerIds = [...new Set(containerIds)];
      record(permit.jobId, 'permit.allocated', actor, {
        field: 'linkedContainers',
        from: String(from),
        to: String(permit.containerIds.length),
      });
    },
    async removePermit(permitId, actor) {
      const index = permits.findIndex((p) => p.permitId === permitId);
      if (index === -1) throw new Error(`Unknown permit ${permitId}`);
      const gone = permits[index]!;
      permits.splice(index, 1);
      record(gone.jobId, 'permit.removed', actor,
        { field: 'permitNumber', from: gone.permitNumber, to: null });
    },

    async removePrincipal(userId, actor) {
      const index = USERS.findIndex((u) => u.userId === userId);
      if (index === -1) throw new Error(`Unknown user ${userId}`);

      // The last administrator cannot be removed: there would be nobody left
      // who could add one, and the directory would be permanently frozen.
      const person = USERS[index]!;
      if (person.role === 'ADMINISTRATOR'
        && USERS.filter((u) => u.role === 'ADMINISTRATOR' && u.active).length <= 1) {
        throw new Error('Refusing to remove the last administrator');
      }

      USERS.splice(index, 1);
      // Recorded against the person who did the removing, because the removed
      // row is precisely what no longer exists to attribute it to.
      record(userId, 'user.removed', actor,
        { field: 'displayName', from: person.displayName, to: null });
    },

    async getPrincipalByEmail(email) {
      const wanted = email.trim().toLowerCase();
      return clone(USERS.find((u) => u.email?.toLowerCase() === wanted) ?? null);
    },
    async listPrincipals() { return clone(USERS); },

    async listChassis() { return clone(fleet); },

    async recordChassisChange(request, actor) {
      const change = recordChassisChange(
        { ...request, changedBy: actor, changedAt: new Date().toISOString() },
        `CHG-${chassisChanges.length + 1}`);
      // §35.8: occupancy splits across both units, so neither record is
      // falsified. Applying the change is what performs the split.
      derivedHoldings = applyChassisChange(holdingsNow(), change);
      chassisChanges.push(change);
      record(change.jobId, 'movement.cancelled', actor, {
        field: 'chassis',
        from: change.chassisIdPrevious,
        to: change.chassisIdNew ?? 'grounded',
      });
      return clone(change);
    },
    async listChassisChanges() { return clone(chassisChanges); },

    async listDateAmendments(entityId) {
      return clone(amendments.filter((a) => a.entityId === entityId));
    },

    async amendDate(request: DateAmendmentInput, actor) {
      const current = dateFieldValue(request.entityId, request.dateField);
      const { amendment, log } = appendAmendment(amendments, {
        entityType: request.entityType,
        entityId: request.entityId,
        dateField: request.dateField,
        previousValue: current,
        newValue: request.newValue,
        reasonCode: request.reasonCode as DateAmendment['reasonCode'],
        reasonNote: request.reasonNote ?? null,
        amendedBy: actor,
        amendedAt: new Date().toISOString(),
      }, `AMD-${amendments.length + 1}`);
      amendments.length = 0;
      amendments.push(...log);
      applyDateValue(request.entityId, request.dateField, request.newValue);
      // §13.1 rule 5: both are written. The audit stream is the legal record,
      // the amendment log is the operational one.
      record(request.entityId, 'job.mandatoryFieldChanged', actor, {
        field: request.dateField, from: current, to: request.newValue,
      });
      return clone(amendment);
    },

    /**
     * §35.2. Holdings are derived from the containers themselves: a chassis is
     * assigned at job level and held until released, so there is no separate
     * holdings table to drift out of step with the jobs.
     */
    async listChassisHoldings() {
      if (derivedHoldings) return clone(derivedHoldings);
      const holdings: ChassisHolding[] = [];
      for (const [jobId, list] of Object.entries(importContainers)) {
        for (const c of list) {
          if (!c.chassisId) continue;
          holdings.push({
            chassisId: c.chassisId, containerId: c.containerId, jobId,
            mountedAt: c.chassisMountedAt, releasedAt: c.chassisReleasedAt,
            doubleMountedWith: null,
          });
        }
      }
      for (const [jobId, list] of Object.entries(exportContainers)) {
        for (const c of list) {
          if (!c.chassisId) continue;
          holdings.push({
            chassisId: c.chassisId, containerId: c.exportContainerId, jobId,
            mountedAt: c.chassisMountedAt, releasedAt: c.chassisReleasedAt,
            doubleMountedWith: null,
          });
        }
      }
      derivedHoldings = holdings;
      return clone(holdings);
    },

    async recordCms(jobId, status, actor, reason) {
      const job = exportJobs.find((j) => j.exportJobId === jobId);
      if (!job) {
        // §40 puts CMS on the export job only. Saying the job is unknown when
        // it exists as an import job sends the caller looking for a missing
        // record instead of telling them the command does not apply.
        const asImport = importJobs.find((j) => j.jobId === jobId);
        throw new Error(asImport
          ? `§40: CMS applies to export jobs. ${asImport.jobNumber} is an import job`
          : `Unknown export job ${jobId}`);
      }
      const from = job.cmsStatus;
      job.cmsStatus = status;
      record(jobId, 'cms.completed', actor, { field: 'cmsStatus', from, to: status });
      if (reason) record(jobId, 'cms.completed', actor, { field: 'reason', to: reason });
    },
    async recordPermitReceived(jobId, permitNumber, actor) {
      const job = importJobs.find((j) => j.jobId === jobId);
      if (!job) throw new Error(`Unknown import job ${jobId}`);
      const from = job.permitReceived;
      job.permitReceived = true;
      job.permitRejected = false;
      record(jobId, 'permit.received', actor, { field: 'permitReceived', from, to: true });
      record(jobId, 'permit.received', actor, { field: 'permitNumber', to: permitNumber });
    },
    async recordPortnetReleased(jobId, actor) {
      const job = importJobs.find((j) => j.jobId === jobId);
      if (!job) throw new Error(`Unknown import job ${jobId}`);
      const from = job.portnetReleased;
      job.portnetReleased = true;
      record(jobId, 'portnet.released', actor, { field: 'portnetReleased', from, to: true });
    },
    // Why an export-container command found nothing. Container ready, VGM and
    // identity capture record that a shipper has stuffed and weighed a box —
    // export events. An import container has no equivalent; §36.3's
    // empty-ready confirmation is a different thing. Reporting "unknown"
    // sends the caller hunting for a missing record instead of telling them
    // the command does not apply.
    async recordFreeTime(containerId, terms, actor) {
      const container = Object.values(importContainers).flat()
        .find((c) => c.containerId === containerId);
      if (!container) throw new Error(`Unknown container ${containerId}`);

      const from = container.freeTimeModel;
      container.freeTimeModel = terms.freeTimeModel as ImportContainer['freeTimeModel'];

      // Only the fields the chosen model uses are kept. Writing all six would
      // store the contradiction §34.3 exists to prevent — a combined carrier
      // with split figures beside it, and nothing to say which applies.
      const split = terms.freeTimeModel === 'SPLIT';
      const combined = terms.freeTimeModel === 'COMBINED';
      container.demurrageFreeDays = split ? terms.demurrageFreeDays ?? null : null;
      container.demurrageLfd = split ? terms.demurrageLfd ?? null : null;
      container.detentionFreeDays = split ? terms.detentionFreeDays ?? null : null;
      container.detentionLfd = split ? terms.detentionLfd ?? null : null;
      container.combinedFreeDays = combined ? terms.combinedFreeDays ?? null : null;
      container.combinedLfd = combined ? terms.combinedLfd ?? null : null;
      container.freeTimeRemarks = terms.freeTimeRemarks ?? null;

      record(container.jobId, 'freetime.confirmed', actor, {
        field: 'freeTimeModel', from, to: terms.freeTimeModel,
      });
    },

    async captureContainerIdentity(containerId, details, actor) {
      const c = findExportContainer(containerId);
      if (!c) throw new Error((() => {
        const asImport = Object.values(importContainers).flat()
          .find((ic) => ic.containerId === containerId);
        return asImport
          ? `This is an import container (${asImport.containerNumber ?? containerId}). Container ready and VGM are export commands.`
          : `Unknown container ${containerId}`;
      })());
      c.containerNumber = details.containerNumber;
      c.sealNumber = details.sealNumber;
      c.tareWeightKg = details.tareWeightKg;
      record(jobOfContainer(containerId), 'container.identityCaptured', actor,
        { field: 'containerNumber', to: details.containerNumber });
    },
    async recordTranshipment(jobId, status, actor) {
      const job = exportJobs.find((j) => j.exportJobId === jobId);
      if (!job) {
        // Transhipment is an export check (§47). Same reasoning as CMS: say
        // the command does not apply, not that the job is missing.
        const asImport = importJobs.find((j) => j.jobId === jobId);
        throw new Error(asImport
          ? `§47: the transhipment check applies to export jobs. ${asImport.jobNumber} is an import job`
          : `Unknown export job ${jobId}`);
      }
      const from = job.transhipmentStatus;
      job.transhipmentStatus = status;
      job.transhipmentCheckedAt = new Date().toISOString();
      record(jobId, 'transhipment.changed', actor,
        { field: 'transhipmentStatus', from, to: status });
    },
    async recordContainerReady(containerId, actor) {
      const c = findExportContainer(containerId);
      if (!c) throw new Error((() => {
        const asImport = Object.values(importContainers).flat()
          .find((ic) => ic.containerId === containerId);
        return asImport
          ? `This is an import container (${asImport.containerNumber ?? containerId}). Container ready and VGM are export commands.`
          : `Unknown container ${containerId}`;
      })());
      c.containerReady = true;
      c.containerReadyAt = new Date().toISOString();
      record(jobOfContainer(containerId), 'container.readyConfirmed', actor,
        { field: 'containerReady', from: false, to: true });
    },
    async recordVgm(containerId, vgm, actor) {
      const c = findExportContainer(containerId);
      if (!c) throw new Error((() => {
        const asImport = Object.values(importContainers).flat()
          .find((ic) => ic.containerId === containerId);
        return asImport
          ? `This is an import container (${asImport.containerNumber ?? containerId}). Container ready and VGM are export commands.`
          : `Unknown container ${containerId}`;
      })());
      const from = c.vgm;
      c.vgm = vgm;
      c.vgmReceivedAt = new Date().toISOString();
      record(jobOfContainer(containerId), 'vgm.received', actor, { field: 'vgm', from, to: vgm });
    },

    async listAuditEvents(entityId) {
      return clone(audit.filter((e) => e.entityId === entityId));
    },

    async listOpenDiscrepancies(jobId) {
      return clone((discrepancies[jobId] ?? []).filter((d) => d.resolvedAt === null));
    },

    async raiseDiscrepancy(jobId, discrepancy: Discrepancy, actor) {
      const list = discrepancies[jobId] ?? (discrepancies[jobId] = []);
      // One open discrepancy per field: a second conflicting document updates
      // the standing question rather than stacking another one behind it.
      const existing = list.find((d) => d.field === discrepancy.field && d.resolvedAt === null);
      if (existing) Object.assign(existing, discrepancy);
      else list.push({ ...discrepancy, resolvedAt: null, resolvedBy: null, resolution: null });
      record(jobId, 'discrepancy.raised', actor, {
        field: discrepancy.field, from: discrepancy.storedValue, to: discrepancy.extractedValue,
      });
    },

    async resolveDiscrepancy(jobId, field, choice, actor) {
      const open = (discrepancies[jobId] ?? []).find((d) => d.field === field && d.resolvedAt === null);
      if (!open) throw new Error(`Unknown open discrepancy ${field} on job ${jobId}`);
      open.resolvedAt = new Date().toISOString();
      open.resolvedBy = actor;
      open.resolution = choice;
      // §12: the decision is audited, whichever way it went.
      record(jobId, 'discrepancy.resolved', actor, {
        field,
        from: open.storedValue,
        to: choice === 'extracted' ? open.extractedValue : open.storedValue,
      });
    },
  };
}
