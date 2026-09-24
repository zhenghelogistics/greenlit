/**
 * Dates that are possible but almost certainly wrong.
 *
 * Every rule here warns and none of them blocks, which is the principle the
 * operations demo runs on throughout and worth stating once: a container
 * number of the wrong shape, a permit whose number changed, a delivery booked
 * before the ship arrives. Operations can always proceed. The system's job is
 * to make sure nobody finds out at the counter.
 *
 * The reason blocking is wrong here is that all of these are sometimes right.
 * A vessel arrives early. A customer genuinely wants a same-day delivery off a
 * ship that berths at six. Refusing the save would mean the real answer could
 * not be recorded at all, and the workaround — somebody typing a date they
 * know to be false so the form will accept it — is worse than the warning.
 */
import type { IsoDate } from './types.ts';

export interface Warning {
  field: string;
  /** What is odd, in the words somebody would use to a colleague. */
  says: string;
}

const dayOf = (value: string | null): string | null =>
  value ? value.slice(0, 10) : null;

/**
 * A delivery booked before the vessel arrives.
 *
 * The same day is fine and common: a box discharged in the morning goes out in
 * the afternoon. Earlier than the arrival is the one that cannot happen, and
 * it is almost always a month typed as the wrong month.
 */
export function deliveryDateWarning(
  eta: IsoDate | null,
  deliveryDate: IsoDate | null,
): Warning | null {
  const arrives = dayOf(eta);
  const delivers = dayOf(deliveryDate);
  if (!arrives || !delivers || delivers >= arrives) return null;
  return {
    field: 'Delivery date',
    says: `Delivery is set for ${delivers}, before the vessel arrives on ${arrives}.`,
  };
}

/**
 * §47. An export job whose CMS is outstanding with the empty due.
 *
 * Counted against the empty collection date and never the vessel. The empty is
 * usually wanted weeks before the ship sails, so a job measured against the
 * sailing looks comfortable right up to the morning the truck cannot go.
 */
export function cmsWarning(
  cmsStatus: string | null,
  emptyCollectionDate: IsoDate | null,
  today: IsoDate,
  withinDays = 3,
): Warning | null {
  const done = cmsStatus === 'COMPLETED' || cmsStatus === 'NOT_REQUIRED';
  const due = dayOf(emptyCollectionDate);
  if (done || !due) return null;

  const daysAway = Math.round(
    (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (daysAway > withinDays) return null;

  return {
    field: 'CMS',
    says: daysAway < 0
      ? `CMS is still outstanding and the empty was due ${Math.abs(daysAway)} day${Math.abs(daysAway) === 1 ? '' : 's'} ago.`
      : daysAway === 0
        ? 'CMS is still outstanding and the empty is due today.'
        : `CMS is still outstanding and the empty is due in ${daysAway} day${daysAway === 1 ? '' : 's'}.`,
  };
}
