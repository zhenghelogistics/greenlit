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
  /**
   * Whether this customer's jobs normally need a Customs permit.
   *
   * A default for a new job rather than a rule about one: a customer who never
   * needs a permit occasionally ships something that does, and the job is
   * where that is known. Recorded here so nobody has to remember which
   * customers are which.
   */
  requiresPermit: boolean;
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

/**
 * Whether a customer can be struck off the master outright.
 *
 * A customer with no jobs is a typo, a duplicate, or somebody who was entered
 * and never traded with. Nothing refers to them, so removing them costs
 * nothing and leaving them makes every picker longer.
 *
 * A customer with jobs is a different thing entirely. ADR-0007 builds every
 * job reference out of the code — CC-001 means Chong Cheong and means nothing
 * else — so deleting the customer turns every number already printed, invoiced
 * and filed into a reference to a company that is not there. The history stops
 * being readable, and it is the history that gets asked about months later.
 *
 * So the answer is no, with the thing to do instead. Closing the account takes
 * them out of the pickers, which is what somebody usually wants when they say
 * delete, and leaves CC-001 meaning what it meant.
 */
export function canDeleteCustomer(
  jobCount: number,
): { allowed: true } | { allowed: false; reason: string } {
  if (jobCount > 0) {
    return {
      allowed: false,
      reason: `This customer has ${jobCount} job${jobCount === 1 ? '' : 's'}. `
        + 'Deleting it would leave those job numbers pointing at a company that is '
        + 'no longer on the system. Set the account status to CLOSED instead: it '
        + 'comes off the lists and the jobs stay readable.',
    };
  }
  return { allowed: true };
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


/**
 * A customer name already on file.
 *
 * The code is unique in the schema and the name is not, which is right — two
 * genuine companies can share a trading name. But the usual cause of a
 * duplicate is somebody creating a customer that already exists under a
 * slightly different spelling, and the cost is larger here than it looks.
 *
 * This is a retainer business, not a series of one-off sales. The customer is
 * the organising unit (ADR-0007): the saved locations, the standing
 * instructions, the permit preference and the whole history of what has been
 * agreed hang off one record. Split that in two and the second copy starts
 * empty — no addresses, no instructions — so the next person creating a job
 * picks whichever came up first and types the delivery address in by hand.
 * Neither record then shows the relationship, and the one thing the business
 * runs on is the relationship.
 *
 * Compared ignoring case and surrounding space, because "DKSH Singapore" and
 * "dksh singapore " are the same company to everybody except a string
 * comparison. Returns null when the name is new, or when it is the record's
 * own name being saved again.
 */
export function duplicateCustomerName(
  name: string,
  existing: readonly { code: string; companyName: string }[],
  ownCode?: string,
): string | null {
  const key = (value: string) => value.trim().toUpperCase().replace(/\s+/g, ' ');
  const wanted = key(name);
  if (!wanted) return null;

  const clash = existing.find((c) => c.code !== ownCode && key(c.companyName) === wanted);
  return clash
    ? `${clash.companyName} already exists as ${clash.code}. `
      + 'Use that customer, or give this one a name that tells them apart.'
    : null;
}
