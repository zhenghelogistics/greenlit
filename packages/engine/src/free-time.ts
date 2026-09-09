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
  lastFreeDay: IsoDate | null;
}

export interface FreeTimeSource {
  freeTimeModel: FreeTimeModel;
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
  if (container.freeTimeModel === 'COMBINED') {
    return [{
      label: 'Combined D&D',
      freeDays: container.combinedFreeDays,
      lastFreeDay: container.combinedLfd,
    }];
  }
  if (container.freeTimeModel === 'SPLIT') {
    return [
      { label: 'Demurrage', freeDays: container.demurrageFreeDays, lastFreeDay: container.demurrageLfd },
      { label: 'Detention', freeDays: container.detentionFreeDays, lastFreeDay: container.detentionLfd },
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
  if (container.freeTimeModel === 'COMBINED') return container.combinedLfd;
  if (container.freeTimeModel === 'SPLIT') return container.demurrageLfd;
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
