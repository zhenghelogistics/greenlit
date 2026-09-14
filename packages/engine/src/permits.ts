/**
 * §24. Import permits.
 *
 * A permit belongs to the shipment, not to a container. The file is held once
 * at job level and containers hold references to it, because the same permit
 * routinely covers several boxes and copying the document against each one
 * makes five records that can disagree with each other.
 *
 * The relationship is many-to-many in both directions: one permit can cover
 * every container on the job, or a chosen few; and one container can need more
 * than one permit. That is why a container holds a list rather than a
 * permitNumber field.
 *
 * A permit is not a gate. Portnet release is what actually stops a collection;
 * an incomplete permit warns and stays visible, and the job proceeds. Operations
 * were explicit about this — treating the permit as blocking would stop work
 * that is legitimately allowed to continue.
 */

/**
 * Singapore Customs permit numbers.
 *
 * Two prefixes, then a digit, a letter, six digits and a check letter:
 * IG6I728642H. Validating the shape catches a transposed character at the
 * point it is typed rather than at the counter, which is where it would
 * otherwise be caught — with the container already on a truck.
 *
 * A permit that fails this is not rejected. The shape is a strong hint and not
 * a rule we own: Customs can issue a format we have not seen, and refusing a
 * real permit is worse than accepting a mistyped one that the vessel and
 * expiry checks will still scrutinise.
 */
const PERMIT_NUMBER = /^(IG|ME)\d[A-Z]\d{6}[A-Z]$/;

export function normalisePermitNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function permitNumberLooksValid(value: string): boolean {
  return PERMIT_NUMBER.test(normalisePermitNumber(value));
}

/** §24. What a check can say. Three states, because "not yet known" is real. */
export type PermitCheck = 'VALID' | 'ATTENTION' | 'REVIEW';

export interface PermitRecord {
  permitId: string;
  permitNumber: string | null;
  expiryDate: string | null;
  /** The vessel and voyage the permit was issued against, as read or typed. */
  permitVesselVoyage: string | null;
  fileName: string | null;
  linkedContainerIds: readonly string[];
}

export interface PermitVerdict {
  vessel: PermitCheck;
  expiry: PermitCheck;
  numberFormat: PermitCheck;
  /** The worst of the three: one failure makes the permit need attention. */
  overall: PermitCheck;
  /** What is wrong, in the words a controller would use. Empty when valid. */
  issues: readonly string[];
}

/**
 * Vessel and voyage, compared the way a person compares them.
 *
 * "CALLAO BRIDGE / 256S" and "CALLAO BRIDGE 256S" are the same sailing written
 * two ways; only the letters and digits carry meaning, so punctuation, spacing
 * and case are removed before comparing. What survives is the difference that
 * matters — 256S against 257S is a different voyage and a permit that does not
 * cover this one.
 */
function sameSailing(a: string, b: string): boolean {
  const key = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return key(a) === key(b) && key(a).length > 0;
}

const worst = (checks: readonly PermitCheck[]): PermitCheck =>
  checks.includes('ATTENTION') ? 'ATTENTION'
    : checks.includes('REVIEW') ? 'REVIEW' : 'VALID';

/**
 * §24. Check a permit against the shipment it is attached to.
 *
 * Pure, and deliberately re-run rather than stored: when a vessel is amended
 * or an ETA moves, every permit on that job is checked again from scratch. A
 * stored verdict would stay green after the sailing it was issued against had
 * been replaced, which is the exact failure this is here to prevent.
 *
 * It flags; it never edits. Whether an amended permit is needed is an
 * operational decision, and the system's job is to make sure nobody discovers
 * the problem at the counter.
 */
export function checkPermit(
  permit: PermitRecord,
  shipment: { vesselName: string | null; voyageNumber: string | null; eta: string | null },
): PermitVerdict {
  const issues: string[] = [];

  // ---- The number's shape -------------------------------------------------
  let numberFormat: PermitCheck = 'REVIEW';
  if (permit.permitNumber) {
    numberFormat = permitNumberLooksValid(permit.permitNumber) ? 'VALID' : 'ATTENTION';
    if (numberFormat === 'ATTENTION') {
      issues.push(
        `Permit number ${permit.permitNumber} is not the usual shape `
        + '(IG or ME, a digit, a letter, six digits, a letter). Check it against the permit.',
      );
    }
  }

  // ---- The sailing it was issued against ----------------------------------
  const shipmentSailing = [shipment.vesselName, shipment.voyageNumber]
    .filter(Boolean).join(' ');
  let vessel: PermitCheck = 'REVIEW';
  if (permit.permitVesselVoyage && shipmentSailing) {
    vessel = sameSailing(permit.permitVesselVoyage, shipmentSailing) ? 'VALID' : 'ATTENTION';
    if (vessel === 'ATTENTION') {
      issues.push(
        `Permit covers ${permit.permitVesselVoyage}, but this job sails on `
        + `${shipmentSailing}. An amended permit is probably needed.`,
      );
    }
  }

  // ---- Whether it is still valid on arrival --------------------------------
  //
  // Strictly later than the ETA, not equal to it. A permit expiring on the day
  // the vessel arrives leaves no time to present it, and operations were
  // explicit that the same date is not sufficient.
  let expiry: PermitCheck = 'REVIEW';
  if (permit.expiryDate && shipment.eta) {
    const expires = permit.expiryDate.slice(0, 10);
    const arrives = shipment.eta.slice(0, 10);
    expiry = expires > arrives ? 'VALID' : 'ATTENTION';
    if (expiry === 'ATTENTION') {
      issues.push(expires === arrives
        ? `Permit expires ${expires}, the same day the vessel arrives. It must outlast the arrival.`
        : `Permit expired ${expires}, before the vessel arrives on ${arrives}.`);
    }
  }

  return {
    vessel, expiry, numberFormat,
    overall: worst([vessel, expiry, numberFormat]),
    issues,
  };
}

/** Every container on the job that no permit covers. */
export function containersWithoutPermit(
  permits: readonly PermitRecord[],
  containerIds: readonly string[],
): readonly string[] {
  const covered = new Set(permits.flatMap((p) => p.linkedContainerIds));
  return containerIds.filter((id) => !covered.has(id));
}
