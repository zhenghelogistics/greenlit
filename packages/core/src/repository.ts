import type {
  ExceptionRecord, ExportContainer, ExportJob, ImportContainer, ImportJob,
  Movement, Thresholds,
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

  getThresholds(customerId?: string): Promise<Thresholds>;

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
}

/** §13. Every command writes one of these. Named rule, named actor. */
export interface AuditEvent {
  event: string;
  entityType: 'job' | 'container' | 'movement' | 'document' | 'exception';
  entityId: string;
  field: string | null;
  previousValue: string | null;
  newValue: string | null;
  actor: string;
  source: 'USER' | 'EMAIL_AUTOMATION' | 'AI_EXTRACTION' | 'SYSTEM_RULE' | 'API';
  createdAt: string;
}

export interface AuditSink {
  append(event: AuditEvent): Promise<void>;
  listForEntity(entityId: string): Promise<AuditEvent[]>;
}
