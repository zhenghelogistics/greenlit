/**
 * @greenlit/core — application services.
 *
 * Depends on @greenlit/engine for rules and on a Repository for storage.
 * Knows nothing about HTTP, React, or any database.
 */
export type { Repository, AuditEvent } from './repository.ts';
export { createMemoryRepository, DEFAULT_THRESHOLDS } from './memory.ts';
export { JobService, IMPORT_MANDATORY, EXPORT_MANDATORY } from './service.ts';
export {
  deriveImportJob, deriveExportJob, buildImportCtx, buildExportCtx,
  type DerivedJobView, type DerivedContainerView,
} from './derive.ts';
