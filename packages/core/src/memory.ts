import {
  nextJobReference, userEvent, validateCustomerDraft,
  type AuditEvent, type Chassis, type ChassisHolding, type Customer,
  type CustomerDraft, type Discrepancy, type Principal,
} from '@greenlit/engine';
import type {
  ExceptionRecord, ExportContainer, ExportJob, ImportContainer, ImportJob,
  Movement, Thresholds,
} from '@greenlit/engine';
import type { ExportJobDraft, ImportJobDraft, Repository, StoredDiscrepancy } from './repository.ts';

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
  ddCriticalDays: 1,
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
  { customerId: 'str', code: 'STR', companyName: 'Straits Cargo', shortName: 'Straits',
    billingName: 'Straits Cargo Pte Ltd', defaultConsignee: null,
    defaultDeliveryAddress: null, defaultContact: 'ops@straitscargo.sg',
    emailDomains: ['straitscargo.sg'], accountStatus: 'ACTIVE', notes: null,
    createdAt: '2026-02-11T00:00:00Z' },
];

const USERS: Principal[] = [
  { userId: 'sarah', displayName: 'Sarah Lim', role: 'CONTROLLER', active: true },
  { userId: 'winnie', displayName: 'Winnie Ong', role: 'CONTROLLER', active: true },
  { userId: 'brandon', displayName: 'Brandon Lee', role: 'CONTROLLER', active: true },
  { userId: 'john', displayName: 'John Tan', role: 'ADMINISTRATOR', active: true },
  { userId: 'mei', displayName: 'Mei Chen', role: 'MANAGER', active: true },
  // §7.3: override is grantable to a manager as a narrow extra permission.
  { userId: 'raymond', displayName: 'Raymond Koh', role: 'MANAGER', active: true,
    extraPermissions: ['gate.override'] },
  { userId: 'former', displayName: 'Former Staff', role: 'CONTROLLER', active: false },
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
    blNumber: 'ABC123456', vesselName: 'Vessel XYZ', voyageNumber: '123E',
    eta: '2026-08-20', jobType: 'standard', deliveryAddress: '12 Tuas Ave 8',
    permitRequired: true, permitReceived: false, permitRejected: false,
    portnetRequired: true, portnetReleased: false,
    assignedController: 'Sarah', cancelled: false, onHold: false,
    createdAt: '2026-08-18T08:00:00Z',
  },
  {
    jobId: 'ij2', jobNumber: 'JOB-260816-004', customer: 'Lion City Traders',
    blNumber: 'BL778812', vesselName: 'Kota Ratu', voyageNumber: '044W',
    eta: '2026-08-16', jobType: 'standard', deliveryAddress: '3 Pioneer Sector 2',
    permitRequired: false, permitReceived: true, permitRejected: false,
    portnetRequired: true, portnetReleased: true,
    assignedController: 'Brandon', cancelled: false, onHold: false,
    createdAt: '2026-08-16T02:00:00Z',
  },
];

