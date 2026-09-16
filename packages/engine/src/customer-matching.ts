/**
 * §9. Which customer a document belongs to.
 *
 * Every arrival notice names a consignee, and that name is how a document
 * finds its company. Matching was written inline in the apply path, which was
 * fine while documents arrived one at a time — a batch of twenty needs the
 * same answer twenty times, and needs it before anything is applied so the
 * operator can see the whole set.
 */

export interface MatchableCustomer {
  code: string;
  companyName: string;
  shortName?: string | null;
  emailDomains?: readonly string[];
}

export interface CustomerMatch {
  customer: MatchableCustomer;
  /**
   * What matched. Shown to the operator, because "matched on email domain" and
   * "matched on company name" deserve different amounts of trust when twenty
   * documents are being confirmed at once.
   */
  matchedOn: 'name' | 'shortName' | 'emailDomain';
}

const fold = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The customer this document names, or null.
 *
 * Null is the ordinary case for a new customer, not a failure: a consignee the
 * system has never seen is a company that has not been set up yet, and the
 * caller offers to create it rather than refusing the document.
 *
 * Checked in order of how much the match is worth. A company name appearing in
 * the consignee block is the strongest signal; an email domain is the weakest,
 * because two companies can share a parent's domain.
 */
export function matchCustomer(
  named: string,
  customers: readonly MatchableCustomer[],
): CustomerMatch | null {
  const haystack = fold(named);
  if (!haystack) return null;

  for (const customer of customers) {
    if (haystack.includes(fold(customer.companyName))) {
      return { customer, matchedOn: 'name' };
    }
  }
  for (const customer of customers) {
    if (customer.shortName && haystack.includes(fold(customer.shortName))) {
      return { customer, matchedOn: 'shortName' };
    }
  }
  for (const customer of customers) {
    const domains = customer.emailDomains ?? [];
    for (const domain of domains) {
      // The name part of the domain, so "@dksh.com" matches a consignee
      // written "DKSH SINGAPORE PTE LTD".
      const stem = fold(String(domain).replace(/^@/, '').split('.')[0] ?? '');
      if (stem && haystack.includes(stem)) {
        return { customer, matchedOn: 'emailDomain' };
      }
    }
  }
  return null;
}

/**
 * How a batch of documents divides between companies.
 *
 * The answer an operator wants before applying twenty notices: which companies
 * these belong to, how many each, and which ones have no company yet. Grouped
 * rather than listed, because twenty rows read as twenty problems and four
 * groups read as an afternoon's work.
 */
export interface BatchGrouping<T> {
  matched: Array<{ customer: MatchableCustomer; matchedOn: CustomerMatch['matchedOn']; documents: T[] }>;
  /** Documents naming a consignee no customer matches, grouped by that name. */
  unmatched: Array<{ named: string; documents: T[] }>;
  /** Documents naming nobody. These cannot be applied without a decision. */
  unnamed: T[];
}

export function groupByCustomer<T>(
  documents: readonly T[],
  consigneeOf: (document: T) => string,
  customers: readonly MatchableCustomer[],
): BatchGrouping<T> {
  const matched = new Map<string, BatchGrouping<T>['matched'][number]>();
  const unmatched = new Map<string, T[]>();
  const unnamed: T[] = [];

  for (const document of documents) {
    const named = consigneeOf(document).trim();
    if (!named) { unnamed.push(document); continue; }

    const hit = matchCustomer(named, customers);
    if (!hit) {
      const key = fold(named);
      if (!unmatched.has(key)) unmatched.set(key, []);
      unmatched.get(key)!.push(document);
      continue;
    }

    const existing = matched.get(hit.customer.code);
    if (existing) existing.documents.push(document);
    else {
      matched.set(hit.customer.code, {
        customer: hit.customer, matchedOn: hit.matchedOn, documents: [document],
      });
    }
  }

  return {
    matched: [...matched.values()],
    unmatched: [...unmatched.entries()].map(([, docs]) => ({
      named: consigneeOf(docs[0]!).trim(),
      documents: docs,
    })),
    unnamed,
  };
}
