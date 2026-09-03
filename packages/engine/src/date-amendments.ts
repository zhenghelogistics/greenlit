import type { DateAmendmentReason } from './enums.ts';
import type { AuditEntityType } from './audit.ts';

/**
 * §13.1. The date amendment log.
 *
 * The audit stream already records that a date changed and who changed it. It
 * has nowhere to record **why**, and why is the entire content of the
 * conversation a controller has when the customer calls.
 *
 * So amendments are a first-class, visible log on the record — not a filtered
 * view of the audit stream. Both are written: §13.1 rule 5 is explicit that
 * "the audit stream is the legal record and the amendment log is the
 * operational one".
 */

/** §13.1. The dates covered. */
export const AMENDABLE_DATE_FIELDS = [
  'plannedDate',
  'plannedTime',
  'deliveryDate',
  'vesselEta',
  'truckInDate',
  'truckOutDate',
  'emptyReturnDueDate',
] as const;
export type AmendableDateField = (typeof AMENDABLE_DATE_FIELDS)[number];

export interface DateAmendment {
  amendmentId: string;
  entityType: AuditEntityType;
  entityId: string;
  dateField: string;
  previousValue: string | null;
  newValue: string | null;
  reasonCode: DateAmendmentReason;
  /** Mandatory where reasonCode is OTHER. */
  reasonNote: string | null;
  /** A named user, never a shared account. */
  amendedBy: string;
  amendedAt: string;
  /** 1, 2, 3… within the same date field. */
  sequence: number;
}

export interface AmendmentRequest {
  entityType: AuditEntityType;
  entityId: string;
  dateField: string;
  previousValue: string | null;
  newValue: string | null;
  reasonCode: DateAmendmentReason | null;
  reasonNote?: string | null;
  amendedBy: string;
  amendedAt: string;
}

export interface AmendmentValidation {
  valid: boolean;
  reason: string | null;
}

/**
 * §13.1 rule 1. A date field cannot be changed without a reason code.
 * "Enforced server-side, not by the form."
 */
export function validateAmendment(request: AmendmentRequest): AmendmentValidation {
  if (!request.amendedBy?.trim()) {
    return { valid: false, reason: '§13.1: an amendment requires a named user' };
  }
  if (!request.reasonCode) {
    return { valid: false, reason: '§13.1: a date cannot be changed without a reason code' };
  }
  if (request.reasonCode === 'OTHER' && !request.reasonNote?.trim()) {
    return { valid: false, reason: '§13.1: reason code OTHER requires a note' };
  }
  if (request.previousValue === request.newValue) {
    return { valid: false, reason: 'The date is unchanged' };
  }
  return { valid: true, reason: null };
}

/**
 * §13.1 rule 2. Amendments are never edited or deleted; a wrong entry is
 * corrected by a further amendment. So this only ever appends.
 */
export function appendAmendment(
  existing: readonly DateAmendment[],
  request: AmendmentRequest,
  amendmentId: string,
): { amendment: DateAmendment; log: DateAmendment[] } {
  const validation = validateAmendment(request);
  if (!validation.valid) throw new Error(validation.reason ?? 'Invalid amendment');

  const forField = existing.filter(
    (a) => a.entityId === request.entityId && a.dateField === request.dateField,
  );
  const amendment: DateAmendment = {
    amendmentId,
    entityType: request.entityType,
    entityId: request.entityId,
    dateField: request.dateField,
    previousValue: request.previousValue,
    newValue: request.newValue,
    reasonCode: request.reasonCode!,
    reasonNote: request.reasonNote ?? null,
    amendedBy: request.amendedBy,
    amendedAt: request.amendedAt,
    sequence: forField.length + 1,
  };
  return { amendment, log: [...existing, amendment] };
}

export interface DateFieldHistory {
  dateField: string;
  /** §13.1 rule 3. The original stays visible alongside the current one. */
  originalValue: string | null;
  currentValue: string | null;
  /** §13.1 rule 4. Stored per field and available to queues and reports. */
  amendmentCount: number;
  amendments: DateAmendment[];
}

/**
 * §13.1.1. Renders as a plain history, in the order it happened.
 *
 * "A controller picking the job up mid-week reads that in five seconds. The
 * same history reconstructed from the audit stream takes several minutes and
 * loses every reason."
 */
export function dateFieldHistory(
  amendments: readonly DateAmendment[],
  entityId: string,
  dateField: string,
): DateFieldHistory {
  const forField = amendments
    .filter((a) => a.entityId === entityId && a.dateField === dateField)
    .sort((a, b) => a.sequence - b.sequence);

  return {
    dateField,
    originalValue: forField[0]?.previousValue ?? null,
    currentValue: forField.at(-1)?.newValue ?? null,
    amendmentCount: forField.length,
    amendments: forField,
  };
}

/**
 * §13.1.3. Churn is a signal, not noise.
 *
 * "A container rescheduled five times is telling the operation something." The
 * point is not to stop amendments — the operation runs on them — but to make
 * visible a pattern that currently lives only in a controller's memory.
 */
export function detectDateChurn(
  amendments: readonly DateAmendment[],
  entityId: string,
  threshold: number,
): { exceptionType: string; severity: 'LOW'; description: string }[] {
  const byField = new Map<string, number>();
  for (const a of amendments) {
    if (a.entityId !== entityId) continue;
    byField.set(a.dateField, (byField.get(a.dateField) ?? 0) + 1);
  }
  const out: { exceptionType: string; severity: 'LOW'; description: string }[] = [];
  for (const [dateField, count] of byField) {
    if (count > threshold) {
      out.push({
        exceptionType: 'Date churn',
        severity: 'LOW',
        description: `${dateField} amended ${count} times, above the threshold of ${threshold}`,
      });
    }
  }
  return out;
}

/**
 * §13.1.3. Reported per customer and per carrier, amendment_count is one of
 * the few measures that quantifies **disruption** rather than delay. A
 * customer who moves every date twice is more expensive to serve than one who
 * never does, and nothing in the operation currently says so.
 */
export function disruptionScore(amendments: readonly DateAmendment[]): number {
  return amendments.filter((a) => a.reasonCode === 'CUSTOMER_REQUEST'
    || a.reasonCode === 'CUSTOMER_NO_SPACE').length;
}