const IMPORT_CONTAINERS: Record<string, ImportContainer[]> = {
  ij1: [{
    containerId: 'ic1', containerNumber: 'OOLU8841250', jobId: 'ij1',
    containerSize: '40', containerType: 'HQ', sealNumber: null, grossWeight: 21400,
    cargoDescription: 'General cargo', portTerminal: 'PSA Pasir Panjang',
    emptyReturnYard: 'Jurong Yard', freeTimeModel: 'SPLIT', freeTimeCountsFrom: 'VESSEL_ETA',
    demurrageFreeDays: 5, demurrageLfd: '2026-09-01', detentionFreeDays: 7,
    detentionLfd: '2026-09-04', combinedFreeDays: null, combinedLfd: null,
    internalLfd: '2026-08-27', carparkReason: null, carparkArrivedAt: null,
    emptyReadyConfirmed: false, emptyReadyConfirmedAt: null, emptyReadySource: null,
    chassisId: 'CH-4029', chassisMountedAt: null, chassisReleasedAt: null,
    cancelled: false, onHold: false,
  }],
  ij2: [{
    containerId: 'ic2', containerNumber: 'CSNU7213366', jobId: 'ij2',
    containerSize: '20', containerType: 'GP', sealNumber: 'SG88213', grossWeight: 14800,
    cargoDescription: 'Machine parts', portTerminal: 'PSA Brani',
    emptyReturnYard: 'Jurong Yard', freeTimeModel: 'COMBINED', freeTimeCountsFrom: 'DISCHARGE',
    demurrageFreeDays: null, demurrageLfd: null, detentionFreeDays: null,
    detentionLfd: '2026-09-02', combinedFreeDays: 10, combinedLfd: '2026-09-02',
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
  const exportContainers = clone(EXPORT_CONTAINERS);
  const movements = clone(MOVEMENTS);
  const exceptions = clone(EXCEPTIONS);
  const discrepancies: Record<string, StoredDiscrepancy[]> = {};
  const fleet = buildFleetRegister();
  const customers = clone(CUSTOMERS);

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

      const issued = [...importJobs.map((j) => j.jobNumber), ...exportJobs.map((j) => j.jobNumber)];
      const jobNumber = nextJobReference(issued, customer.code);
      const jobId = jobNumber.toLowerCase();

      const job: ImportJob = {
        jobId, jobNumber, customer: customer.companyName,
        blNumber: draft.blNumber ?? null,
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
      importContainers[jobId] = [];
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
        exportJobId: jobId, jobNumber, customer: customer.companyName,
        shipper: draft.shipper ?? customer.companyName,
        bookingReference: draft.bookingReference ?? null,
        exportClearanceReference: draft.exportClearanceReference ?? null,
        carrier: null,
        vesselName: draft.vesselName ?? null,
        voyageNumber: draft.voyageNumber ?? null,
        etaSingapore: draft.etaSingapore ?? null,
        vesselClosingAt: null,
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
    async listPrincipals() { return clone(USERS); },

    async listChassis() { return clone(fleet); },

    /**
     * §35.2. Holdings are derived from the containers themselves: a chassis is
     * assigned at job level and held until released, so there is no separate
     * holdings table to drift out of step with the jobs.
     */
    async listChassisHoldings() {
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
      return holdings;
    },

    async recordCms(jobId, status, actor, reason) {
      const job = exportJobs.find((j) => j.exportJobId === jobId);
      if (!job) throw new Error(`Unknown export job ${jobId}`);
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
    async captureContainerIdentity(containerId, details, actor) {
      const c = findExportContainer(containerId);
      if (!c) throw new Error(`Unknown container ${containerId}`);
      c.containerNumber = details.containerNumber;
      c.sealNumber = details.sealNumber;
      c.tareWeightKg = details.tareWeightKg;
      record(jobOfContainer(containerId), 'container.identityCaptured', actor,
        { field: 'containerNumber', to: details.containerNumber });
    },
    async recordTranshipment(jobId, status, actor) {
      const job = exportJobs.find((j) => j.exportJobId === jobId);
      if (!job) throw new Error(`Unknown export job ${jobId}`);
      const from = job.transhipmentStatus;
      job.transhipmentStatus = status;
      job.transhipmentCheckedAt = new Date().toISOString();
      record(jobId, 'transhipment.changed', actor,
        { field: 'transhipmentStatus', from, to: status });
    },
    async recordContainerReady(containerId, actor) {
      const c = findExportContainer(containerId);
      if (!c) throw new Error(`Unknown container ${containerId}`);
      c.containerReady = true;
      c.containerReadyAt = new Date().toISOString();
      record(jobOfContainer(containerId), 'container.readyConfirmed', actor,
        { field: 'containerReady', from: false, to: true });
    },
    async recordVgm(containerId, vgm, actor) {
      const c = findExportContainer(containerId);
      if (!c) throw new Error(`Unknown container ${containerId}`);
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
