/**
 * §34. What a container's free time actually is.
 *
 * Carriers issue allowances in two shapes. A split carrier gives demurrage
 * (port to gate-out) and detention (gate-out to empty return) as two clocks
 * with two last free dates. A combined carrier gives one pool covering
 * discharge to empty return, drawn down by both.
 *
 * §34.3 is emphatic about why this cannot be papered over: "For a
 * combined-model carrier the system must not display two separate countdowns.
 * Splitting a single allowance in two invents a deadline that does not exist
 * and hides the one that does."
 *
 * All six values are stored, because a carrier's rule can be restated and
 * nothing should be discarded. This module is the single place that decides
 * which of them are true for a given container, so that no caller has to
 * remember — the previous approach, `demurrageLfd ?? combinedLfd`, silently
 * preferred a stale split value over the combined one that applied.
 */
import type { FreeTimeModel } from './enums.ts';
import type { IsoDate } from './types.ts';

export interface FreeTimeClock {
  /** 'Demurrage', 'Detention' or 'Combined D&D' — what a person should read. */
  label: string;
  freeDays: number | null;
  /** What applies: the controller's date where there is one, else the count. */
  lastFreeDay: IsoDate | null;
  /** §34.1. ETA plus the allowance, ETA counted as day one. */
  countedLastFreeDay: IsoDate | null;
  /**
   * A date the controller set by hand, which outranks the count.
   *
   * Carriers grant extensions and make exceptions, and when one has been
   * agreed the agreement is the deadline. Recording it as an override rather
   * than editing the count keeps both visible: what the terms give, and what
   * was actually agreed.
   */
  overriddenLastFreeDay: IsoDate | null;
}

/**
 * §34.1. The last free day, counted from the vessel's ETA.
 *
 * The ETA is day one. Seven free days therefore end six days after arrival,
 * not seven — a distinction worth a day of demurrage on every container, in
 * the carrier's favour, every time it is got wrong. The operations demo the
 * PM built states the same rule in the same words, which is the third
 * independent statement of it; §34.1 is the first.
 *
 * Returns null rather than guessing: no ETA and no allowance means no
 * deadline, and a computed date would be a fabricated one.
 */
export function lastFreeDayFrom(eta: IsoDate | null, freeDays: number | null): IsoDate | null {
  if (!eta || freeDays === null || !Number.isInteger(freeDays) || freeDays <= 0) return null;

  // Both shapes, because both reach this. The database stores ISO and the
  // screens carry DD/MM/YYYY, and a version of this that took only ISO
  // returned null for a display date — no deadline at all, silently, which is
  // a worse failure than a wrong one because nothing looks broken. The
  // operations demo normalises the same two and it is right to.
  //
  // Singapore writes day first, so 09/10 is the ninth of October. There is no
  // ambiguity to guess at.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(eta);
  const display = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(eta);
  const parts = iso ? iso : display ? [display[0], display[3], display[2], display[1]] : null;
  if (!parts) return null;
  const counted = new Date(Date.UTC(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]) + freeDays - 1,
  ));
  if (Number.isNaN(counted.getTime())) return null;
  return counted.toISOString().slice(0, 10) as IsoDate;
}

export interface FreeTimeSource {
  freeTimeModel: FreeTimeModel;
  /**
   * The vessel's arrival, from which every allowance is counted.
   *
   * Optional because a container can be on file before its ETA is known. The
   * clocks then report what they have rather than inventing a date.
   */
  eta?: IsoDate | null;
  demurrageFreeDays: number | null;
  demurrageLfd: IsoDate | null;
  detentionFreeDays: number | null;
  detentionLfd: IsoDate | null;
  combinedFreeDays: number | null;
  combinedLfd: IsoDate | null;
}

/**
 * The clocks that apply, in the order they should be shown.
 *
 * A combined container yields one clock even if split values are also stored;
 * a split container yields two even if a combined value is stored. An
 * unconfirmed container yields none, because showing a countdown derived from
 * an unverified rule is worse than showing that it is unverified.
 */
