/**
 * What a yard charges, and when it started charging it.
 *
 * ## Why a rate is never a single number
 *
 * A rate changes. A yard raises its depot handling charge in June and the
 * figure that was right in May is still the right figure *for May* — an
 * invoice raised then was correct, and a question asked in October about a
 * container returned in April needs April's number, not today's.
 *
 * So a rate is not a value that gets overwritten. It is a series of values,
 * each with the date it took effect, and "the rate" is a question that has to
 * be asked as at a date. Overwriting would answer today's question and destroy
 * every other one, quietly, at the moment somebody changes a price.
 *
 * ## Why each charge is versioned separately
 *
 * The rate book dates its three columns independently — Allied's depot handling
 * charge was last touched in June and its CDMS fee in May — because a yard
 * raises one charge without touching the others. One row per charge per date
 * says exactly that, and a row per yard per date would force a fiction about
 * the two that did not move.
 *
 * ## What is not here
 *
 * Any arithmetic that turns these into money owed. That is billing, and this
 * application does not do billing. These are the figures operations look up,
 * kept where they can be corrected.
 */

/** The charges a yard levies. Each is versioned on its own. */
export type YardCharge =
  /** Depot handling charge. The headline figure. */
  | 'DHC'
  /** The yard's fee for handling the CDMS declaration. */
  | 'CDMS_ADMIN_FEE'
  /** Levied on top, per container. */
  | 'DEPOT_SURCHARGE';

export const YARD_CHARGES: readonly YardCharge[] = ['DHC', 'CDMS_ADMIN_FEE', 'DEPOT_SURCHARGE'];

/** What to call a charge on screen, in the words the rate book uses. */
export const YARD_CHARGE_WORDS: Record<YardCharge, string> = {
  DHC: 'Depot handling charge',
  CDMS_ADMIN_FEE: 'CDMS admin fee',
  DEPOT_SURCHARGE: 'Depot surcharge',
};

/** One charge, at one yard, from one date. */
export interface YardRate {
  rateId: string;
  yardCode: string;
  charge: YardCharge;
  amount: number;
  /** The first day this amount applies. Dates are ISO, yyyy-mm-dd. */
  effectiveFrom: string;
  /** Anything the figure alone cannot say. */
  remarks: string | null;
  recordedBy: string;
  recordedAt: string;
}

/**
 * The amount in force on a given day.
 *
 * The latest rate that had already started. A rate dated in the future is not
 * in force yet and is deliberately not returned: somebody entering next
 * quarter's increase early should not change this quarter's answer.
 *
 * Returns null when the yard has no rate on file at all, which is a real state
 * — most of these were never written down anywhere before now — and is not the
 * same as a rate of zero.
 */
export function rateOn(
  rates: readonly YardRate[], yardCode: string, charge: YardCharge, on: string,
): YardRate | null {
  const started = rates
    .filter((r) => r.yardCode === yardCode && r.charge === charge && r.effectiveFrom <= on)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return started.length ? started[started.length - 1]! : null;
}

/**
 * Every charge for one yard as at a date, for a screen that shows a yard.
 *
 * Charges with nothing on file are present and null rather than missing, so
 * the screen shows the gap. A yard whose CDMS fee nobody has recorded is a
 * question worth seeing, and dropping the row hides it.
 */
export function ratesOn(
  rates: readonly YardRate[], yardCode: string, on: string,
): Record<YardCharge, YardRate | null> {
  return {
    DHC: rateOn(rates, yardCode, 'DHC', on),
    CDMS_ADMIN_FEE: rateOn(rates, yardCode, 'CDMS_ADMIN_FEE', on),
    DEPOT_SURCHARGE: rateOn(rates, yardCode, 'DEPOT_SURCHARGE', on),
  };
}

/**
 * What changed, most recent first, for one charge at one yard.
 *
 * Including anything dated ahead: the history screen is where somebody checks
 * that next month's increase was entered, and hiding it until it bites is the
 * opposite of useful.
 */
export function rateHistory(
  rates: readonly YardRate[], yardCode: string, charge: YardCharge,
): YardRate[] {
  return rates
    .filter((r) => r.yardCode === yardCode && r.charge === charge)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

/**
 * Why a proposed rate cannot be saved, or null.
 *
 * Deliberately permits a date in the past. A yard that raised its charge three
 * weeks ago and told nobody is the ordinary case, and refusing to record it
 * would mean the only way to enter the truth is to enter it wrongly.
 */
export function rateProblem(draft: { amount: number; effectiveFrom: string }): string | null {
  if (!Number.isFinite(draft.amount)) return 'An amount is required.';
  if (draft.amount < 0) return 'An amount cannot be negative.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveFrom)) {
    return 'A start date is required, as yyyy-mm-dd.';
  }
  return null;
}
