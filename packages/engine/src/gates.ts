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
  // SPEC CONFLICT, settled by operations on 24 September 2026.
  //
  // §41 and §40.2 disagreed and this was built toward §40.2 — NOT_REQUIRED
  // released the gate, on the reading that a status which never satisfies
  // anything is a status that blocks a job forever.
  //
  // Operations answered the other way, and more plainly than the question was
  // asked: **CMS is required for every empty collection.** There is no exempt
  // export job. A controller may not send a driver for an empty until this
  // job's CMS is done, because the collection is what the CMS authorises.
  //
  // So only COMPLETED passes. NOT_REQUIRED stays in the enum for rows that
  // already carry it, and no longer satisfies anything — which is why it is
  // also no longer offered on the form. A status nobody can choose cannot
  // strand a new job, and the ones that already have it are visible as
  // Awaiting CMS rather than silently ready.
  if (job.cmsRequired && job.cmsStatus !== 'COMPLETED') failures.push('CMS');

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
 * §42. Whether the customer can be told the container's number yet.
 *
 * "The notification is generated from stored job data, never retyped by the
 * controller." So the gate is about what is on file: a notification cannot be
 * generated from facts nobody has captured, and one sent with a blank seal is
 * worse than one not sent, because the customer stuffs and seals against it.
 *
 * Tare is included because the customer needs it to compute VGM in §43. A
 * notification without it produces a second round of email at exactly the
 * point §42 is trying to remove one.
 *
 * The recipient is checked here too. §42 stores the recipient address as part
 * of the record, and "sent" with nobody named is a flag that cannot be
 * audited — which is the state the notification record exists to prevent.
 */
export function canSendContainerDetails(
  container: ExportContainer,
  recipient: string,
): GateResult {
  const failures: string[] = [];

  if (container.containerNumber === null) failures.push('Container number not captured');
  if (container.sealNumber === null) failures.push('Seal number not captured');
  if (container.tareWeightKg === null) {
    failures.push('Tare weight not captured, and the customer needs it for VGM');
  }
  // Deliberately not a full address grammar. The check is that somebody was
  // named, because a validator that rejects a real address is worse than one
  // that accepts an odd-looking one a person chose to type.
  if (!recipient.trim()) failures.push('No recipient address');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())) {
    failures.push(`${recipient.trim()} is not an email address`);
  }

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


/**
 * Why a trip for an empty container cannot be planned yet.
 *
 * Operations, 24 September 2026: *"CMS is required for all empty collections
 * to proceed. Before planning, the controller must ensure that this job's CMS
 * is done before he can assign a driver to go down and collect the
 * container."*
 *
 * So this refuses rather than warns, which is unusual here and is right. The
 * warn-not-block principle holds where the odd-looking answer is sometimes the
 * true one — a container number of the wrong shape, a delivery date before the
 * ETA. This is not that. The CMS is what authorises the collection, and a
 * driver sent without one is a wasted trip at best; there is no case where
 * going anyway is correct, so there is nothing for an override to express.
 *
 * Import jobs have no CMS at all and are not asked about: an import empty is
 * an EMPTY_RETURN going back to the depot, which nothing authorises because
 * the box is already ours to return.
 *
 * Returns null when the trip may be planned.
 */
export function refuseEmptyCollection(
  job: { cmsRequired?: boolean; cmsStatus?: string } | null | undefined,
  movementType: string,
): string | null {
  if (movementType !== 'EMPTY_COLLECTION') return null;
  if (!job || job.cmsRequired === false) return null;
  if (job.cmsStatus === 'COMPLETED') return null;
  return 'The CMS for this job is not done, so an empty collection cannot be planned yet. '
    + 'Record the CMS, then assign a driver.';
}