export function freeTimeClocks(container: FreeTimeSource): FreeTimeClock[] {
  // §34.1. The date is counted, not typed. A stored date is read as the
  // controller's override, which is what a stored date has always meant:
  // somebody decided this deadline by hand and it beats the arithmetic.
  const clock = (label: string, freeDays: number | null, stored: IsoDate | null): FreeTimeClock => {
    const counted = lastFreeDayFrom(container.eta ?? null, freeDays);
    return {
      label,
      freeDays,
      countedLastFreeDay: counted,
      overriddenLastFreeDay: stored,
      lastFreeDay: stored ?? counted,
    };
  };

  if (container.freeTimeModel === 'COMBINED') {
    return [clock('Combined D&D', container.combinedFreeDays, container.combinedLfd)];
  }
  if (container.freeTimeModel === 'SPLIT') {
    return [
      clock('Demurrage', container.demurrageFreeDays, container.demurrageLfd),
      clock('Detention', container.detentionFreeDays, container.detentionLfd),
    ];
  }
  return [];
}

/**
 * The carrier deadline that decides whether money is owed.
 *
 * For a split carrier that is demurrage while the container is still at the
 * port; detention is a later clock against a different event and is not a
 * substitute for it.
 */
export function carrierLastFreeDay(container: FreeTimeSource): IsoDate | null {
  const clocks = freeTimeClocks(container);
  if (container.freeTimeModel === 'COMBINED') return clocks[0]?.lastFreeDay ?? null;
  if (container.freeTimeModel === 'SPLIT') {
    return clocks.find((c) => c.label === 'Demurrage')?.lastFreeDay ?? null;
  }
  return null;
}

/**
 * Values stored that the container's own model says do not apply.
 *
 * Not an error: a carrier that restates its terms leaves the old figures
 * behind, and keeping them is deliberate. It is worth surfacing, because a
 * combined container carrying split figures is usually a stale carrier rule
 * rather than a genuine change — which is the *Free time basis mismatch*
 * §34.3 describes.
 */
export function contradictoryFreeTime(container: FreeTimeSource): string[] {
  const set = (...values: Array<number | string | null>) => values.some((v) => v !== null);

  if (container.freeTimeModel === 'COMBINED'
    && set(container.demurrageFreeDays, container.demurrageLfd,
           container.detentionFreeDays, container.detentionLfd)) {
    return ['Carrier issues a combined allowance, but split demurrage or detention figures are also stored'];
  }
  if (container.freeTimeModel === 'SPLIT'
    && set(container.combinedFreeDays, container.combinedLfd)) {
    return ['Carrier issues split allowances, but a combined figure is also stored'];
  }
  return [];
}


/** §34.4. Where a clock stands today. */
export type FreeTimeStanding =
  | 'OK' | 'DUE_SOON' | 'LAST_DAY' | 'OVERDUE' | 'UNKNOWN'
  /** I-25. The empty is back: this clock is finished and cost nothing. */
  | 'SETTLED';

/**
 * Clocks that stop when the empty container goes back.
 *
 * Detention is the carrier's equipment being held, so returning it ends the
 * count. A combined allowance runs to empty return too. Demurrage does not
 * appear here: it ends at gate-out, long before the empty is returned.
 */
const STOPPED_BY_EMPTY_RETURN = new Set(['Detention', 'Combined D&D']);

export interface FreeTimeCountdown extends FreeTimeClock {
  /** Negative once the last free day has passed. Null when there is no date. */
  daysRemaining: number | null;
  standing: FreeTimeStanding;
  /** §34.2. Days already chargeable — zero until the last free day passes. */
  chargeableDays: number;
  /** Plain words for the row. "3 days left", "2 days over". */
  summary: string;
}

