import type { JobDomain } from './enums.ts';

/**
 * §8.1. Job numbers.
 *
 * System generated, unique across both domains, immutable after creation.
 *
 *   JOB-YYMMDD-XXX   import    JOB-260817-001
 *   EXP-YYMMDD-XXX   export    EXP-260817-001
 *
 * XXX is the sequence for that day, and the two sequences are independent —
 * so an import and an export created on the same day may both be -001 while
 * remaining distinct, because the prefix carries the domain.
 */

const PREFIX: Record<JobDomain, string> = { IMPORT: 'JOB', EXPORT: 'EXP' };

export const JOB_NUMBER_PATTERN = /^(JOB|EXP)-(\d{6})-(\d{3})$/;

export interface ParsedJobNumber {
  domain: JobDomain;
  datePart: string;
  sequence: number;
}

export function parseJobNumber(jobNumber: string): ParsedJobNumber | null {
  const m = JOB_NUMBER_PATTERN.exec(jobNumber);
  if (!m) return null;
  return {
    domain: m[1] === 'JOB' ? 'IMPORT' : 'EXPORT',
    datePart: m[2]!,
    sequence: Number(m[3]),
  };
}

/** `2026-08-17` becomes `260817`. */
export function datePart(isoDate: string): string {
  return isoDate.slice(2, 10).replace(/-/g, '');
}

/**
 * §8.1. The next number for a domain on a given day.
 *
 * Derived from the numbers already issued rather than from a stored counter: a
 * counter and a set of records drift the moment one is restored without the
 * other, and the records are the thing that matters.
 */
export function nextJobNumber(
  existing: readonly string[],
  domain: JobDomain,
  isoDate: string,
): string {
  const day = datePart(isoDate);
  let highest = 0;
  for (const number of existing) {
    const parsed = parseJobNumber(number);
    if (!parsed) continue;
    if (parsed.domain !== domain || parsed.datePart !== day) continue;
    if (parsed.sequence > highest) highest = parsed.sequence;
  }
  return `${PREFIX[domain]}-${day}-${String(highest + 1).padStart(3, '0')}`;
}

/** §8.1. Immutable after creation: a change is never a legitimate operation. */
export function canChangeJobNumber(): { allowed: false; reason: string } {
  return { allowed: false, reason: '§8.1: a job number is immutable after creation' };
}

/**
 * §29.1. A container number must be unique across OPEN jobs, not globally.
 *
 * "The same physical box legitimately appears on many jobs over its life, and
 * a global uniqueness constraint would break on the second use."
 */
export interface ContainerUse {
  containerNumber: string;
  jobId: string;
  jobNumber: string;
  jobOpen: boolean;
}

export function checkContainerUniqueness(
  containerNumber: string,
  existing: readonly ContainerUse[],
  excludeJobId?: string,
): { unique: boolean; clash: ContainerUse | null; reason: string | null } {
  const clash = existing.find((u) =>
    u.containerNumber === containerNumber &&
    u.jobOpen &&
    u.jobId !== excludeJobId);

  if (!clash) return { unique: true, clash: null, reason: null };
  return {
    unique: false,
    clash,
    reason: `${containerNumber} is already active on open job ${clash.jobNumber}; confirm explicitly to proceed`,
  };
}

/** §29.1. Format `AAAA1234567`, uppercased and stripped of accidental spaces. */
export const CONTAINER_NUMBER_PATTERN = /^[A-Z]{4}[0-9]{7}$/;

export function normaliseContainerNumber(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '');
}

export function isContainerNumberValid(raw: string): boolean {
  return CONTAINER_NUMBER_PATTERN.test(normaliseContainerNumber(raw));
}
