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