const dayDifference = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * §34.4. `days_remaining = last_free_date - current_date`, per clock.
 *
 * Counted against the container's own last free day and never a job-level
 * date: containers on one job are discharged and returned separately, so a
 * single job-level countdown would be wrong for all but one of them.
 *
 * A clock with no last free day reports UNKNOWN rather than a number. It is
 * the honest answer — nobody has recorded the carrier's terms — and it is
 * distinguishable from "today", which a zero would not be.
 */
export function freeTimeCountdown(
  container: FreeTimeSource,
  today: IsoDate,
  criticalDays: number,
  /**
   * I-25. When the empty went back, if it has.
   *
   * Detention is the carrier's equipment being held, so returning it stops the
   * clock — and a container returned on time must not keep counting towards a
   * charge that can no longer be incurred. Under a combined allowance the
   * whole pool runs to empty return, so the same date closes it.
   */
  emptyReturnedOn: IsoDate | null = null,
): FreeTimeCountdown[] {
  return freeTimeClocks(container).map((clock) => {
    if (!clock.lastFreeDay) {
      return {
        ...clock,
        daysRemaining: null,
        standing: 'UNKNOWN' as const,
        chargeableDays: 0,
        summary: clock.freeDays === null
          ? 'No free time recorded'
          : `${clock.freeDays} days, but no last free day recorded`,
      };
    }

    // I-25. Once the empty is back the clock is settled: it is counted to the
    // day it stopped, not to today, so a container returned inside its free
    // time stays inside it however long the job stays open afterwards.
    const stopsOn = STOPPED_BY_EMPTY_RETURN.has(clock.label) ? emptyReturnedOn : null;
    const countTo = stopsOn ?? today;

    const daysRemaining = dayDifference(countTo, clock.lastFreeDay);
    const overdueBy = Math.max(0, -daysRemaining);

    if (stopsOn) {
      return {
        ...clock,
        daysRemaining,
        standing: (overdueBy > 0 ? 'OVERDUE' : 'SETTLED') as FreeTimeStanding,
        chargeableDays: overdueBy,
        summary: overdueBy > 0
          ? `Returned ${overdueBy} day${overdueBy === 1 ? '' : 's'} late — ${overdueBy} chargeable`
          : 'Returned within free time',
      };
    }

    const standing: FreeTimeStanding =
      daysRemaining < 0 ? 'OVERDUE'
        : daysRemaining === 0 ? 'LAST_DAY'
          : daysRemaining <= criticalDays ? 'DUE_SOON'
            : 'OK';

    const summary =
      standing === 'OVERDUE' ? `${overdueBy} day${overdueBy === 1 ? '' : 's'} over — charges running`
        : standing === 'LAST_DAY' ? 'Last free day is today'
          : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`;

    return { ...clock, daysRemaining, standing, chargeableDays: overdueBy, summary };
  });
}

/**
 * The clock a controller should be told about first.
 *
 * The one nearest its deadline, and an overdue clock before any that is not.
 * A container under the split model has two, and showing both without saying
 * which is urgent leaves the reader to work it out — which is the work the
 * board exists to do for them.
 */
export function mostUrgentClock(countdowns: readonly FreeTimeCountdown[]): FreeTimeCountdown | null {
  const dated = countdowns.filter((c) => c.daysRemaining !== null);
  if (dated.length === 0) return countdowns[0] ?? null;
  return dated.reduce((worst, clock) =>
    (clock.daysRemaining! < worst.daysRemaining! ? clock : worst));
}

/**
 * §34.0. The third number: what the days already counted are likely to cost.
 *
 * The internal count is the operational alert and the carrier count is the
 * money, but a controller reading "3 days over" cannot tell whether that is a
 * nuisance or four figures. §34.0 defines the estimate as the carrier count
 * multiplied by their rate, and this is the only place that multiplication
 * happens.
 *
 * Two things it deliberately does not do. It never invents a rate: §34.2 says
 * "the MVP may leave rates blank where commercial rates are unavailable", and
 * a number with a currency symbol in front of it is read as a fact even when
 * it was a guess. And it never suppresses the day count when the rate is
 * missing — the days are known, they are the part that is actionable today,
 * and withholding them because the commercial team has not filed a tariff
 * would hide the only half that is certain.
 *
 * It is an estimate and says so. The carrier's invoice is the carrier's
 * arithmetic, applied to the carrier's own record of the dates.
 */
export interface ChargeEstimate {
  /**
   * Days past the last free day, summed across the clocks that apply.
   *
   * Under a split allowance demurrage and detention are both chargeable and
   * both count. Under a combined allowance there is one pool and one figure.
   * `freeTimeCountdown` has already decided which clocks exist, so this adds
   * up what it produced rather than re-reading the model.
   */
  chargeableDays: number;
  dailyRate: number | null;
  currency: string | null;
  /** Null when no rate is on file. Never zero standing in for unknown. */
  amount: number | null;
  /** The sentence a screen shows. Says "estimated", because it is. */
  summary: string;
}

export interface ChargeRate {
  /** Per chargeable day, in `currency`. Null until commercial terms are filed. */
  dailyRate: number | null;
  currency: string | null;
}

export function chargeEstimate(
  countdowns: readonly FreeTimeCountdown[],
  rate: ChargeRate,
): ChargeEstimate {
  const chargeableDays = countdowns.reduce((total, clock) => total + clock.chargeableDays, 0);
  const days = `${chargeableDays} chargeable day${chargeableDays === 1 ? '' : 's'}`;

  // No rate: the days still stand, and the sentence says plainly why there is
  // no figure beside them rather than leaving a blank someone reads as zero.
  if (rate.dailyRate === null || rate.currency === null) {
    return {
      chargeableDays,
      dailyRate: rate.dailyRate,
      currency: rate.currency,
      amount: null,
      summary: chargeableDays === 0
        ? 'No charge — still inside carrier free time'
        : `${days}, no rate on file`,
    };
  }

  // Money, so rounded to the cent at the point it becomes money. Left as a
  // float it is 0.1 + 0.2 territory, and a charge estimate that renders as
  // 1050.0000000000002 is one nobody quotes to a customer.
  const amount = Math.round(chargeableDays * rate.dailyRate * 100) / 100;

  return {
    chargeableDays,
    dailyRate: rate.dailyRate,
    currency: rate.currency,
    amount,
    summary: chargeableDays === 0
      ? 'No charge — still inside carrier free time'
      : `${days} at ${rate.currency} ${rate.dailyRate.toFixed(2)} — estimated ${rate.currency} ${amount.toFixed(2)}`,
  };
}


/**
 * How a carrier's allowance is classed, and why anybody cares.
 *
 * Ten days is the line. Under it the container has to move almost at once and
 * the job is planned around the deadline; over it there is room to sequence
 * the collection with everything else, and the deadline stops being the thing
 * that decides the week.
 *
 * Exactly ten is called out separately rather than folded into one side. It is
 * the commonest allowance there is, so a carrier restating its terms from nine
 * to ten changes how a job is planned, and a label that said "long" for both
 * ten and thirty would hide that.
 */
export type FreeTimeTerm = 'SHORT' | 'THRESHOLD' | 'LONG' | 'UNKNOWN';

export function freeTimeTerm(freeDays: number | null): FreeTimeTerm {
  if (freeDays === null || !Number.isFinite(freeDays) || freeDays <= 0) return 'UNKNOWN';
  if (freeDays < 10) return 'SHORT';
  if (freeDays > 10) return 'LONG';
  return 'THRESHOLD';
}

export const TERM_LABEL: Record<FreeTimeTerm, string> = {
  SHORT: 'Short term',
  THRESHOLD: 'Ten days',
  LONG: 'Long term',
  UNKNOWN: 'Not recorded',
};
