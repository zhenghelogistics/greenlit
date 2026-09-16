/**
 * §21.3.2. Which trucks are not available for other work.
 *
 * The distinction §21.3 draws is the reason this exists separately from
 * chassis occupancy: "A chassis under a container at a customer for six days
 * costs us one chassis. A truck and driver held for six hours costs us a
 * truck, a driver, and every other job that vehicle could have run that day."
 *
 * The rule is stated plainly and is the whole of this module: "The transport
 * schedule must treat an ON_STANDBY movement as occupying its truck for the
 * whole period, exactly as it treats IN_TRANSIT. Otherwise the vehicle appears
 * free and is double-booked."
 *
 * Nothing here is stored. §21.3.1 is explicit that `standby_minutes` is
 * derived: "A standby duration a controller can type is one that will be
 * rounded, forgotten, or reconstructed from memory the following day."
 */
import type { IsoInstant, Movement } from './types.ts';

/** Why a vehicle is engaged. Both block it; they differ in what they cost. */
export type EngagementReason = 'IN_TRANSIT' | 'ON_STANDBY';

export interface VehicleEngagement {
  truck: string;
  driver: string | null;
  movementRef: string;
  jobId: string;
  reason: EngagementReason;
  /** When the vehicle became unavailable. */
  from: IsoInstant;
  /**
   * When it becomes available again, where that is known.
   *
   * Null while the engagement is still running. §21.3.2 is deliberate about
   * this: where the expected duration is unknown "the truck's remaining
   * capacity that day is genuinely unknown until the driver is let go. The
   * schedule shows that as open-ended rather than guessing a figure."
   */
  until: IsoInstant | null;
  /** Counted to release, or to now while it runs. Never typed. */
  minutes: number;
  /** True while nobody can say when this vehicle comes free. */
  openEnded: boolean;
}

const MINUTE = 60_000;

const minutesBetween = (from: string, to: string): number =>
  Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / MINUTE));

/**
 * §21.3.1. How long a standby has run.
 *
 * To the release where there is one, and to now while the driver is still
 * being held — a standby that is still running has a duration, and reporting
 * zero until somebody remembers to close it is how the cost stays invisible.
 *
 * Null when standby never started, which is not the same as zero minutes.
 */
export function standbyMinutes(movement: Movement, now: IsoInstant): number | null {
  if (!movement.standbyStartedAt) return null;
  return minutesBetween(movement.standbyStartedAt, movement.standbyEndedAt ?? now);
}

/**
 * Every vehicle engagement currently blocking a truck.
 *
 * A movement with no truck assigned engages nothing — it is work that has not
 * been given to anybody yet, and treating it as occupancy would block a
 * vehicle that was never chosen.
 */
export function vehicleOccupancy(
  movements: readonly Movement[],
  now: IsoInstant,
): VehicleEngagement[] {
  const engagements: VehicleEngagement[] = [];

  for (const m of movements) {
    if (!m.truck) continue;

    if (m.movementStatus === 'ON_STANDBY') {
      // Normally set on arrival. Falling back to the delivery time matters:
      // standby begins when the truck arrives, and a missing stamp would
      // otherwise drop the engagement entirely and show the vehicle as free.
      const from = m.standbyStartedAt ?? m.actualDeliveryAt;
      if (!from) continue;
      const until = m.standbyEndedAt;
      engagements.push({
        truck: m.truck, driver: m.driver, movementRef: m.movementRef, jobId: m.jobId,
        reason: 'ON_STANDBY',
        from,
        until,
        minutes: minutesBetween(from, until ?? now),
        openEnded: until === null,
      });
      continue;
    }

    if (m.movementStatus === 'IN_TRANSIT' || m.movementStatus === 'COLLECTED') {
      const from = m.actualCollectionAt;
      if (!from) continue;
      const until = m.actualDeliveryAt;
      engagements.push({
        truck: m.truck, driver: m.driver, movementRef: m.movementRef, jobId: m.jobId,
        reason: 'IN_TRANSIT',
        from,
        until,
        minutes: minutesBetween(from, until ?? now),
        openEnded: until === null,
      });
    }
  }

  return engagements.sort((a, b) => a.from.localeCompare(b.from));
}

/** One truck, engaged more than once at the same moment. */
export interface DoubleBooking {
  truck: string;
  first: VehicleEngagement;
  second: VehicleEngagement;
  reason: string;
}

/**
 * §21.3.2. "Otherwise the vehicle appears free and is double-booked."
 *
 * The failure this module exists to make visible. Two engagements overlap when
 * one begins before the other ends — and an open-ended engagement has no end,
 * so everything assigned to that truck afterwards overlaps it. That is the
 * honest reading: until the driver is released, nobody can say the vehicle was
 * free for the second job.
 */
export function doubleBookings(engagements: readonly VehicleEngagement[]): DoubleBooking[] {
  const byTruck = new Map<string, VehicleEngagement[]>();
  for (const e of engagements) {
    if (!byTruck.has(e.truck)) byTruck.set(e.truck, []);
    byTruck.get(e.truck)!.push(e);
  }

  const clashes: DoubleBooking[] = [];
  for (const [truck, list] of byTruck) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const first = list[i]!;
        const second = list[j]!;
        // Sorted by start, so `first` begins no later than `second`.
        const overlaps = first.until === null || first.until > second.from;
        if (!overlaps) continue;
        clashes.push({
          truck, first, second,
          reason: first.openEnded
            ? `${truck} is still ${first.reason === 'ON_STANDBY' ? 'on standby' : 'in transit'} on ${first.movementRef} with no release recorded`
            : `${truck} is engaged on ${first.movementRef} until ${first.until}`,
        });
      }
    }
  }
  return clashes;
}

/**
 * §21.3.3. Standby sorts above ordinary customer waits.
 *
 * "We are waiting on the customer, but unlike every other customer wait in the
 * system, our own vehicle is burning while we wait." The queue orders by the
 * rate at which inaction costs money, and standby is the only wait that
 * accrues by the minute.
 */
export function standbyOutranksOtherCustomerWaits(
  engagements: readonly VehicleEngagement[],
): boolean {
  return engagements.some((e) => e.reason === 'ON_STANDBY' && e.until === null);
}
