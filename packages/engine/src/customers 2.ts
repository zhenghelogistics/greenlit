import type { JobDomain } from './enums.ts';

/**
 * Customers, and job references scoped to them.
 *
 * DEPARTURE FROM §8.1, recorded in ADR-0007. §8.1 specifies JOB-YYMMDD-XXX
 * with a global daily sequence, which suits transactional work. Zhenghe serves
 * retainer customers, so the operation is organised by company: you open a
 * company and see its jobs, numbered within it.
 *
 * What §8.1 actually guarantees is preserved — system-generated, unique,
 * immutable — and what changes is the shape and the scope of the sequence.
 */

export interface Customer {
  customerId: string;
  /** 2–6 letters, chosen by a person, unique, and immutable once issued. */
  code: string;
  companyName: string;
  shortName: string | null;
  billingName: string | null;
  defaultConsignee: string | null;
  defaultDeliveryAddress: string | null;
  defaultContact: string | null;
  /** §9. Assists automated customer detection during matching (§11.2). */
  emailDomains: string[];
  accountStatus: 'ACTIVE' | 'ON_HOLD' | 'CLOSED';
  notes: string | null;
  createdAt: string;
}

export const CUSTOMER_CODE_PATTERN = /^[A-Z]{2,6}$/;

/**
 * Trim and uppercase only. Deliberately does NOT strip invalid characters:
 * silently turning "AB1" into "AB" would issue a code the operator did not
 * choose, onto paperwork they cannot later change.
 */
export function normaliseCustomerCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export interface CodeValidation {
  valid: boolean;
  code: string;
  reason: string | null;
}

/**
 * A code ends up on paperwork and in every job reference, so it is chosen by a
 * person and then locked. Validation is strict for the same reason: a code
 * that changes later would orphan every reference already issued.
 */
export function validateCustomerCode(
  raw: string,
  existing: readonly Customer[],
): CodeValidation {
  const code = normaliseCustomerCode(raw);
  if (!code) return { valid: false, code, reason: 'A customer code is required' };
  if (!CUSTOMER_CODE_PATTERN.test(code)) {
    return { valid: false, code, reason: 'A customer code is two to six letters, A–Z' };
  }
  const clash = existing.find((c) => c.code === code);
  if (clash) {
    return { valid: false, code, reason: `${code} is already used by ${clash.companyName}` };
  }
  return { valid: true, code, reason: null };
}

/** A code is immutable once issued: changing it would orphan every reference. */
export function canChangeCustomerCode(): { allowed: false; reason: string } {
  return {
    allowed: false,
    reason: 'A customer code is immutable once issued; job references already use it',
  };
}

export interface CustomerDraft {
  code: string;
  companyName: string;
  shortName?: string | null;
  emailDomains?: readonly string[];
}

export interface CustomerValidation {
  valid: boolean;
  reasons: string[];
}

export function validateCustomerDraft(
  draft: CustomerDraft,
  existing: readonly Customer[],
): CustomerValidation {
  const reasons: string[] = [];
  const code = validateCustomerCode(draft.code, existing);
  if (!code.valid && code.reason) reasons.push(code.reason);

  if (!draft.companyName?.trim()) reasons.push('A company name is required');
  else if (existing.some((c) => c.companyName.trim().toLowerCase() === draft.companyName.trim().toLowerCase())) {
    // §9: "Users must not be able to repeatedly enter slightly different names
    // by hand." An exact repeat is almost always a duplicate record.
    reasons.push(`${draft.companyName} already exists`);
  }

  for (const domain of draft.emailDomains ?? []) {
    if (!/^@?[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      reasons.push(`${domain} is not a valid email domain`);
    }
  }
  return { valid: reasons.length === 0, reasons };
}

export const JOB_REFERENCE_PATTERN = /^([A-Z]{2,6})-(\d{3,})$/;

export interface ParsedJobReference {
  customerCode: string;
  sequence: number;
}

export function parseJobReference(reference: string): ParsedJobReference | null {
  const m = JOB_REFERENCE_PATTERN.exec(reference);
  if (!m) return null;
  return { customerCode: m[1]!, sequence: Number(m[2]) };
}

/**
 * The next reference for a customer.
 *
 * One running sequence per customer, covering BOTH domains, because the
 * operation is organised by company rather than by trade direction — opening a
 * company should show its jobs in the order they happened, not two interleaved
 * sequences. Domain stays a property of the job, shown beside the reference.
 *
 * Derived from the references already issued rather than a stored counter,
 * which would drift the moment one was restored without the other.
 */
export function nextJobReference(
  existingReferences: readonly string[],
  customerCode: string,
): string {
  const code = normaliseCustomerCode(customerCode);
  let highest = 0;
  for (const reference of existingReferences) {
    const parsed = parseJobReference(reference);
    if (!parsed || parsed.customerCode !== code) continue;
    if (parsed.sequence > highest) highest = parsed.sequence;
  }
  return `${code}-${String(highest + 1).padStart(3, '0')}`;
}

/** A job as it appears in a company's list. */
export interface CustomerJobSummary {
  jobReference: string;
  domain: JobDomain;
  createdDate: string;
  status: string;
}

/** Newest first: a company page is read from the top. */
export function sortCustomerJobs(jobs: readonly CustomerJobSummary[]): CustomerJobSummary[] {
  return [...jobs].sort((a, b) => {
    const byDate = b.createdDate.localeCompare(a.createdDate);
    if (byDate !== 0) return byDate;
    return (parseJobReference(b.jobReference)?.sequence ?? 0)
      - (parseJobReference(a.jobReference)?.sequence ?? 0);
  });
}
