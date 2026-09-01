import type {
  ExportContainer, ExportJob, ImportContainer, ImportJob, MandatoryFieldSet,
} from './types.ts';

/**
 * Gate results. §31.1 / §41 require the interface to display exactly which
 * condition failed, so a bare boolean is not enough — the reasons travel with
 * the verdict.
 */
export interface GateResult {
  passed: boolean;
  /** Unsatisfied conditions, in display order. Empty when passed. */
  failures: string[];
}

const pass: GateResult = { passed: true, failures: [] };
const fail = (...failures: string[]): GateResult => ({ passed: false, failures });

/**
 * §30 / §40.1. Mandatory fields describe *data completeness*. Gate conditions
 * describe *milestones*. Nothing appears in both — that double-counting was
 * conflict #13 in the decision register.
 */
export function missingMandatoryFields(
  record: Record<string, unknown>,
  set: MandatoryFieldSet,
): string[] {
  return set.fields.filter((field) => {
    const value = record[field];
    return value === null || value === undefined || value === '';
  });
}

export function mandatoryFieldsComplete(
  record: Record<string, unknown>,
  set: MandatoryFieldSet,
): boolean {
  return missingMandatoryFields(record, set).length === 0;
}

/**
 * §31. Import collection eligibility — the primary product rule for import.
 *
 * This function lives in the domain service layer and nowhere else. The
 * frontend displays its result and must never independently decide whether
 * collection is permitted. If the browser can reach a different answer, the
 * build is wrong.
 */
export function canCollect(
  job: ImportJob,
  _container: ImportContainer,
  mandatory: MandatoryFieldSet,
): GateResult {
  const missing = missingMandatoryFields(job as unknown as Record<string, unknown>, mandatory);
  const failures: string[] = [];

  if (missing.length > 0) failures.push(...missing.map((f) => `Missing: ${f}`));
  if (job.permitRequired && !job.permitReceived) failures.push('Permit has not been received');
  if (job.portnetRequired && !job.portnetReleased) failures.push('Portnet release not confirmed');

  return failures.length === 0 ? pass : { passed: false, failures };
}

/**
 * §41. Export empty collection gate. Mandatory fields plus CMS.
 *
 * The common failure this prevents: empty collection arranged before CMS is
 * done. The gate exists to make that impossible, not to remind someone.
 */
export function canCollectEmpty(
  job: ExportJob,
  mandatory: MandatoryFieldSet,
): GateResult {
  const missing = missingMandatoryFields(job as unknown as Record<string, unknown>, mandatory);
  const failures: string[] = [];

  if (missing.length > 0) failures.push(...missing.map((f) => `Missing: ${f}`));
  // SPEC CONFLICT, resolved toward §40.2.
  // §41's pseudocode reads `cms_status != COMPLETED`, which would block a job
  // whose CMS status is NOT_REQUIRED. §40.2 explicitly permits NOT_REQUIRED as
  // an permissioned choice with a mandatory reason, and Appendix A item 13
  // records that the edition 1.0 phrasing made the rule unsatisfiable for
  // legitimately exempt jobs. Only PENDING blocks.
  if (job.cmsRequired && job.cmsStatus === 'PENDING') failures.push('CMS');

  return failures.length === 0 ? pass : { passed: false, failures };
}

/**
 * §44.2. Export laden gate. Evaluated **per container**, not per job.
 *
 * No laden movement of any type may be created while this returns false.
 *
 * Portnet is deliberately absent: §44.2.1 makes it warn, not block, because
 * the blocking condition is outside our control and a routinely-overridden
 * gate teaches people to ignore every other gate.
 */
export function canStartLaden(
  job: ExportJob,
  container: ExportContainer,
  /** §43.1. False while any LADEN_SITE_TO_SITE leg remains outstanding. */
  stuffingComplete: boolean,
): GateResult {
  const failures: string[] = [];

  if (container.containerNumber === null) failures.push('Container number not captured');
  if (!container.containerReady) failures.push('Customer has not confirmed container ready');
  if (container.vgm === null) failures.push('VGM not received');
  if (!stuffingComplete) failures.push('Stuffing not complete at final location');
  if (job.transhipmentStatus === 'PENDING') failures.push('Transhipment availability not established');

  return failures.length === 0 ? pass : { passed: false, failures };
}

/**
 * §43. VGM must exceed tare. At or below tare is impossible and raises a
 * discrepancy rather than being stored.
 *
 * Edition 1.0 stated this as *below* tare in one place and *at or below* in
 * three others; at or below is correct, because a laden container cannot weigh
 * exactly its own tare (register item 21).
 */
export function isVgmPlausible(vgm: number, tareWeightKg: number): boolean {
  return vgm > tareWeightKg;
}
