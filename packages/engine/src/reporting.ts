/**
 * The month, the quarter, the year — as somebody has to present them.
 *
 * ## Two questions, not a dashboard
 *
 * A management meeting asks two things of an operation: how much went through,
 * and what is still sitting there. Everything else is a follow-up to one of
 * those. So this produces exactly those two and stops, rather than a wall of
 * figures nobody reads out.
 *
 * ## Why "still open" is not counted here from scratch
 *
 * Why a job is stuck is already decided, once, by the next-action rules. This
 * module is handed the answer and groups it. If it worked the reason out for
 * itself there would be two answers to "what is this job waiting for" — the
 * one on the job screen and the one in the report — and they would disagree in
 * front of the people least able to tell which was right.
 *
 * That is the whole reason the input type below carries `waitingOn` and
 * `blockingReason` rather than the raw job.
 *
 * ## Periods end at midnight, not at the moment you ask
 *
 * A month that has finished has a fixed answer. Running the September report
 * twice in October must give the same figures both times, or the number in
 * the deck stops matching the number on the screen and the meeting becomes
 * about the software.
 */

/** A job, reduced to what a report can ask about it. */
export interface ReportableJob {
  jobNumber: string;
  domain: 'IMPORT' | 'EXPORT';
  customer: string;
  /** yyyy-mm-dd. The day the job was opened. */
  openedOn: string;
  /** yyyy-mm-dd, or null while the job is still open. */
  closedOn: string | null;
  containerCount: number;
  /** Straight from the next-action rules. Never recomputed here. */
  waitingOn: 'US' | 'CUSTOMER' | 'CARRIER' | 'NOBODY';
  blockingReason: string | null;
}

export type PeriodKind = 'MONTH' | 'QUARTER' | 'YEAR';

export interface Period {
  kind: PeriodKind;
  /** First day, inclusive. yyyy-mm-dd. */
  from: string;
  /** Last day, inclusive — not the first of the next month. */
  to: string;
  /** What to print at the top of the page. */
  label: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const lastDay = (year: number, month: number): number =>
  [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The period containing a date.
 *
 * Anchored on a day rather than named directly, because every caller has a
 * date and none of them should be working out which quarter it falls in.
 */
export function periodFor(kind: PeriodKind, anchor: string): Period {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));

  if (kind === 'YEAR') {
    return { kind, from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) };
  }
  if (kind === 'QUARTER') {
    const quarter = Math.floor((month - 1) / 3) + 1;
    const first = (quarter - 1) * 3 + 1;
    const last = first + 2;
    return {
      kind,
      from: `${year}-${pad(first)}-01`,
      to: `${year}-${pad(last)}-${pad(lastDay(year, last))}`,
      label: `Q${quarter} ${year}`,
    };
  }
  return {
    kind,
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay(year, month))}`,
    label: `${MONTHS[month - 1]} ${year}`,
  };
}

/** The period before this one, for the comparison column. */
export function previousPeriod(period: Period): Period {
  const year = Number(period.from.slice(0, 4));
  const month = Number(period.from.slice(5, 7));
  if (period.kind === 'YEAR') return periodFor('YEAR', `${year - 1}-01-01`);
  if (period.kind === 'QUARTER') {
    return month === 1
      ? periodFor('QUARTER', `${year - 1}-10-01`)
      : periodFor('QUARTER', `${year}-${pad(month - 3)}-01`);
  }
  return month === 1
    ? periodFor('MONTH', `${year - 1}-12-01`)
    : periodFor('MONTH', `${year}-${pad(month - 1)}-01`);
}

const within = (day: string | null, period: Period): boolean =>
  day !== null && day >= period.from && day <= period.to;

export interface Volume {
  jobsOpened: number;
  jobsClosed: number;
  containers: number;
  imports: number;
  exports: number;
  /** Busiest first. Every customer with work in the period. */
  byCustomer: { customer: string; jobs: number; containers: number }[];
}

/**
 * How much went through, in a period.
 *
 * Containers are counted on the jobs opened, because that is the work taken
 * on. A job opened in August and closed in September is August's intake and
 * September's completion, and saying so is more useful than picking one.
 */
export function volumeIn(jobs: readonly ReportableJob[], period: Period): Volume {
  const opened = jobs.filter((j) => within(j.openedOn, period));

  const perCustomer = new Map<string, { customer: string; jobs: number; containers: number }>();
  for (const job of opened) {
    const row = perCustomer.get(job.customer)
      ?? { customer: job.customer, jobs: 0, containers: 0 };
    row.jobs += 1;
    row.containers += job.containerCount;
    perCustomer.set(job.customer, row);
  }

  return {
    jobsOpened: opened.length,
    jobsClosed: jobs.filter((j) => within(j.closedOn, period)).length,
    containers: opened.reduce((sum, j) => sum + j.containerCount, 0),
    imports: opened.filter((j) => j.domain === 'IMPORT').length,
    exports: opened.filter((j) => j.domain === 'EXPORT').length,
    byCustomer: [...perCustomer.values()]
      .sort((a, b) => b.jobs - a.jobs || a.customer.localeCompare(b.customer)),
  };
}

export interface OpenGroup {
  waitingOn: ReportableJob['waitingOn'];
  jobs: number;
  /** The reasons inside this group, commonest first. */
  reasons: { reason: string; jobs: number }[];
}

export interface StillOpen {
  /** The day this was asked as at. */
  on: string;
  total: number;
  groups: OpenGroup[];
}

/**
 * What was still open at the end of a period, and what each one was waiting
 * for — grouped by who has the ball.
 *
 * "Who" first, because that is the actionable split in a management meeting:
 * seven jobs waiting on us is a staffing conversation, seven waiting on the
 * carrier is not. The reason underneath is the detail somebody asks for next.
 *
 * A job with no reason recorded is grouped under one that says so, rather than
 * being dropped. Work nobody can explain is the most interesting line on the
 * page, and silently omitting it makes the totals lie.
 */
export function stillOpenAt(jobs: readonly ReportableJob[], on: string): StillOpen {
  // Open as at that day: started by then, and not closed on or before it.
  const open = jobs.filter((j) => j.openedOn <= on && (j.closedOn === null || j.closedOn > on));

  const groups = new Map<ReportableJob['waitingOn'], Map<string, number>>();
  for (const job of open) {
    const reasons = groups.get(job.waitingOn) ?? new Map<string, number>();
    const reason = job.blockingReason?.trim() || 'No reason recorded';
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    groups.set(job.waitingOn, reasons);
  }

  // US first: it is the only column the room can do anything about today.
  const order: ReportableJob['waitingOn'][] = ['US', 'CUSTOMER', 'CARRIER', 'NOBODY'];

  return {
    on,
    total: open.length,
    groups: order.filter((who) => groups.has(who)).map((who) => {
      const reasons = groups.get(who)!;
      return {
        waitingOn: who,
        jobs: [...reasons.values()].reduce((a, b) => a + b, 0),
        reasons: [...reasons.entries()]
          .map(([reason, count]) => ({ reason, jobs: count }))
          .sort((a, b) => b.jobs - a.jobs || a.reason.localeCompare(b.reason)),
      };
    }),
  };
}

/** How the report names each group, in the words a meeting uses. */
export const WAITING_ON_WORDS: Record<ReportableJob['waitingOn'], string> = {
  US: 'Waiting on us',
  CUSTOMER: 'Waiting on the customer',
  CARRIER: 'Waiting on the carrier',
  NOBODY: 'Not waiting on anyone',
};
