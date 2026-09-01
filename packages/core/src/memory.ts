import type {
  ExceptionRecord, ExportContainer, ExportJob, ImportContainer, ImportJob,
  Movement, Thresholds,
} from '@greenlit/engine';
import type { Repository } from './repository.ts';

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
  chassisId: null, carparkArrivedAt: null, cancelled: false, onHold: false, ...o,
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

  const findExportContainer = (id: string) =>
    Object.values(exportContainers).flat().find((c) => c.exportContainerId === id);

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

    async recordCms(jobId, status) {
      const job = exportJobs.find((j) => j.exportJobId === jobId);
      if (!job) throw new Error(`Unknown export job ${jobId}`);
      job.cmsStatus = status;
    },
    async recordPermitReceived(jobId, permitNumber) {
      const job = importJobs.find((j) => j.jobId === jobId);
      if (!job) throw new Error(`Unknown import job ${jobId}`);
      job.permitReceived = true;
      job.permitRejected = false;
      void permitNumber;
    },
    async recordPortnetReleased(jobId) {
      const job = importJobs.find((j) => j.jobId === jobId);
      if (!job) throw new Error(`Unknown import job ${jobId}`);
      job.portnetReleased = true;
    },
    async captureContainerIdentity(containerId, details) {
      const c = findExportContainer(containerId);
      if (!c) throw new Error(`Unknown container ${containerId}`);
      c.containerNumber = details.containerNumber;
      c.sealNumber = details.sealNumber;
      c.tareWeightKg = details.tareWeightKg;
    },
    async recordTranshipment(jobId, status) {
      const job = exportJobs.find((j) => j.exportJobId === jobId);
      if (!job) throw new Error(`Unknown export job ${jobId}`);
      job.transhipmentStatus = status;
      job.transhipmentCheckedAt = new Date().toISOString();
    },
    async recordContainerReady(containerId) {
      const c = findExportContainer(containerId);
      if (!c) throw new Error(`Unknown container ${containerId}`);
      c.containerReady = true;
      c.containerReadyAt = new Date().toISOString();
    },
    async recordVgm(containerId, vgm) {
      const c = findExportContainer(containerId);
      if (!c) throw new Error(`Unknown container ${containerId}`);
      c.vgm = vgm;
      c.vgmReceivedAt = new Date().toISOString();
    },
  };
}
